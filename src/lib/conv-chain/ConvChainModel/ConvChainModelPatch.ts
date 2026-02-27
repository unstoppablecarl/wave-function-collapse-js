import { type Color32, getIndexedImageColorCounts } from 'pixel-data-js'
import { IterationResult } from '../../_types.ts'
import { makeDirtyCheck } from '../../util/DirtyCheck.ts'
import { makeMulberry32 } from '../../util/mulberry32.ts'
import { getPatternHash, getPatternsFromIndexedImage } from '../../util/pattern.ts'
import { generateSymmetries } from '../../util/symmetry.ts'
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
    symmetry,
    periodicInput,
  }: ConvChainOptions,
): Promise<ConvChain> => {
  const totalCells = width * height
  const field = new Int32Array(totalCells)
  const prng = makeMulberry32(seed)

  let iteration = 0
  let iteration_i = 0
  let changesInCurrentPass = 0
  let isStable = false
  let stabilityHistorySum = 0
  let historyIdx = 0

  const sourceData = indexedImage.data
  const palette32 = indexedImage.palette

  const stabilityHistory = new Uint8Array(totalCells)
  const patternWeights = new Map<bigint, number>()
  const shuffledCells = new Int32Array(totalCells)

  const frequencies = getIndexedImageColorCounts(indexedImage)
  const totalPixels = sourceData.length

  const pickWeightedColor = (): Color32 => {
    let r = prng() * totalPixels
    for (let i = 0; i < frequencies.length; i++) {
      const w = frequencies[i]!
      if (r < w) return i as Color32
      r -= w
    }
    return 0 as Color32
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

  const getEnergyDelta = (idx: number, tx: number, ty: number, oldVal: number, newVal: number): number => {
    let delta = 0
    for (let dy = 1 - N; dy <= 0; dy++) {
      for (let dx = 1 - N; dx <= 0; dx++) {
        const hOld = getHashAt(field, tx + dx, ty + dy, width, height)
        // get hash if newValue used
        field[idx] = newVal
        const hNew = getHashAt(field, tx + dx, ty + dy, width, height)
        // revert old value
        field[idx] = oldVal
        const wOld = patternWeights.get(hOld) || 0
        const wNew = patternWeights.get(hNew) || 0
        const logOld = wOld > 0 ? Math.log(wOld) : -10
        const logNew = wNew > 0 ? Math.log(wNew) : -10
        delta += logNew - logOld
      }
    }
    return delta
  }

  const step = (): IterationResult => {
    if (isStable || iteration >= maxIterations) {
      return IterationResult.SUCCESS
    }

    const progress = 1 - iteration / maxIterations
    const t = temperature * Math.pow(progress, 2)
    const idx = shuffledCells[iteration_i]!
    const tx = idx % width
    const ty = (idx / width) | 0
    const oldVal = field[idx]!
    const newVal = pickWeightedColor()
    let flipped = 0

    if (oldVal !== newVal) {
      if (t < 0.01 && prng() > 0.1) {
        // Skip
      } else {
        const delta = getEnergyDelta(idx, tx, ty, oldVal, newVal)
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
    iteration_i++

    if (iteration_i >= totalCells) {
      if (changesInCurrentPass === 0 && t < 0.05) {
        isStable = true
        return IterationResult.SUCCESS
      }
      iteration_i = 0
      iteration++
      changesInCurrentPass = 0
      for (let i = totalCells - 1; i > 0; i--) {
        const j = (prng() * (i + 1)) | 0
        const temp = shuffledCells[i]!
        shuffledCells[i] = shuffledCells[j]!
        shuffledCells[j] = temp
      }
    }
    return IterationResult.STEP
  }

  const basePatterns = getPatternsFromIndexedImage(indexedImage, N, periodicInput)
  for (const basePatch of basePatterns) {
    for (const sym of generateSymmetries(basePatch, N, symmetry, true)) {
      const currentWeight = patternWeights.get(sym.hash) || 0
      patternWeights.set(sym.hash, currentWeight + 1)
    }
  }

  for (let i = 0; i < totalCells; i++) {
    shuffledCells[i] = i
    field[i] = pickWeightedColor()
    markDirty(i)
  }

  return {
    step,
    getIteration: () => iteration,
    getProgress: () => (iteration + iteration_i / totalCells) / maxIterations,
    getStabilityPercent: () => 1 - (stabilityHistorySum / totalCells),
    getVisualBuffer,
  }
}