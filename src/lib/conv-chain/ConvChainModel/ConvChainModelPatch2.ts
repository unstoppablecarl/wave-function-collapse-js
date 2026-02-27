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

  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const sourceData = indexedImage.data
  const palette32 = indexedImage.palette

  const pixelBuffer = new Uint32Array(totalCells)
  const dirtyFlags = new Uint8Array(totalCells)
  const changedCells = new Int32Array(totalCells)
  let changedCount = 0

  // 1. Optimized Pattern Weights using a numeric hash
  // This is significantly faster than string joining for N > 2
  const weights = new Map<number, number>()

  const getPatternHash = (
    data: Int32Array | Uint8ClampedArray | Int32Array,
    x: number,
    y: number,
    w: number,
    h: number,
  ): number => {
    let hCode = 0
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const px = (x + j + w) % w
        const py = (y + i + h) % h
        // Simple but effective rolling hash for small N
        hCode = (hCode << 5) - hCode + data[py * w + px]!
        hCode |= 0
      }
    }
    return hCode
  }

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const h = getPatternHash(sourceData, x, y, sourceWidth, sourceHeight)
      weights.set(h, (weights.get(h) || 0) + 1)
    }
  }

  const markDirty = (idx: number) => {
    if (dirtyFlags[idx] === 0) {
      dirtyFlags[idx] = 1
      changedCells[changedCount++] = idx
    }
  }

  for (let i = 0; i < totalCells; i++) {
    const rIdx = (prng() * sourceData.length) | 0
    field[i] = sourceData[rIdx]!
    markDirty(i)
  }

  const getLocalEnergy = (tx: number, ty: number): number => {
    let energy = 0
    // We check all NxN patterns that contain the pixel at (tx, ty)
    for (let dy = 1 - N; dy <= 0; dy++) {
      for (let dx = 1 - N; dx <= 0; dx++) {
        const h = getPatternHash(field, tx + dx, ty + dy, width, height)
        const w = weights.get(h) || 0
        energy -= w > 0 ? Math.log(w) : -10.0
      }
    }
    return energy
  }

  const step = (): IterationResult => {
    if (iteration >= maxIterations) {
      return IterationResult.SUCCESS
    }

    // For large outputs, we need to process more pixels per step
    const updatesPerStep = totalCells
    for (let k = 0; k < updatesPerStep; k++) {
      const tx = (prng() * width) | 0
      const ty = (prng() * height) | 0
      const idx = ty * width + tx

      const oldVal = field[idx]!
      const e1 = getLocalEnergy(tx, ty)

      const rIdx = (prng() * sourceData.length) | 0
      const newVal = sourceData[rIdx]!

      if (oldVal === newVal) continue

      field[idx] = newVal
      const e2 = getLocalEnergy(tx, ty)

      const delta = e1 - e2
      // Simulated Annealing: reduce effective temperature over time
      const currentTemp = temperature * (1.0 - iteration / maxIterations)

      if (delta > 0 || Math.exp(delta / Math.max(currentTemp, 0.01)) > prng()) {
        markDirty(idx)
      } else {
        field[idx] = oldVal
      }
    }

    iteration++
    return iteration >= maxIterations ? IterationResult.SUCCESS : IterationResult.STEP
  }

  const getVisualBuffer = (): Uint8ClampedArray => {
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
  }

  return {
    step,
    getIteration: () => iteration,
    getProgress: () => iteration / maxIterations,
    getVisualBuffer,
  }
}