import { IterationResult, type RNG } from '../wfc/WFCModel.ts'
import type { ConvChainWorkerOptions } from './ConvChain.worker.ts'

export const createConvChain = (
  {
    width,
    height,
    N,
    temperature,
    maxIterations,
    indexedImage,
    prng,
  }: Omit<ConvChainWorkerOptions, 'seed' | 'previewInterval'> & { prng: RNG },
) => {
  const totalCells = width * height
  const field = new Uint8ClampedArray(totalCells)
  const patternLen = N * N
  const eps = 0.1
  let iteration = 0

  const changedCells = new Int32Array(totalCells)
  let changedCount = 0
  const dirtyFlags = new Uint8Array(totalCells)

  function markDirty(i: number) {
    if (dirtyFlags[i] === 0) {
      dirtyFlags[i] = 1
      changedCells[changedCount++] = i
    }
  }

  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const sourceData = indexedImage.data
  const palette = indexedImage.palette
  const numColors = palette.length / 4

  const pixelBuffer = new Uint32Array(totalCells)
  const patternWindow = new Uint32Array(patternLen)

  const getSampleIndex = (x: number, y: number): number => {
    const px = (x + sourceWidth) % sourceWidth
    const py = (y + sourceHeight) % sourceHeight
    return sourceData[px + py * sourceWidth]!
  }

  const weights = new Map<string, number>()

  const getPatternKey = (
    x: number,
    y: number,
    sym: number,
  ): string => {
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        let tx = dx
        let ty = dy
        if (sym >= 4) {
          tx = N - 1 - tx
        }
        const rot = sym % 4
        for (let r = 0; r < rot; r++) {
          const oldX = tx
          tx = N - 1 - ty
          ty = oldX
        }
        patternWindow[dx + dy * N] = getSampleIndex(x + tx, y + ty)
      }
    }
    return patternWindow.join(',')
  }

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      for (let sym = 0; sym < 8; sym++) {
        const key = getPatternKey(x, y, sym)
        const currentWeight = weights.get(key) || 0
        weights.set(key, currentWeight + 1)
      }
    }
  }

  for (let i = 0; i < totalCells; i++) {
    field[i] = (prng() * numColors) | 0
  }

  const getWeightAt = (i: number, j: number): number => {
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        const fx = (i + dx + width) % width
        const fy = (j + dy + height) % height
        patternWindow[dx + dy * N] = field[fx + fy * width]!
      }
    }
    const key = patternWindow.join(',')
    return weights.get(key) || eps
  }

  const step = (): IterationResult => {
    if (iteration >= maxIterations) {
      return IterationResult.SUCCESS
    }

    for (let k = 0; k < totalCells; k++) {
      const i = (prng() * width) | 0
      const j = (prng() * height) | 0
      const cellIdx = i + j * width
      const oldColor = field[cellIdx]!
      const newColor = (prng() * numColors) | 0

      if (oldColor === newColor) {
        continue
      }

      let p = 1.0
      for (let y = j - N + 1; y <= j; y++) {
        for (let x = i - N + 1; x <= i; x++) {
          p *= getWeightAt(x, y)
        }
      }

      markDirty(cellIdx)
      field[cellIdx] = newColor

      let q = 1.0
      for (let y = j - N + 1; y <= j; y++) {
        for (let x = i - N + 1; x <= i; x++) {
          q *= getWeightAt(x, y)
        }
      }

      const acceptance = Math.pow(q / p, 1.0 / temperature)
      if (acceptance < prng()) {
        field[cellIdx] = oldColor
      }
    }

    iteration++
    return iteration >= maxIterations ? IterationResult.SUCCESS : IterationResult.STEP
  }

  const getVisualBuffer = (): Uint8ClampedArray => {
    const slice = changedCells.slice(0, changedCount)
    for (let idx = 0; idx < changedCount; idx++) {
      dirtyFlags[changedCells[idx]!] = 0
    }
    changedCount = 0
    const len = slice.length

    for (let k = 0; k < len; k++) {
      const i = slice[k]!

      const colorId = field[i]!
      const pIdx = colorId * 4
      const r = palette[pIdx]!
      const g = palette[pIdx + 1]!
      const b = palette[pIdx + 2]!
      const a = palette[pIdx + 3]!
      pixelBuffer[i] = (a << 24) | (b << 16) | (g << 8) | r
    }

    const out = new Uint8ClampedArray(totalCells * 4)
    const view = new Uint32Array(out.buffer)
    view.set(pixelBuffer)
    return out
  }

  return {
    step,
    field,
    palette,
    getIteration: () => iteration,
    getProgress: () => iteration / maxIterations,
    getVisualBuffer,
  }
}