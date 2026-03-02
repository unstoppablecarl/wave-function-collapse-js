import type { Direction } from '../util/direction.ts'
import type { PatternIndex } from './_types.ts'

export type PropagatorOptions = {
  data: Int32Array,
  offsets: Int32Array,
  lengths: Int32Array,
  T: number,
}

export type Propagator = ReturnType<typeof makePropagator>

export function makePropagator({ data, offsets, lengths, T }: PropagatorOptions) {
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
    const brittlenessScores = new Float64Array(T)
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
  T: number,
}

export function serializePropagator(propagator: Propagator): SerializedPropagator {
  const data = propagator.data
  const offsets = propagator.offsets
  const lengths = propagator.lengths
  const T = propagator.T

  return {
    data,
    offsets,
    lengths,
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

  const T = serialized.T

  return makePropagator({
    data,
    offsets,
    lengths,
    T,
  })
}