import { IterationResult } from '../../_types.ts'
import { makeMulberry32 } from '../../util/mulberry32.ts'
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
  }: ConvChainOptions,
): Promise<ConvChain> => {
  const totalCells = width * height
  const field = new Int32Array(totalCells)
  const prng = makeMulberry32(seed)

  let iteration = 0
  let pixelIndex = 0
  let changesInCurrentPass = 0
  let isStable = false

  const stabilityHistory = new Uint8Array(totalCells)
  let stabilityHistorySum = 0
  let historyIdx = 0

  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const sourceData = indexedImage.data
  const palette32 = indexedImage.palette
  const weights = new Map<number, number>()

  const indices = new Int32Array(totalCells)
  for (let i = 0; i < totalCells; i++) {
    indices[i] = i
  }

  const getHash = (data: Int32Array, x: number, y: number, w: number, h: number): number => {
    let hCode = 0
    for (let dy = 0; dy < N; dy++) {
      const row = ((y + dy + h) % h) * w
      for (let dx = 0; dx < N; dx++) {
        hCode = (hCode << 5) - hCode + data[row + (x + dx + w) % w]!
        hCode |= 0
      }
    }
    return hCode
  }

  // Pre-process patterns (including 8 symmetries)
  let currSrc = new Int32Array(sourceData)
  for (let i = 0; i < 4; i++) {
    for (let y = 0; y < sourceHeight; y++) {
      for (let x = 0; x < sourceWidth; x++) {
        const h = getHash(currSrc, x, y, sourceWidth, sourceHeight)
        weights.set(h, (weights.get(h) || 0) + 1)
      }
    }
    const next = new Int32Array(sourceWidth * sourceHeight)
    for (let y = 0; y < sourceHeight; y++) {
      for (let x = 0; x < sourceWidth; x++) {
        next[x * sourceHeight + (sourceHeight - 1 - y)] = currSrc[y * sourceWidth + x]!
      }
    }
    currSrc = next
  }

  const pixelBuffer = new Uint32Array(totalCells)
  const dirtyFlags = new Uint8Array(totalCells)
  const changedCells = new Int32Array(totalCells)
  let changedCount = 0

  const markDirty = (idx: number) => {
    if (dirtyFlags[idx] === 0) {
      dirtyFlags[idx] = 1
      changedCells[changedCount++] = idx
    }
  }

  for (let i = 0; i < totalCells; i++) {
    field[i] = sourceData[(prng() * sourceData.length) | 0]!
    markDirty(i)
  }

  const step = (): IterationResult => {
    if (isStable || iteration >= maxIterations) return IterationResult.SUCCESS

    const t = temperature * Math.pow(1 - iteration / maxIterations, 2)
    const idx = indices[pixelIndex]!
    const tx = idx % width
    const ty = (idx / width) | 0

    const oldVal = field[idx]!
    const newVal = sourceData[(prng() * sourceData.length) | 0]!
    let flipped = 0

    if (oldVal !== newVal) {
      // 1. Quick rejection: At very high stability/low temp,
      // most flips are mathematically doomed.
      // We only calculate if the random threshold is even met for a neutral delta.
      if (t < 0.01 && prng() > 0.1) {
        // Skip expensive check if the 'vibe' is already stable
      } else {
        let delta = 0
        for (let dy = 1 - N; dy <= 0; dy++) {
          for (let dx = 1 - N; dx <= 0; dx++) {
            const hOld = getHash(field, tx + dx, ty + dy, width, height)
            field[idx] = newVal
            const hNew = getHash(field, tx + dx, ty + dy, width, height)
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
    getVisualBuffer: () => {
      for (let i = 0; i < changedCount; i++) {
        const idx = changedCells[i]!
        pixelBuffer[idx] = palette32[field[idx]!]!
        dirtyFlags[idx] = 0
      }
      changedCount = 0
      const out = new Uint8ClampedArray(totalCells * 4)
      const view = new Uint32Array(out.buffer)
      view.set(pixelBuffer)
      return out
    },
  }
}