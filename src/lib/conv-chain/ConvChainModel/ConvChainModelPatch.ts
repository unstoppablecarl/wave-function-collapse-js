import { IterationResult } from '../../_types.ts'
import { makeDirtyCheck } from '../../util/DirtyCheck.ts'
import { makeMulberry32 } from '../../util/mulberry32.ts'
import { generateSymmetries } from '../../util/symmetry.ts'
import { getPatternHash } from '../../wfc/WFCRuleset.ts'
import type { ConvChain, ConvChainCreator, ConvChainOptions } from '../ConvChain.ts'

export const makeConvChainModelPatch: ConvChainCreator = async (
  {
    width,
    height,
    N,
    temperature,
    maxIterations,
    indexedImage,
    seed,
    symmetry
  }: ConvChainOptions,
): Promise<ConvChain> => {
  const totalCells = width * height
  const field = new Int32Array(totalCells)
  const prng = makeMulberry32(seed)

  let iteration = 0
  let pixelIndex = 0
  let changesInCurrentPass = 0
  let isStable = false
  let stabilityHistorySum = 0
  let historyIdx = 0

  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const sourceData = indexedImage.data
  const palette32 = indexedImage.palette

  const stabilityHistory = new Uint8Array(totalCells)
  const weights = new Map<bigint, number>()
  const indices = new Int32Array(totalCells)

  // Initialize Dirty Check utility
  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (i) => {
    return palette32[field[i]!]!
  })

  const getHashAt = (data: Int32Array, x: number, y: number, w: number, h: number): bigint => {
    const patch = new Int32Array(N * N)
    for (let dy = 0; dy < N; dy++) {
      const row = ((y + dy + h) % h) * w
      for (let dx = 0; dx < N; dx++) {
        patch[dx + dy * N] = data[row + (x + dx + w) % w]!
      }
    }
    return getPatternHash(patch)
  }

  // Pre-process patterns
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const basePatch = new Int32Array(N * N)
      for (let py = 0; py < N; py++) {
        const sy = (y + py) % sourceHeight
        const row = sy * sourceWidth
        for (let px = 0; px < N; px++) {
          const sx = (x + px) % sourceWidth
          basePatch[px + py * N] = sourceData[row + sx]!
        }
      }
      for (const sym of generateSymmetries(basePatch, N, symmetry)) {
        weights.set(sym.hash, (weights.get(sym.hash) || 0) + 1)
      }
    }
  }

  // Initial field population
  for (let i = 0; i < totalCells; i++) {
    indices[i] = i
    field[i] = sourceData[(prng() * sourceData.length) | 0]!
    markDirty(i)
  }

  const step = (): IterationResult => {
    if (isStable || iteration >= maxIterations) {
      return IterationResult.SUCCESS
    }
    const t = temperature * Math.pow(1 - iteration / maxIterations, 2)
    const idx = indices[pixelIndex]!
    const tx = idx % width
    const ty = (idx / width) | 0
    const oldVal = field[idx]!
    const newVal = sourceData[(prng() * sourceData.length) | 0]!
    let flipped = 0

    if (oldVal !== newVal) {
      if (t < 0.01 && prng() > 0.1) {
        // High stability skip
      } else {
        let delta = 0
        for (let dy = 1 - N; dy <= 0; dy++) {
          for (let dx = 1 - N; dx <= 0; dx++) {
            const hOld = getHashAt(field, tx + dx, ty + dy, width, height)
            field[idx] = newVal
            const hNew = getHashAt(field, tx + dx, ty + dy, width, height)
            field[idx] = oldVal
            const wOld = weights.get(hOld) || 0
            const wNew = weights.get(hNew) || 0
            delta += (wNew > 0 ? Math.log(wNew) : -10) - (wOld > 0 ? Math.log(wOld) : -10)
          }
        }
        if (delta >= 0 || (t > 0 && Math.exp(delta / t) > prng())) {
          field[idx] = newVal
          markDirty(idx)
          changesInCurrentPass++
          flipped = 1
        }
      }
    }

    stabilityHistorySum -= stabilityHistory[historyIdx]!
    stabilityHistory[historyIdx] = flipped
    stabilityHistorySum += flipped
    historyIdx = (historyIdx + 1) % totalCells
    pixelIndex++

    if (pixelIndex >= totalCells) {
      if (changesInCurrentPass === 0 && t < 0.05) {
        isStable = true
        return IterationResult.SUCCESS
      }
      pixelIndex = 0
      iteration++
      changesInCurrentPass = 0
      for (let i = totalCells - 1; i > 0; i--) {
        const j = (prng() * (i + 1)) | 0
        const temp = indices[i]!
        indices[i] = indices[j]!
        indices[j] = temp
      }
    }
    return IterationResult.STEP
  }

  return {
    step,
    getIteration: () => iteration,
    getProgress: () => (iteration + pixelIndex / totalCells) / maxIterations,
    getStabilityPercent: () => 1 - (stabilityHistorySum / totalCells),
    getVisualBuffer,
  }
}