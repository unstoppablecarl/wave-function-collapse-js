import { DX, DY } from '../util/direction.ts'
import {
  deserializePropagator,
  makePropagator,
  type Propagator,
  type SerializedPropagator,
  serializePropagator,
} from './Propagator.ts'

export type WFCRuleset = {
  N: number,
  T: number,
  propagator: Propagator,
  weights: Float64Array,
  patterns: Int32Array,
  originalPatterns: Int32Array[],
}

export const rotate = (p: Int32Array, N: number): Int32Array => {
  const patternLen = N * N
  const res = new Int32Array(patternLen)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      res[x + y * N] = p[N - 1 - y + x * N]!
    }
  }
  return res
}

export const reflect = (p: Int32Array, N: number): Int32Array => {
  const patternLen = N * N
  const res = new Int32Array(patternLen)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      res[x + y * N] = p[N - 1 - x + y * N]!
    }
  }
  return res
}

export const getPatternHash = (p: Int32Array): bigint => {
  let h = 0n

  for (let i = 0; i < p.length; i++) {
    h = (h * 31n) + BigInt(p[i]!)
  }
  return h
}

export function makeWFCRuleset(N: number, symmetry: number, sourcePatterns: Int32Array[]) {
  const patternLen = N * N
  const weightsMap = new Map<bigint, number>()
  const patternsList: Int32Array[] = []
  const originalPatternIndices: number[] = []

  for (let i = 0; i < sourcePatterns.length; i++) {
    for (let k = 0; k < symmetry; k++) {
      const ps: Int32Array[] = new Array(8)
      ps[0] = sourcePatterns[i]!
      ps[1] = reflect(ps[0], N)
      ps[2] = rotate(ps[0], N)
      ps[3] = reflect(ps[2], N)
      ps[4] = rotate(ps[2], N)
      ps[5] = reflect(ps[4], N)
      ps[6] = rotate(ps[4], N)
      ps[7] = reflect(ps[6], N)

      const p = ps[k]!
      const key = getPatternHash(p)
      const w = weightsMap.get(key)

      if (w !== undefined) {
        weightsMap.set(key, w + 1)
      } else {
        weightsMap.set(key, 1)
        patternsList.push(p)
        if (k === 0) {
          originalPatternIndices.push(patternsList.length - 1)
        }
      }
    }
  }

  const T = patternsList.length
  const patterns = new Int32Array(T * patternLen)
  const weights = new Float64Array(T)

  for (let t = 0; t < T; t++) {
    const pat = patternsList[t]!
    const hash = getPatternHash(pat)
    weights[t] = weightsMap.get(hash)!
    patterns.set(pat, t * patternLen)
  }

  const originalPatterns = originalPatternIndices.map(idx => {
    const start = idx * patternLen
    const end = start + patternLen
    return patterns.slice(start, end)
  })

  const agrees = (p1Idx: number, p2Idx: number, dx: number, dy: number) => {
    const xmin = dx < 0 ? 0 : dx
    const xmax = dx < 0 ? dx + N : N
    const ymin = dy < 0 ? 0 : dy
    const ymax = dy < 0 ? dy + N : N

    for (let y = ymin; y < ymax; y++) {
      for (let x = xmin; x < xmax; x++) {
        const i1 = p1Idx * patternLen + x + N * y
        const i2 = p2Idx * patternLen + (x - dx) + N * (y - dy)
        if (patterns[i1] !== patterns[i2]) return false
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

  const propagatorData = new Int32Array(totalPropagatorSize)
  const propagatorOffsets = new Int32Array(4 * T)
  let propCursor = 0

  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      const idx = d * T + t1
      propagatorOffsets[idx] = propCursor
      for (let t2 = 0; t2 < T; t2++) {
        if (agrees(t1, t2, DX[d]!, DY[d]!)) {
          propagatorData[propCursor++] = t2
        }
      }
    }
  }

  const propagator = makePropagator({
    data: propagatorData,
    offsets: propagatorOffsets,
    lengths: propagatorLengths,
    T,
  })

  return {
    N,
    T,
    propagator,
    originalPatterns,
    weights,
    patterns,
  }
}

export type SerializedWFCRuleset = {
  N: number,
  T: number,
  propagator: SerializedPropagator,
  weights: Float64Array,
  patterns: Int32Array,
  originalPatterns: Int32Array[],
}

export function serializeWFCRuleset(ruleset: WFCRuleset) {

  return {
    N: ruleset.N,
    T: ruleset.T,
    weights: ruleset.weights,
    patterns: ruleset.patterns,
    originalPatterns: ruleset.originalPatterns,
    propagator: serializePropagator(ruleset.propagator),
  }
}

export function deserializeWFCRuleset(data: SerializedWFCRuleset): WFCRuleset {
  const N = data.N
  const T = data.T
  const weights = data.weights
  const patterns = data.patterns
  const originalPatterns = data.originalPatterns

  const propagator = deserializePropagator(data.propagator)

  return {
    N,
    T,
    propagator,
    weights,
    patterns,
    originalPatterns,
  }
}