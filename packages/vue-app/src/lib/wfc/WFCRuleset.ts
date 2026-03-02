import {
  deserializePropagator, type Direction,
  DX,
  DY, makePropagatorBuilder, OPPOSITE_DIR,
  type Propagator,
  type SerializedPropagator,
  serializePropagator,
} from '@unstoppablecarl/wfc-js'
import { getPatternHash } from '../util/pattern.ts'
import { generateSymmetries } from '../util/symmetry.ts'

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

/**
 * Internal helper to generate unique D4 transformations of a source pattern.
 */

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

  const builder = makePropagatorBuilder(T)

  for (let d = 0; d < 4; d++) {
    const dir = d as Direction
    const oppDir = OPPOSITE_DIR[d]!
    for (let t1 = 0; t1 < T; t1++) {
      const h1 = edgeHashes[t1 * 4 + dir]!
      for (let t2 = 0; t2 < T; t2++) {
        const h2 = edgeHashes[t2 * 4 + oppDir]!
        if (h1 === h2) {
          builder.addAdjacency(t1, t2, dir)
        }
      }
    }
  }

  const originalPatterns = originalPatternIndices.map(idx => {
    const start = idx * patternLen
    return patterns.slice(start, start + patternLen)
  })

  return {
    N,
    T,
    NOverlap,
    propagator: builder.build(),
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
  return {
    N: data.N,
    T: data.T,
    NOverlap: data.NOverlap,
    propagator: deserializePropagator(data.propagator),
    weights,
    patterns,
    originalPatterns,
  }
}