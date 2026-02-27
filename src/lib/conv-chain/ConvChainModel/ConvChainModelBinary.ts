import { type Color32, unpackBlue, unpackGreen, unpackRed } from 'pixel-data-js'
import { IterationResult } from '../../_types.ts'
import { makeDirtyCheck } from '../../util/DirtyCheck.ts'
import { makeMulberry32 } from '../../util/mulberry32.ts'
import type { ConvChainCreator, ConvChainOptions } from '../ConvChain.ts'

export const makeConvChainModelBinary: ConvChainCreator = async (
  {
    width,
    height,
    N,
    temperature,
    maxIterations,
    indexedImage,
    seed,
  }: ConvChainOptions,
) => {
  const totalCells = width * height
  const field = new Uint8Array(totalCells)
  const eps = 0.1
  let iteration = 0
  let pixelIndex = 0

  const prng = makeMulberry32(seed)
  const sourceWidth = indexedImage.width
  const sourceHeight = indexedImage.height
  const sourceData = indexedImage.data
  const palette = indexedImage.palette

  const weightSize = 1 << (N * N)
  const weights = new Float32Array(weightSize)
  weights.fill(eps)

  const { markDirty, getVisualBuffer } = makeDirtyCheck(totalCells, (i) => {
    const val = field[i] === 1 ? 255 : 0
    // Force unsigned 32-bit integer for memory alignment
    return ((255 << 24) | (val << 16) | (val << 8) | val) >>> 0
  })

  const getSampleBit = (x: number, y: number): number => {
    const px = (x + sourceWidth) % sourceWidth
    const py = (y + sourceHeight) % sourceHeight
    const idx = sourceData[px + py * sourceWidth]!
    const v = palette[idx]! as Color32
    const r = unpackRed(v)
    const g = unpackGreen(v)
    const b = unpackBlue(v)
    return (r + g + b) / 3 > 128 ? 1 : 0
  }

  // Pre-calculate weights safely
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      for (let sym = 0; sym < 8; sym++) {
        let bitmask = 0
        for (let dy = 0; dy < N; dy++) {
          for (let dx = 0; dx < N; dx++) {
            let tx = dx
            let ty = dy
            if (sym >= 4) tx = N - 1 - tx
            const rot = sym % 4
            for (let r = 0; r < rot; r++) {
              const tmp = tx
              tx = N - 1 - ty
              ty = tmp
            }
            if (getSampleBit(x + tx, y + ty)) {
              bitmask |= (1 << (dy * N + dx))
            }
          }
        }
        weights[bitmask]! += 1
      }
    }
  }

  // Convert to logs ONLY ONCE at the end
  for (let i = 0; i < weightSize; i++) {
    weights[i] = Math.log(weights[i]!)
  }

  const getLogWeightAt = (i: number, j: number): number => {
    let res = 0
    for (let y = 0; y < N; y++) {
      const fy = (j + y + height) % height
      const row = fy * width
      for (let x = 0; x < N; x++) {
        const fx = (i + x + width) % width
        if (field[row + fx] === 1) {
          res |= (1 << (y * N + x))
        }
      }
    }
    return weights[res]!
  }

  // Initial state
  for (let i = 0; i < totalCells; i++) {
    field[i] = prng() < 0.5 ? 1 : 0
    markDirty(i)
  }

  const step = (): IterationResult => {
    if (iteration >= maxIterations) return IterationResult.SUCCESS

    // Removed the totalCells loop - this now processes ONE pixel per step
    const i = (prng() * width) | 0
    const j = (prng() * height) | 0
    const cellIdx = i + j * width

    let logP = 0
    for (let y = j - N + 1; y <= j; y++) {
      for (let x = i - N + 1; x <= i; x++) {
        logP += getLogWeightAt(x, y)
      }
    }

    const oldVal = field[cellIdx]!
    const newVal = oldVal === 0 ? 1 : 0
    field[cellIdx] = newVal

    let logQ = 0
    for (let y = j - N + 1; y <= j; y++) {
      for (let x = i - N + 1; x <= i; x++) {
        logQ += getLogWeightAt(x, y)
      }
    }

    // Mathematical stability for Metropolis-Hastings
    if (logQ >= logP || (temperature > 0 && Math.exp((logQ - logP) / temperature) > prng())) {
      if (oldVal !== newVal) markDirty(cellIdx)
    } else {
      field[cellIdx] = oldVal
    }

    // Track "passes" independently of steps
    pixelIndex++
    if (pixelIndex >= totalCells) {
      pixelIndex = 0
      iteration++
    }

    return iteration >= maxIterations ? IterationResult.SUCCESS : IterationResult.STEP
  }

  return {
    step,
    getIteration: () => iteration,
    getProgress: () => (iteration + pixelIndex / totalCells) / maxIterations,
    getVisualBuffer,
    getStabilityPercent: () => 0,
  }
}