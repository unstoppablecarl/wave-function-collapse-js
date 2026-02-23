export type PropagatorOptions = {
  data: Int32Array,
  offsets: Int32Array,
  lengths: Int32Array,
  T: number,
}

export type Propagator = ReturnType<typeof makePropagator>

export function makePropagator({ data, offsets, lengths, T }: PropagatorOptions) {
  function getValidPatternIds(patternId: number, direction: number) {
    // Basic bounds safety
    if (direction < 0 || direction >= 4) {
      return new Int32Array(0)
    }

    const index = direction * T + patternId
    const start = offsets[index]!
    const count = lengths[index]!

    return data.subarray(start, start + count)
  }

  function getCompatibleCount(patternId: number, direction: number): number {
    const idx = direction * T + patternId
    const len = lengths[idx]

    return len ?? 0
  }

  function getBrittleness() {
    const brittlenessScores = new Float64Array(T)
    const bottlenecks: number[] = []

    for (let t = 0; t < T; t++) {
      let totalConnections = 0
      let isDeadEnd = false

      for (let d = 0; d < 4; d++) {
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