import { IterationResult } from '@unstoppablecarl/wfc-js'
import { type Color32 } from 'pixel-data-js'
import { makeDirtyCheck } from '../../../lib/util/DirtyCheck.ts'
import { makeMulberry32 } from '../../../lib/util/mulberry32.ts'
import { makeSymmetricSource } from '../SymmetricSource.ts'
import type { TextureSynthesisCreator } from '../TextureSynthesisModel.ts'

// Harrison resynthesis. (polish + 1) passes over a shuffled output. Each cell's
// origin is updated by argmax over: (a) one prediction from each of the up-to-8
// nearest filled neighbours (their origin shifted to this cell), and (b) M
// random source positions. Multi-round + random candidates is what lets it
// escape locally-coherent-but-globally-wrong configurations.

export const makeTextureSynthesisModelHarrison: TextureSynthesisCreator = async (
  {
    width,
    height,
    N,
    M,
    polish,
    indexedImage,
    symmetry,
    seed,
  }) => {
  const totalCells = width * height
  const SW = indexedImage.width, SH = indexedImage.height
  const { data: sourceData, nSyms } = makeSymmetricSource(indexedImage.data, SW, SH, symmetry)
  const blockSize = SW * SH
  const sourceArea = nSyms * blockSize
  const palette32 = indexedImage.palette
  let flippedThisRound = 0
  let flippedLastRound = totalCells

  const result = new Int32Array(totalCells)
  const origins = new Int32Array(totalCells).fill(-1)
  const prng = makeMulberry32(seed)

  const shuffle = new Int32Array(totalCells)
  for (let i = 0; i < totalCells; i++) shuffle[i] = i
  for (let i = totalCells - 1; i > 0; i--) {
    const j = (prng() * (i + 1)) | 0
    const t = shuffle[i]!
    shuffle[i] = shuffle[j]!
    shuffle[j] = t
  }

  const NEIGHBOR_COUNT = 8
  const neighbors = new Int32Array(NEIGHBOR_COUNT)
  const candidates = new Int32Array(NEIGHBOR_COUNT + M)

  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (idx) => {
    return palette32[result[idx]!]! as Color32
  })

  // Walk concentric rings around (fx,fy), four cursors per ring (one per side),
  // collecting up to k filled cells. Matches mxgmn's expansion pattern.
  const findFilledNeighbors = (fx: number, fy: number, k: number): number => {
    if (k === 0) return 0
    let found = 0
    const maxR = Math.max(width, height)
    for (let r = 1; r <= maxR; r++) {
      // walks down left edge
      let x0 = fx - r
      let y0 = fy - r
      // walks right along bottom
      let x1 = fx - r
      let y1 = fy + r
      // walks up right edge
      let x2 = fx + r
      let y2 = fy + r
      // walks left along top
      let x3 = fx + r
      let y3 = fy - r
      const len = 2 * r
      for (let s = 0; s < len; s++) {
        if (found < k) {
          const p = (((y0 % height) + height) % height) * width + (((x0 % width) + width) % width)
          if (origins[p]! !== -1) neighbors[found++] = p
        }
        if (found < k) {
          const p = (((y1 % height) + height) % height) * width + (((x1 % width) + width) % width)
          if (origins[p]! !== -1) neighbors[found++] = p
        }
        if (found < k) {
          const p = (((y2 % height) + height) % height) * width + (((x2 % width) + width) % width)
          if (origins[p]! !== -1) neighbors[found++] = p
        }
        if (found < k) {
          const p = (((y3 % height) + height) % height) * width + (((x3 % width) + width) % width)
          if (origins[p]! !== -1) neighbors[found++] = p
        }
        y0++
        x1++
        y2--
        x3--
      }
      if (found >= k) return found
    }
    return found
  }

  // Full (non-causal) neighbourhood score: N x N around (fx,fy), against the
  // candidate (sx,sy) in source. Tie-break with tiny noise.
  const scoreCandidate = (cand: number, fx: number, fy: number): number => {
    let sum = 1e-6 * prng()
    const tBase = ((cand / blockSize) | 0) * blockSize
    const local = cand - tBase
    const sx = local % SW, sy = (local / SW) | 0

    for (let dy = -N; dy <= N; dy++) {
      for (let dx = -N; dx <= N; dx++) {
        if (dx === 0 && dy === 0) continue
        const fx2 = ((fx + dx) % width + width) % width
        const fy2 = ((fy + dy) % height + height) % height
        const oRef = origins[fy2 * width + fx2]!
        if (oRef === -1) continue
        const sx2 = ((sx + dx) % SW + SW) % SW
        const sy2 = ((sy + dy) % SH + SH) % SH
        sum += sourceData[tBase + sy2 * SW + sx2]! === sourceData[oRef]! ? 1 : -1
      }
    }
    return sum
  }

  let round = 0
  let counter = 0
  let totalSteps = 0
  const totalStepsTarget = (polish + 1) * totalCells

  const synthesizeCell = (f: number): void => {
    const fx = f % width
    const fy = (f / width) | 0
    const wantNeighbours = round > 0 ? NEIGHBOR_COUNT : Math.min(NEIGHBOR_COUNT, counter)
    const found = findFilledNeighbors(fx, fy, wantNeighbours)

    let nCand = 0
    for (let n = 0; n < found; n++) {
      const np = neighbors[n]!
      const origin = origins[np]!
      const tBase = ((origin / blockSize) | 0) * blockSize
      const localOrigin = origin - tBase
      const dxOff = fx - (np % width)
      const dyOff = fy - ((np / width) | 0)
      const cx = (((localOrigin % SW) + dxOff) % SW + SW) % SW
      const cy = ((((localOrigin / SW) | 0) + dyOff) % SH + SH) % SH
      candidates[nCand++] = tBase + cy * SW + cx
    }
    for (let m = 0; m < M; m++) candidates[nCand++] = (prng() * sourceArea) | 0

    let bestScore = -Infinity
    let bestCand = candidates[0]!
    for (let c = 0; c < nCand; c++) {
      const cand = candidates[c]!
      const s = scoreCandidate(cand, fx, fy)
      if (s > bestScore) {
        bestScore = s
        bestCand = cand
      }
    }
    if (origins[f] !== bestCand) flippedThisRound++
    origins[f] = bestCand
    result[f] = sourceData[bestCand]!
    markDirty(f)
  }

  const step = (): IterationResult => {
    if (round > polish) return IterationResult.SUCCESS
    synthesizeCell(shuffle[counter]!)
    counter++
    totalSteps++
    if (counter >= totalCells) {
      flippedLastRound = flippedThisRound
      flippedThisRound = 0
      counter = 0
      round++
    }
    return round > polish ? IterationResult.SUCCESS : IterationResult.STEP
  }

  return {
    step,
    getIteration: () => round,
    getProgress: () => Math.min(totalSteps / totalStepsTarget, 1),
    getStabilityPercent: () => 1 - flippedLastRound / totalCells,
    getVisualBuffer,
  }
}