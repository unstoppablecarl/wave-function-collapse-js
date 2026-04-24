import { IterationResult } from '@unstoppablecarl/wfc-js'
import { type Color32 } from 'pixel-data-js'
import { makeDirtyCheck } from '../../util/DirtyCheck.ts'
import { makeMulberry32 } from '../../util/mulberry32.ts'
import { getPatternHash, getPatternsFromIndexedImage } from '../../util/pattern.ts'
import { generateSymmetries } from '../../util/symmetry.ts'
import type { ConvChainModel, ConvChainCreator, ConvChainModelOptions } from '../ConvChainModel.ts'

// Small weight for unseen patterns — keeps penalties on the same log scale as
// seen-pattern weights (log(count)) rather than a hard floor that freezes the chain.
const EPS = 0.1

export const makeConvChainModelPatch: ConvChainCreator = async (
  {
    width,
    height,
    N,
    temperature,
    maxIterations,
    indexedImage,
    seed,
    symmetry,
    periodicInput,
    guidanceField,
    guidanceWeight = 2.0,
    initialPatchCount = 4,
    initialPatchSize = 4,
  }: ConvChainModelOptions,
): Promise<ConvChainModel> => {
  const totalCells = width * height
  const field = new Int32Array(totalCells)
  const prng = makeMulberry32(seed)

  let iteration = 0
  let iteration_i = 0
  let changesInCurrentPass = 0
  let isStable = false
  let stabilityHistorySum = 0
  let historyIdx = 0

  const palette32 = indexedImage.palette
  const sourceData = indexedImage.data
  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const stabilityHistory = new Uint8Array(totalCells)
  const patternWeights = new Map<bigint, number>()
  const shuffledCells = new Int32Array(totalCells)
  const numColors = palette32.length

  // Pre-allocated buffer for Gibbs sampling
  const colorLogWeights = new Float64Array(numColors)

  // Frontier: cells adjacent to recently-changed cells, processed before the
  // regular sweep so valid structure propagates outward from seeds immediately
  // rather than waiting for the random sweep to reach those cells.
  const inFrontier = new Uint8Array(totalCells)
  let frontierQueue: number[] = []
  let frontierHead = 0

  const addToFrontier = (cellIdx: number) => {
    if (!inFrontier[cellIdx]) {
      inFrontier[cellIdx] = 1
      frontierQueue.push(cellIdx)
    }
  }

  // Enqueue all cells whose NxN patches overlap (cx, cy) — the (2N-1)×(2N-1)
  // neighborhood.  Any of those cells could benefit from a Gibbs update now
  // that (cx, cy) has changed.
  const enqueueNeighborhood = (cx: number, cy: number) => {
    for (let dy = -(N - 1); dy <= N - 1; dy++) {
      for (let dx = -(N - 1); dx <= N - 1; dx++) {
        const nx = ((cx + dx) % width + width) % width
        const ny = ((cy + dy) % height + height) % height
        addToFrontier(ny * width + nx)
      }
    }
  }

  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (cellIndex) => {
    const colorIndex = field[cellIndex]!
    return palette32[colorIndex]! as Color32
  })

  const patchBuffer = new Int32Array(N * N)
  const getHashAt = (data: Int32Array, x: number, y: number, w: number, h: number): bigint => {
    for (let dy = 0; dy < N; dy++) {
      const row = ((y + dy + h) % h) * w
      for (let dx = 0; dx < N; dx++) {
        patchBuffer[dx + dy * N] = data[row + (x + dx + w) % w]!
      }
    }
    return getPatternHash(patchBuffer)
  }

  const basePatterns = getPatternsFromIndexedImage(indexedImage, N, periodicInput)
  for (const basePatch of basePatterns) {
    for (const sym of generateSymmetries(basePatch, N, symmetry, true)) {
      const currentWeight = patternWeights.get(sym.hash) || 0
      patternWeights.set(sym.hash, currentWeight + 1)
    }
  }

  // Fill with random noise, then stamp valid source patches as seeds.
  // Noise alone gives no energy gradient; the stamps give the Gibbs sampler
  // valid anchor regions to grow from.  Their borders are seeded into the
  // frontier so propagation starts immediately.
  for (let i = 0; i < totalCells; i++) {
    shuffledCells[i] = i
    field[i] = (prng() * numColors) | 0
    markDirty(i)
  }

  for (let p = 0; p < initialPatchCount; p++) {
    const ox = (prng() * width) | 0
    const oy = (prng() * height) | 0
    const sx = (prng() * sourceWidth) | 0
    const sy = (prng() * sourceHeight) | 0
    for (let dy = 0; dy < initialPatchSize; dy++) {
      for (let dx = 0; dx < initialPatchSize; dx++) {
        const fx = (ox + dx) % width
        const fy = (oy + dy) % height
        field[fy * width + fx] = sourceData[(sy + dy) % sourceHeight * sourceWidth + (sx + dx) % sourceWidth]!
        markDirty(fy * width + fx)
      }
    }
    // Seed the frontier from the full neighborhood of each stamped cell so
    // the Gibbs sampler immediately propagates outward from the valid region.
    for (let dy = 0; dy < initialPatchSize; dy++) {
      for (let dx = 0; dx < initialPatchSize; dx++) {
        enqueueNeighborhood((ox + dx) % width, (oy + dy) % height)
      }
    }
  }

  // Core Gibbs update for one cell.  Returns 1 if the cell value changed.
  const updateCell = (idx: number): 0 | 1 => {
    const tx = idx % width
    const ty = (idx / width) | 0
    const oldVal = field[idx]!
    const progress = 1 - iteration / maxIterations
    const t = temperature * progress

    let maxLogW = -Infinity
    for (let c = 0; c < numColors; c++) {
      field[idx] = c
      let logW = 0
      for (let dy = 1 - N; dy <= 0; dy++) {
        for (let dx = 1 - N; dx <= 0; dx++) {
          const h = getHashAt(field, tx + dx, ty + dy, width, height)
          const pw = patternWeights.get(h) || 0
          logW += Math.log(pw > 0 ? pw : EPS)
        }
      }
      if (guidanceField && c === guidanceField[idx]) {
        logW += guidanceWeight
      }
      colorLogWeights[c] = logW
      if (logW > maxLogW) maxLogW = logW
    }
    field[idx] = oldVal

    let sum = 0
    for (let c = 0; c < numColors; c++) {
      const p = Math.exp((colorLogWeights[c] - maxLogW) / t)
      colorLogWeights[c] = p
      sum += p
    }

    let r = prng() * sum
    let newVal = numColors - 1
    for (let c = 0; c < numColors; c++) {
      r -= colorLogWeights[c]
      if (r <= 0) { newVal = c; break }
    }

    if (oldVal !== newVal) {
      field[idx] = newVal
      markDirty(idx)
      return 1
    }
    return 0
  }

  const recordFlip = (flipped: 0 | 1) => {
    stabilityHistorySum -= stabilityHistory[historyIdx]!
    stabilityHistory[historyIdx] = flipped
    stabilityHistorySum += flipped
    historyIdx = (historyIdx + 1) % totalCells
  }

  const step = (): IterationResult => {
    if (isStable || iteration >= maxIterations) {
      return IterationResult.SUCCESS
    }

    // Drain frontier first — these cells border recently-changed regions and are
    // the most likely to benefit from an update.  This propagates valid structure
    // outward without wasting steps on cells deep in unresolved noise.
    if (frontierHead < frontierQueue.length) {
      const idx = frontierQueue[frontierHead]!
      frontierHead++
      inFrontier[idx] = 0

      // Compact consumed prefix to keep memory bounded on long runs.
      if (frontierHead > 4096) {
        frontierQueue = frontierQueue.slice(frontierHead)
        frontierHead = 0
      }

      const flipped = updateCell(idx)
      if (flipped) {
        enqueueNeighborhood(idx % width, (idx / width) | 0)
        changesInCurrentPass++
      }
      recordFlip(flipped)
      return IterationResult.STEP
    }

    // Regular shuffled sweep — advances iteration_i, drives temperature
    // cooling and the convergence check.
    const idx = shuffledCells[iteration_i]!
    const flipped = updateCell(idx)
    if (flipped) {
      enqueueNeighborhood(idx % width, (idx / width) | 0)
      changesInCurrentPass++
    }
    recordFlip(flipped)
    iteration_i++

    if (iteration_i >= totalCells) {
      const t = temperature * (1 - iteration / maxIterations)
      if (changesInCurrentPass === 0 && t < 0.05) {
        isStable = true
        return IterationResult.SUCCESS
      }
      iteration_i = 0
      iteration++
      changesInCurrentPass = 0
      for (let i = totalCells - 1; i > 0; i--) {
        const j = (prng() * (i + 1)) | 0
        const tmp = shuffledCells[i]!
        shuffledCells[i] = shuffledCells[j]!
        shuffledCells[j] = tmp
      }
    }
    return IterationResult.STEP
  }

  return {
    step,
    getIteration: () => iteration,
    getProgress: () => (iteration + iteration_i / totalCells) / maxIterations,
    getStabilityPercent: () => 1 - (stabilityHistorySum / totalCells),
    getVisualBuffer,
  }
}
