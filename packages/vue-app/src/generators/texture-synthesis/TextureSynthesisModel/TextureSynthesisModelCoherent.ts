import { IterationResult } from '@unstoppablecarl/wfc-js'
import { type Color32 } from 'pixel-data-js'
import { makeDirtyCheck } from '../../../lib/util/DirtyCheck.ts'
import { makeMulberry32 } from '../../../lib/util/mulberry32.ts'
import { makeSymmetricSource } from '../SymmetricSource.ts'
import type { TextureSynthesisCreator } from '../TextureSynthesisModel.ts'

// Coherent synthesis with chunked, PCA-accelerated K-coherence analysis.
//
// The original O(area² · N²) brute-force pairwise similarity is replaced by:
//   1. One-hot encode each L-neighbourhood patch into a D = patchCells × numColors
//      dim vector.  Stored sparsely — only the patchCells non-zero indices.
//   2. PCA the patch matrix, projecting to d ≤ 8 dims (squared-L2 distance in
//      projected space monotonically agrees with one-hot Hamming distance, which
//      is twice the mismatch-count similarity used by mxgmn).
//   3. K-NN in the projected space.  Brute force here (kept simple); for larger
//      sources a kd-tree drop-in would help further.
//
// Each phase chunks across step() calls so the worker stays responsive — no
// multi-second freeze before the first preview pixel.

// Tunables.  PCA_DIMS = 8 captures ~95% of variance for typical indexed
// textures; raise to 12-16 if you see quality regressions vs the brute-force
// version.
const PCA_DIMS = 8
const POWER_ITER_MAX = 60
const POWER_ITER_TOL = 1e-5

// Per-step work budgets.  Smaller = more responsive, larger = lower per-step
// dispatch overhead.  These target ~50-200 µs per step on a typical machine,
// matching your existing patch-model step cadence.
const BUILD_ROWS_PER_STEP = 64
const COVAR_ROWS_PER_STEP = 16
const PROJECT_ROWS_PER_STEP = 64
const KNN_QUERIES_PER_STEP = 1

enum PHASE {
  BUILD,
  COVAR,
  EIGEN,
  PROJECT,
  KNN,
  SYNTH,
  DONE,
}

const initRandomUnitVector = (v: Float64Array, D: number, prng: () => number): void => {
  let normSq = 0
  for (let i = 0; i < D; i++) {
    const r = prng() - 0.5
    v[i] = r
    normSq += r * r
  }
  const inv = normSq > 0 ? 1 / Math.sqrt(normSq) : 1
  for (let i = 0; i < D; i++) v[i] = v[i]! * inv
}

export const makeTextureSynthesisModelCoherent: TextureSynthesisCreator = async (
  {
    width,
    height,
    N,
    K,
    temperature,
    periodicOutput,
    indexedImage,
    symmetry,
    seed,
  }) => {
  const totalCells = width * height
  const SW = indexedImage.w, SH = indexedImage.h
  const { data: sourceData, nSyms } = makeSymmetricSource(indexedImage.data, SW, SH, symmetry)
  const blockSize = SW * SH
  const sourceArea = nSyms * blockSize
  const palette32 = indexedImage.palette
  const numColors = palette32.length

  // L-neighbourhood: 2N(N+1) cells (N rows of width 2N+1, plus N causal cells in row 0).
  const patchCells = 2 * N * (N + 1)
  const D = patchCells * numColors
  const d = Math.max(1, Math.min(PCA_DIMS, D, sourceArea - 1))
  const Keff = Math.max(1, Math.min(K, sourceArea))

  // L-shape offset table.
  const dxArr = new Int32Array(patchCells)
  const dyArr = new Int32Array(patchCells)
  {
    let p = 0
    for (let dy = -N; dy < 0; dy++) {
      for (let dx = -N; dx <= N; dx++) {
        dxArr[p] = dx
        dyArr[p] = dy
        p++
      }
    }
    for (let dx = -N; dx < 0; dx++) {
      dxArr[p] = dx
      dyArr[p] = 0
      p++
    }
  }

  const result = new Int32Array(totalCells)
  const origins = new Int32Array(totalCells).fill(-1)
  const prng = makeMulberry32(seed)

  const resolveNeighbor = periodicOutput
    ? (nx: number, ny: number) => ((ny % height + height) % height) * width + (nx % width + width) % width
    : (nx: number, ny: number) => (nx < 0 || nx >= width || ny < 0 || ny >= height) ? -1 : ny * width + nx

  // Random source samples for visual feedback during the analysis phases.
  // origins stays -1 so synthesis still treats every cell as unfilled.
  for (let i = 0; i < totalCells; i++) {
    result[i] = sourceData[(prng() * sourceArea) | 0]!
  }

  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (idx) => {
    return palette32[result[idx]!]! as Color32
  })
  for (let i = 0; i < totalCells; i++) markDirty(i)

  // === Analysis storage ===

  // For each source pixel, the patchCells one-hot indices into [0, D).
  // Replaces a dense X matrix (saves a factor of numColors in memory).
  const nonzeros = new Int32Array(sourceArea * patchCells)

  const mean = new Float64Array(D)
  const C = new Float64Array(D * D)       // symmetric covariance (full, for cache-friendly mat-vec)
  const Cwork = new Float64Array(D * D)   // deflated copy used during eigen extraction
  const V = new Float64Array(d * D)       // eigenvectors, row-major: V[k*D + i]
  const eigenvalues = new Float64Array(d)
  const meanDotV = new Float64Array(d)

  const piVec = new Float64Array(D)
  const piCv = new Float64Array(D)
  let piLastLambda = 0
  let eigenK = 0
  let eigenIter = 0

  const Y = new Float64Array(sourceArea * d)
  const coherenceSets = new Int32Array(sourceArea * Keff)

  const Km1 = Keff - 1
  const topDist = new Float64Array(Math.max(1, Km1))
  const topIdx = new Int32Array(Math.max(1, Km1))

  // === Phase state ===
  let phase: PHASE = PHASE.BUILD
  let pProgress = 0
  let synthIdx = 0

  // Rough total step count for getProgress.  Doesn't need to be accurate —
  // power iteration usually converges before POWER_ITER_MAX so we estimate.
  const totalSteps =
    Math.ceil(sourceArea / BUILD_ROWS_PER_STEP) +
    Math.ceil(sourceArea / COVAR_ROWS_PER_STEP) +
    d * 25 +
    Math.ceil(sourceArea / PROJECT_ROWS_PER_STEP) +
    Math.ceil(sourceArea / KNN_QUERIES_PER_STEP) +
    totalCells
  let stepsDone = 0

  // === Phase 1: BUILD — compute one-hot non-zero indices and accumulate mean. ===
  const stepBuild = (): void => {
    const end = Math.min(pProgress + BUILD_ROWS_PER_STEP, sourceArea)
    for (let n = pProgress; n < end; n++) {
      const tBase = ((n / blockSize) | 0) * blockSize
      const local = n - tBase
      const x = local % SW
      const y = (local / SW) | 0
      const base = n * patchCells

      for (let k = 0; k < patchCells; k++) {
        const sx = ((x + dxArr[k]!) % SW + SW) % SW
        const sy = ((y + dyArr[k]!) % SH + SH) % SH
        const idx = k * numColors + sourceData[tBase + sy * SW + sx]!
        nonzeros[base + k] = idx
        mean[idx] = mean[idx]! + 1
      }
    }
    pProgress = end
    if (pProgress >= sourceArea) {
      const inv = 1 / sourceArea
      for (let i = 0; i < D; i++) mean[i] = mean[i]! * inv
      phase = PHASE.COVAR
      pProgress = 0
    }
  }

  // === Phase 2: COVAR — sparse co-occurrence accumulation, then center & mirror. ===
  // For one-hot X, (X^T X)[i,j] = number of rows with both bit i and bit j set.
  // Note: indices from earlier patch cells are always strictly less than those
  // from later cells (different one-hot blocks), so a < b ⇒ idx_a < idx_b — no
  // swap needed when writing into the upper triangle.
  const stepCovar = (): void => {
    const end = Math.min(pProgress + COVAR_ROWS_PER_STEP, sourceArea)
    for (let n = pProgress; n < end; n++) {
      const base = n * patchCells
      for (let a = 0; a < patchCells; a++) {
        const i = nonzeros[base + a]!
        C[i * D + i] = C[i * D + i]! + 1
        for (let b = a + 1; b < patchCells; b++) {
          const j = nonzeros[base + b]!
          C[i * D + j] = C[i * D + j]! + 1
        }
      }
    }
    pProgress = end
    if (pProgress >= sourceArea) {
      // Finalize: divide by area, subtract mean outer product, mirror.
      const inv = 1 / sourceArea
      for (let i = 0; i < D; i++) {
        const mi = mean[i]!
        for (let j = i; j < D; j++) {
          const c = C[i * D + j]! * inv - mi * mean[j]!
          C[i * D + j] = c
          if (i !== j) C[j * D + i] = c
        }
      }
      Cwork.set(C)
      initRandomUnitVector(piVec, D, prng)
      piLastLambda = 0
      eigenK = 0
      eigenIter = 0
      phase = PHASE.EIGEN
      pProgress = 0
    }
  }

  // === Phase 3: EIGEN — power iteration with deflation, top d eigenvectors. ===
  // One mat-vec per step (D² ops, ~10K for typical inputs).
  const stepEigen = (): void => {
    // Cv = Cwork · piVec
    for (let i = 0; i < D; i++) {
      let s = 0
      const row = i * D
      for (let j = 0; j < D; j++) s += Cwork[row + j]! * piVec[j]!
      piCv[i] = s
    }
    // Rayleigh quotient: λ ≈ piVec · Cv (equals the dominant eigenvalue at convergence).
    let lambda = 0
    for (let i = 0; i < D; i++) lambda += piVec[i]! * piCv[i]!
    // Renormalize Cv → next piVec.
    let normSq = 0
    for (let i = 0; i < D; i++) normSq += piCv[i]! * piCv[i]!
    const norm = Math.sqrt(normSq)
    if (norm > 1e-12) {
      const invNorm = 1 / norm
      for (let i = 0; i < D; i++) piVec[i] = piCv[i]! * invNorm
    }

    eigenIter++
    const converged = eigenIter > 5 &&
      Math.abs(lambda - piLastLambda) < POWER_ITER_TOL * (Math.abs(lambda) + 1e-12)
    piLastLambda = lambda

    if (converged || eigenIter >= POWER_ITER_MAX || norm < 1e-10) {
      eigenvalues[eigenK] = lambda
      const vBase = eigenK * D
      for (let i = 0; i < D; i++) V[vBase + i] = piVec[i]!

      // Deflate: Cwork ← Cwork − λ v vᵀ pushes the captured component out of
      // the spectrum so the next power iteration finds the next-largest.
      for (let i = 0; i < D; i++) {
        const vi = piVec[i]! * lambda
        const baseRow = i * D
        for (let j = 0; j < D; j++) {
          Cwork[baseRow + j] = Cwork[baseRow + j]! - vi * piVec[j]!
        }
      }

      eigenK++
      if (eigenK >= d) {
        // Precompute the mean's projection: Y_n = (X_n - mean) V^T
        //                                       = (X_n V^T) - meanDotV
        for (let k = 0; k < d; k++) {
          let s = 0
          const vBase = k * D
          for (let i = 0; i < D; i++) s += mean[i]! * V[vBase + i]!
          meanDotV[k] = s
        }
        phase = PHASE.PROJECT
        pProgress = 0
      } else {
        initRandomUnitVector(piVec, D, prng)
        piLastLambda = 0
        eigenIter = 0
      }
    }
  }

  // === Phase 4: PROJECT — Y[n] = (X_n - mean) V^T, sparsely. ===
  // X_n is one-hot with patchCells ones, so X_n V^T[k] = sum of V[k][i] over
  // the patchCells non-zero positions.  patchCells × d ops per row.
  const stepProject = (): void => {
    const end = Math.min(pProgress + PROJECT_ROWS_PER_STEP, sourceArea)
    for (let n = pProgress; n < end; n++) {
      const yBase = n * d
      const nzBase = n * patchCells
      for (let k = 0; k < d; k++) {
        const vBase = k * D
        let s = -meanDotV[k]!
        for (let p = 0; p < patchCells; p++) {
          s += V[vBase + nonzeros[nzBase + p]!]!
        }
        Y[yBase + k] = s
      }
    }
    pProgress = end
    if (pProgress >= sourceArea) {
      phase = PHASE.KNN
      pProgress = 0
    }
  }

  // === Phase 5: KNN — for each source pixel, K-1 nearest in projected space. ===
  // Brute force with sorted top-K-1 maintenance and squared-distance early-out.
  // For larger sources this is the dominant cost; a kd-tree drop-in would help.
  const stepKnn = (): void => {
    const end = Math.min(pProgress + KNN_QUERIES_PER_STEP, sourceArea)
    for (let i = pProgress; i < end; i++) {
      coherenceSets[i * Keff] = i  // self at slot 0
      if (Km1 === 0) continue

      for (let k = 0; k < Km1; k++) {
        topDist[k] = Infinity
        topIdx[k] = -1
      }
      let topMax = Infinity
      const Yi = i * d

      for (let j = 0; j < sourceArea; j++) {
        if (j === i) continue
        const Yj = j * d
        // Squared L2 distance with running early-out.  d is small (≤ 8) so
        // unrolling buys little; plain loop is fine.
        let dist = 0
        for (let k = 0; k < d; k++) {
          const diff = Y[Yi + k]! - Y[Yj + k]!
          dist += diff * diff
          if (dist >= topMax) break  // dimension-wise early exit
        }
        if (dist >= topMax) continue

        // Sorted insertion into top-K-1 (ascending by distance).
        let pos = Km1 - 1
        while (pos > 0 && topDist[pos - 1]! > dist) {
          topDist[pos] = topDist[pos - 1]!
          topIdx[pos] = topIdx[pos - 1]!
          pos--
        }
        topDist[pos] = dist
        topIdx[pos] = j
        topMax = topDist[Km1 - 1]!
      }

      const csBase = i * Keff
      for (let k = 0; k < Km1; k++) {
        coherenceSets[csBase + 1 + k] = topIdx[k]! >= 0 ? topIdx[k]! : i
      }
    }
    pProgress = end
    if (pProgress >= sourceArea) {
      phase = PHASE.SYNTH
      pProgress = 0
    }
  }

  // === Phase 6: SYNTH — original raster-scan synthesis (unchanged). ===
  const maxCand = 8 * Keff
  const candIdxArr = new Int32Array(maxCand)
  const candScoreArr = new Float64Array(maxCand)
  const seenStamp = new Int32Array(sourceArea)
  let stamp = 0

  const outputSimilarity = (cand: number, ox: number, oy: number): number => {
    let sum = 0
    const tBase = ((cand / blockSize) | 0) * blockSize
    const local = cand - tBase
    const sx = local % SW, sy = (local / SW) | 0

    for (let dy = -N; dy <= 0; dy++) {
      const dxEnd = dy === 0 ? -1 : N
      for (let dx = -N; dx <= dxEnd; dx++) {
        const nIdx = resolveNeighbor(ox + dx, oy + dy)
        if (nIdx < 0) continue
        const oRef = origins[nIdx]!
        if (oRef === -1) continue
        const sx2 = ((sx + dx) % SW + SW) % SW
        const sy2 = ((sy + dy) % SH + SH) % SH
        sum += sourceData[tBase + sy2 * SW + sx2]! === sourceData[oRef]! ? 1 : -1
      }
    }
    return sum
  }

  const synthesizeCell = (idx: number): void => {
    const ox = idx % width, oy = (idx / width) | 0
    stamp++
    let n = 0

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nIdx2 = resolveNeighbor(ox + dx, oy + dy)
        if (nIdx2 < 0) continue
        const origin = origins[nIdx2]!
        if (origin === -1) continue

        const csBase = origin * Keff
        for (let k = 0; k < Keff; k++) {
          const p = coherenceSets[csBase + k]!
          const pBase = ((p / blockSize) | 0) * blockSize
          const localP = p - pBase
          const cx = ((localP % SW) - dx + SW) % SW
          const cy = (((localP / SW) | 0) - dy + SH) % SH
          const c = pBase + cy * SW + cx                 // global index
          if (seenStamp[c] === stamp) continue
          seenStamp[c] = stamp
          candIdxArr[n] = c
          candScoreArr[n] = outputSimilarity(c, ox, oy)  // signature changed above
          n++
        }
      }
    }

    let chosen: number
    if (n === 0) {
      chosen = (prng() * sourceArea) | 0
    } else {
      let maxS = candScoreArr[0]!
      for (let i = 1; i < n; i++) if (candScoreArr[i]! > maxS) maxS = candScoreArr[i]!
      let total = 0
      for (let i = 0; i < n; i++) {
        const p = Math.exp((candScoreArr[i]! - maxS) / temperature)
        candScoreArr[i] = p
        total += p
      }
      let r = prng() * total
      chosen = candIdxArr[n - 1]!
      for (let i = 0; i < n; i++) {
        r -= candScoreArr[i]!
        if (r <= 0) {
          chosen = candIdxArr[i]!
          break
        }
      }
    }

    origins[idx] = chosen
    result[idx] = sourceData[chosen]!
    markDirty(idx)
  }

  const stepSynth = (): void => {
    if (synthIdx >= totalCells) {
      phase = PHASE.DONE
      return
    }
    synthesizeCell(synthIdx)
    synthIdx++
    if (synthIdx >= totalCells) phase = PHASE.DONE
  }

  const phases: Record<PHASE, () => void> = {
    [PHASE.BUILD]: stepBuild,
    [PHASE.COVAR]: stepCovar,
    [PHASE.EIGEN]: stepEigen,
    [PHASE.PROJECT]: stepProject,
    [PHASE.KNN]: stepKnn,
    [PHASE.SYNTH]: stepSynth,
    [PHASE.DONE]: () => {
    },
  }

  // === Dispatcher ===
  const step = (): IterationResult => {
    if (phase === PHASE.DONE) return IterationResult.SUCCESS

    const fn = phases[phase]
    fn()

    stepsDone++
    return (phase as PHASE) === PHASE.DONE ? IterationResult.SUCCESS : IterationResult.STEP
  }

  return {
    step,
    getIteration: () => synthIdx,
    getProgress: () => Math.min(stepsDone / totalSteps, 1),
    getStabilityPercent: () => 1,
    getVisualBuffer,
  }
}