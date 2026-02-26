import { IterationResult } from '../_types.ts'
import { makeDirtyCheck } from '../util/DirtyCheck.ts'
import type { ConvChainCreator, ConvChainOptions } from './ConvChain.ts'

export const createConvChainBinary: ConvChainCreator = async (
  {
    width,
    height,
    N,
    temperature,
    maxIterations,
    indexedImage,
    prng,
  }: ConvChainOptions,
) => {
  const totalCells = width * height
  const field = new Uint8Array(totalCells)
  const eps = 0.1
  let iteration = 0

  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const sourceData = indexedImage.data
  const palette = indexedImage.palette

  const weightSize = 1 << (N * N)
  const weights = new Float32Array(weightSize)
  weights.fill(eps)

  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (i) => {
    const val = field[i] === 1 ? 255 : 0
    return (255 << 24) | (val << 16) | (val << 8) | val
  })

  const getSampleBit = (x: number, y: number): number => {
    const px = (x + sourceWidth) % sourceWidth
    const py = (y + sourceHeight) % sourceHeight
    const idx = sourceData[px + py * sourceWidth]!
    const pIdx = idx * 4
    const r = palette[pIdx]!
    const g = palette[pIdx + 1]!
    const b = palette[pIdx + 2]!
    const brightness = (r + g + b) / 3
    return brightness > 128 ? 1 : 0
  }

  const getBitSym = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    sym: number,
  ): number => {
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
    return getSampleBit(x + tx, y + ty)
  }

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      for (let sym = 0; sym < 8; sym++) {
        let bitmask = 0
        for (let dy = 0; dy < N; dy++) {
          for (let dx = 0; dx < N; dx++) {
            // Function call with 5 arguments formatted per rule
            const bit = getBitSym(
              x,
              y,
              dx,
              dy,
              sym,
            )
            if (bit) {
              bitmask |= (1 << (dy * N + dx))
            }
          }
        }
        weights[bitmask]! += 1
      }
    }
  }

  const getWeightAt = (
    i: number,
    j: number,
  ): number => {
    let res = 0
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Ensure every pixel lookup is wrapped
        const fx = (i + x + width) % width
        const fy = (j + y + height) % height
        if (field[fx + fy * width] === 1) {
          res |= (1 << (y * N + x))
        }
      }
    }
    return weights[res]!
  }

  const step = (): IterationResult => {
    if (iteration >= maxIterations) {
      return IterationResult.SUCCESS
    }

    for (let k = 0; k < totalCells; k++) {
      const i = (prng() * width) | 0
      const j = (prng() * height) | 0
      const cellIdx = i + j * width

      // Calculate energy of all NxN windows containing pixel (i, j)
      let p = 1.0
      for (let y = j - N + 1; y <= j; y++) {
        for (let x = i - N + 1; x <= i; x++) {
          // getWeightAt needs to handle the wrapping for x and y
          p *= getWeightAt(x, y)
        }
      }

      const oldVal = field[cellIdx]!
      const newVal = oldVal === 0 ? 1 : 0
      field[cellIdx] = newVal

      let q = 1.0
      for (let y = j - N + 1; y <= j; y++) {
        for (let x = i - N + 1; x <= i; x++) {
          q *= getWeightAt(x, y)
        }
      }

      const acceptance = Math.pow(q / p, 1.0 / temperature)

      if (acceptance >= prng()) {
        // Move accepted: If we changed the value, mark dirty
        if (oldVal !== newVal) {
          markDirty(cellIdx)
        }
      } else {
        // Reject: revert state
        field[cellIdx] = oldVal
      }
    }

    iteration++
    return iteration >= maxIterations ? IterationResult.SUCCESS : IterationResult.STEP
  }

  for (let i = 0; i < field.length; i++) {
    field[i] = prng() < 0.5 ? 1 : 0
  }

  for (let i = 0; i < totalCells; i++) {
    markDirty(i)
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