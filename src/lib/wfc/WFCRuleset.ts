import { DX, DY } from '../util/direction.ts'
import {
  deserializePropagator,
  makePropagator,
  type Propagator,
  type SerializedPropagator,
  serializePropagator,
} from './Propagator.ts'

/**
 * Wave Function Collapse Ruleset containing the adjacency constraints (propagator),
 * unique patterns, and their relative weights.
 */
export type WFCRuleset = {
  N: number,
  T: number,
  NOverlap: number,
  propagator: Propagator,
  weights: Float64Array,
  patterns: Int32Array,
  originalPatterns: Int32Array[],
}

export type SerializedWFCRuleset = {
  N: number,
  T: number,
  propagator: SerializedPropagator,
  NOverlap: number,
  // json serialization will be number[]
  weights: Float64Array | number[],
  patterns: Int32Array | number[],
  originalPatterns: (Int32Array | number[])[],
}

/** * Rotates a square Int32Array pattern 90 degrees clockwise.
 */
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

/**
 * Reflects a square Int32Array pattern horizontally.
 */
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

/**
 * Computes a rolling hash for a pattern to allow fast deduplication and edge matching.
 */
export const getPatternHash = (p: Int32Array): bigint => {
  let h = 0n

  for (let i = 0; i < p.length; i++) {
    h = (h * 31n) + BigInt(p[i]!)
  }

  return h
}

/**
 * Internal helper to generate unique D4 transformations of a source pattern.
 */
function* generateSymmetries(base: Int32Array, N: number, symmetry: number) {
  const seenHashes = new Set<bigint>()
  let current = base

  for (let i = 0; i < symmetry; i++) {
    // 0: Original orientation
    if (i === 0) current = base

    // 1: Horizontal reflection
    if (i === 1) current = reflect(base, N)

    // 2: Rotate the reflection 90°
    if (i === 2) current = rotate(current, N)

    // 3: Reflect that rotation
    if (i === 3) current = reflect(current, N)

    // 4: Rotate again (180° from reflected start)
    if (i === 4) current = rotate(current, N)

    // 5: Reflect that rotation
    if (i === 5) current = reflect(current, N)

    // 6: Rotate again (270° from reflected start)
    if (i === 6) current = rotate(current, N)

    // 7: Reflect that rotation
    if (i === 7) current = reflect(current, N)

    const hash = getPatternHash(current)

    if (!seenHashes.has(hash)) {
      seenHashes.add(hash)
      yield {
        pattern: current,
        hash,
      }
    }
  }
}

export function makeWFCRuleset(
  N: number,
  symmetry: number,
  sourcePatterns: Int32Array[],
  NOverlap: number = 1,
): WFCRuleset {
  const patternLen = N * N
  const weightsMap = new Map<bigint, number>()
  const patternsList: Int32Array[] = []
  const originalPatternIndices: number[] = []
  const overlap = N - NOverlap

  for (let i = 0; i < sourcePatterns.length; i++) {
    const base = sourcePatterns[i]!
    let firstVariationIdx = -1

    for (const { pattern, hash } of generateSymmetries(base, N, symmetry)) {
      const weight = weightsMap.get(hash)

      if (weight !== undefined) {
        weightsMap.set(hash, weight + 1)
      } else {
        weightsMap.set(hash, 1)
        patternsList.push(pattern)

        if (firstVariationIdx === -1) {
          firstVariationIdx = patternsList.length - 1
        }
      }
    }

    if (firstVariationIdx !== -1) {
      originalPatternIndices.push(firstVariationIdx)
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

  // 2. EDGE HASH PRE-CALCULATION
  // Maps each pattern to a hash of its overlapping region for each direction
  const edgeHashes = new BigUint64Array(T * 4)

  for (let t = 0; t < T; t++) {
    for (let d = 0; d < 4; d++) {
      const dx = DX[d]!
      const dy = DY[d]!

      // Adjust the sample window based on the desired overlap
      const xmin = dx < 0 ? 0 : (dx > 0 ? N - overlap : 0)
      const xmax = dx < 0 ? overlap : (dx > 0 ? N : N)
      const ymin = dy < 0 ? 0 : (dy > 0 ? N - overlap : 0)
      const ymax = dy < 0 ? overlap : (dy > 0 ? N : N)

      let h = 0n

      for (let y = ymin; y < ymax; y++) {
        for (let x = xmin; x < xmax; x++) {
          const pi = t * patternLen + x + N * y
          h = (h * 31n) + BigInt(patterns[pi]!)
        }
      }

      edgeHashes[t * 4 + d] = h
    }
  }

  /** Checks if pattern t1 can be placed next to t2 in direction d */
  const fastAgrees = (t1: number, t2: number, d: number): boolean => {
    const oppositeDir = (d + 2) % 4
    const h1 = edgeHashes[t1 * 4 + d]
    const h2 = edgeHashes[t2 * 4 + oppositeDir]

    return h1 === h2
  }

  const propagatorLengths = new Int32Array(4 * T)
  let totalPropagatorSize = 0

  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      let count = 0

      for (let t2 = 0; t2 < T; t2++) {
        if (fastAgrees(t1, t2, d)) {
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
        if (fastAgrees(t1, t2, d)) {
          propagatorData[propCursor++] = t2
        }
      }
    }
  }

  const originalPatterns = originalPatternIndices.map(idx => {
    const start = idx * patternLen
    const end = start + patternLen

    return patterns.slice(start, end)
  })

  const propagator = makePropagator({
    data: propagatorData,
    offsets: propagatorOffsets,
    lengths: propagatorLengths,
    T,
  })

  return {
    N,
    T,
    NOverlap,
    propagator,
    originalPatterns,
    weights,
    patterns,
  }
}

export function serializeWFCRuleset(ruleset: WFCRuleset): SerializedWFCRuleset {
  return {
    N: ruleset.N,
    T: ruleset.T,
    NOverlap: ruleset.NOverlap,
    weights: ruleset.weights,
    patterns: ruleset.patterns,
    originalPatterns: ruleset.originalPatterns,
    propagator: serializePropagator(ruleset.propagator),
  }
}

export function deserializeWFCRuleset(data: SerializedWFCRuleset): WFCRuleset {
  const weights = data.weights instanceof Float64Array ? data.weights : new Float64Array(data.weights)
  const patterns = data.patterns instanceof Int32Array ? data.patterns : new Int32Array(data.patterns)
  const originalPatterns = data.originalPatterns.map(p => {
    return p instanceof Int32Array ? p : new Int32Array(p)
  })

  const propagator = deserializePropagator(data.propagator)

  return {
    N: data.N,
    T: data.T,
    NOverlap: data.NOverlap,
    propagator,
    weights,
    patterns,
    originalPatterns,
  }
}