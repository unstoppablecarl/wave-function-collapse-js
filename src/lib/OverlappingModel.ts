import { DX, DY, makeWFCModel } from './WFCModel.ts'

export type OverlappingModelOptions = {
  sample: Int32Array,
  sampleWidth: number,
  sampleHeight: number,
  N: number,
  width: number,
  height: number,
  periodicInput: boolean,
  periodicOutput: boolean,
  symmetry: number,
  initialGround: number,
  repairRadius: number,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
}

export const makeOverlappingModel = (
  {
    sample,
    sampleWidth,
    sampleHeight,
    N,
    width,
    height,
    periodicInput,
    periodicOutput,
    symmetry,
    initialGround,
    repairRadius,
    startCoordBias,
    startCoordX,
    startCoordY,
  }: OverlappingModelOptions) => {
  const patternLen = N * N

  // 1. Pattern Extraction Logic (Working with IDs)
  const getPatternFromSample = (x: number, y: number): Int32Array => {
    const p = new Int32Array(patternLen)
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        const sx = (x + dx) % sampleWidth
        const sy = (y + dy) % sampleHeight
        p[dx + dy * N] = sample[sx + sy * sampleWidth]!
      }
    }
    return p
  }

  // Transformation Helpers
  const rotate = (p: Int32Array) => {
    const res = new Int32Array(patternLen)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) res[x + y * N] = p[N - 1 - y + x * N]!
    }
    return res
  }

  const reflect = (p: Int32Array) => {
    const res = new Int32Array(patternLen)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) res[x + y * N] = p[N - 1 - x + y * N]!
    }
    return res
  }

  // 2. Map patterns to unique Weights and Indices
  const weightsMap = new Map<string, number>()
  const patternsList: Int32Array[] = []

  const yMax = periodicInput ? sampleHeight : sampleHeight - N + 1
  const xMax = periodicInput ? sampleWidth : sampleWidth - N + 1

  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < xMax; x++) {
      const ps: Int32Array[] = new Array(8)
      ps[0] = getPatternFromSample(x, y)
      ps[1] = reflect(ps[0])
      ps[2] = rotate(ps[0])
      ps[3] = reflect(ps[2])
      ps[4] = rotate(ps[2])
      ps[5] = reflect(ps[4])
      ps[6] = rotate(ps[4])
      ps[7] = reflect(ps[6])

      for (let k = 0; k < symmetry; k++) {
        const key = ps[k]!.toString() // ID-based string key
        const w = weightsMap.get(key)
        if (w !== undefined) {
          weightsMap.set(key, w + 1)
        } else {
          weightsMap.set(key, 1)
          patternsList.push(ps[k]!)
        }
      }
    }
  }

  const T = patternsList.length
  const patterns = new Int32Array(T * patternLen)
  const weights = new Float64Array(T)

  for (let t = 0; t < T; t++) {
    const pat = patternsList[t]!
    weights[t] = weightsMap.get(pat.toString())!
    for (let k = 0; k < patternLen; k++) {
      patterns[t * patternLen + k] = pat[k]!
    }
  }

  const agrees = (p1Idx: number, p2Idx: number, dx: number, dy: number) => {
    const xmin = dx < 0 ? 0 : dx
    const xmax = dx < 0 ? dx + N : N
    const ymin = dy < 0 ? 0 : dy
    const ymax = dy < 0 ? dy + N : N

    for (let y = ymin; y < ymax; y++) {
      for (let x = xmin; x < xmax; x++) {
        if (patterns[p1Idx * patternLen + x + N * y] !==
          patterns[p2Idx * patternLen + (x - dx) + N * (y - dy)]) return false
      }
    }
    return true
  }

  const propagatorLengths = new Int32Array(4 * T)
  let totalPropagatorSize = 0

  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      let count = 0
      for (let t2 = 0; t2 < T; t2++) {
        if (agrees(t1, t2, DX[d]!, DY[d]!)) {
          count++
        }
      }
      propagatorLengths[d * T + t1] = count
      totalPropagatorSize += count
    }
  }

  // 2. Allocate and Fill (Second Pass)
  const propagatorData = new Int32Array(totalPropagatorSize)
  const propagatorOffsets = new Int32Array(4 * T)
  let propCursor = 0

  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      const idx = d * T + t1
      propagatorOffsets[idx] = propCursor

      const len = propagatorLengths[idx]!
      let found = 0

      // We re-run the check to fill the data without storing temporary arrays
      for (let t2 = 0; t2 < T; t2++) {
        if (agrees(t1, t2, DX[d]!, DY[d]!)) {
          propagatorData[propCursor + found] = t2
          found++
        }
      }
      propCursor += len
    }
  }

  const model = makeWFCModel({
    width,
    height,
    T,
    periodicOutput,
    weights,
    propagatorData,
    propagatorOffsets,
    propagatorLengths,
    initialGround,
    repairRadius,
    startCoordBias,
    startCoordX,
    startCoordY,
  })

  return {
    ...model,
    patterns,
    N,
  }
}