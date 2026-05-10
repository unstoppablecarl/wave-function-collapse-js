import { IterationResult } from '@unstoppablecarl/wfc-js'
import { type Color32 } from 'pixel-data-js'
import { makeDirtyCheck } from '../../../lib/util/DirtyCheck.ts'
import { makeMulberry32 } from '../../../lib/util/mulberry32.ts'
import { makeSymmetricSource } from '../SymmetricSource.ts'
import type { TextureSynthesisCreator } from '../TextureSynthesisModel.ts'

// Brute-force search over every source position for each output cell, in raster
// scan order. Slow (O(W*H*SW*SH*N^2)) but the highest-quality baseline and the
// reference for the other variants.

export const makeTextureSynthesisModelFull: TextureSynthesisCreator = async (
  {
    width,
    height,
    N,
    temperature,
    indexedImage,
    symmetry,
    seed,
  }) => {
  const totalCells = width * height
  const SW = indexedImage.width
  const SH = indexedImage.height
  const palette32 = indexedImage.palette
  const { data: sourceData, nSyms } = makeSymmetricSource(indexedImage.data, SW, SH, symmetry)
  const blockSize = SW * SH
  const sourceArea = nSyms * blockSize

  const result = new Int32Array(totalCells)
  const origins = new Int32Array(totalCells).fill(-1)
  const prng = makeMulberry32(seed)

  const candScore = new Float64Array(sourceArea)

  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (idx) => {
    return palette32[result[idx]!]! as Color32
  })

  const synthesizeCell = (idx: number): void => {
    const ox = idx % width
    const oy = (idx / width) | 0

    for (let s = 0; s < sourceArea; s++) {
      const tBase = ((s / blockSize) | 0) * blockSize
      const local = s - tBase
      const sx = local % SW
      const sy = (local / SW) | 0
      let sum = 0
      // L-shaped causal neighbourhood: dy in [-N,0], dx in [-N,N] for dy<0, [-N,-1] for dy=0
      for (let dy = -N; dy <= 0; dy++) {
        const dxEnd = dy === 0 ? -1 : N
        for (let dx = -N; dx <= dxEnd; dx++) {
          const ox2 = ((ox + dx) % width + width) % width
          const oy2 = ((oy + dy) % height + height) % height
          const oRef = origins[oy2 * width + ox2]!
          if (oRef === -1) continue
          const sx2 = ((sx + dx) % SW + SW) % SW
          const sy2 = ((sy + dy) % SH + SH) % SH
          sum += sourceData[tBase + sy2 * SW + sx2]! === sourceData[oRef]! ? 1 : -1
        }
      }
      candScore[s] = sum
    }

    // Numerically stable softmax sample
    let maxS = candScore[0]!
    for (let s = 1; s < sourceArea; s++) if (candScore[s]! > maxS) maxS = candScore[s]!
    let total = 0
    for (let s = 0; s < sourceArea; s++) {
      const p = Math.exp((candScore[s]! - maxS) / temperature)
      candScore[s] = p
      total += p
    }
    let r = prng() * total
    let chosen = sourceArea - 1
    for (let s = 0; s < sourceArea; s++) {
      r -= candScore[s]!
      if (r <= 0) {
        chosen = s
        break
      }
    }

    origins[idx] = chosen
    result[idx] = sourceData[chosen]!
    markDirty(idx)
  }

  let i = 0
  const step = (): IterationResult => {
    if (i >= totalCells) return IterationResult.SUCCESS
    synthesizeCell(i)
    i++
    return i >= totalCells ? IterationResult.SUCCESS : IterationResult.STEP
  }

  return {
    step,
    getIteration: () => i,
    getProgress: () => i / totalCells,
    getStabilityPercent: () => 1,
    getVisualBuffer,
  }
}