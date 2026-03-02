import type { PatternIndex } from '../_types.ts'
import type { Direction } from '../util/direction.ts'

export type PropagatorOptions = {
  data: Int32Array,
  offsets: Int32Array,
  lengths: Int32Array,
  weights?: Float64Array,
  T: number,
}

export type Propagator = ReturnType<typeof makePropagator>

export function makePropagator(
  {
    data,
    offsets,
    lengths,
    T,
    weights: providedWeights,
  }: PropagatorOptions) {

  const weights = providedWeights ?? new Float64Array(T).fill(1)

  function getValidPatternIds(pattern: PatternIndex, direction: Direction) {
    // Basic bounds safety
    if (direction < 0 || direction >= 4) {
      return new Int32Array(0)
    }

    const index = direction * T + pattern
    const start = offsets[index]!
    const count = lengths[index]!

    return data.subarray(start, start + count)
  }

  function getCompatibleCount(pattern: PatternIndex, direction: Direction): number {
    const idx = direction * T + pattern
    const len = lengths[idx]

    return len ?? 0
  }

  function isCompatible(pattern: PatternIndex, candidate: PatternIndex, direction: Direction): boolean {
    if (direction < 0 || direction >= 4) return false

    const index = direction * T + pattern
    const start = offsets[index]!
    const count = lengths[index]!

    for (let i = start; i < start + count; i++) {
      if (data[i] === candidate) return true
    }

    return false
  }

  function getBrittleness() {
    const brittlenessScores = new Int32Array(T)
    const bottlenecks: number[] = []

    for (let t = 0 as PatternIndex; t < T; t++) {
      let totalConnections = 0
      let isDeadEnd = false

      for (let d = 0 as Direction; d < 4; d++) {
        const count = getCompatibleCount(t, d)

        if (count === 0) {
          isDeadEnd = true
        }

        totalConnections += count
      }

      // Safeguard against division by zero
      const avg = totalConnections / 4
      const score = isDeadEnd || avg === 0
        ? 1.0
        : Math.min(1.0, 1 / avg)

      brittlenessScores[t] = score

      if (score > 0.8) {
        bottlenecks.push(t)
      }
    }

    const totalScore = brittlenessScores.reduce((a, b) => a + b, 0)
    const averageBrittleness = totalScore / T

    return {
      scores: brittlenessScores,
      bottlenecks,
      averageBrittleness,
    }
  }

  return {
    data,
    offsets,
    lengths,
    weights,
    T,
    isCompatible,
    getValidPatternIds,
    getCompatibleCount,
    getBrittleness,
  }
}

export type SerializedPropagator = {
  data: Int32Array | number[],
  offsets: Int32Array | number[],
  lengths: Int32Array | number[],
  weights: Float64Array | number[],
  T: number,
}

export function serializePropagator(propagator: Propagator): SerializedPropagator {
  const { data, offsets, lengths, weights, T } = propagator

  return {
    data,
    offsets,
    lengths,
    weights,
    T,
  }
}

export function deserializePropagator(serialized: SerializedPropagator): Propagator {
  // Defensive casting to ensure TypedArrays
  const data = serialized.data instanceof Int32Array
    ? serialized.data
    : new Int32Array(serialized.data)

  const offsets = serialized.offsets instanceof Int32Array
    ? serialized.offsets
    : new Int32Array(serialized.offsets)

  const lengths = serialized.lengths instanceof Int32Array
    ? serialized.lengths
    : new Int32Array(serialized.lengths)

  const weights = serialized.weights instanceof Float64Array
    ? serialized.weights
    : new Float64Array(serialized.weights)

  const T = serialized.T

  return makePropagator({
    data,
    offsets,
    lengths,
    weights,
    T,
  })
}