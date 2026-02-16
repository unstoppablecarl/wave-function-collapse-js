export type PropagatorOptions = {
  data: Int32Array;
  offsets: Int32Array;
  lengths: Int32Array;
  T: number;
};

export type Propagator = ReturnType<typeof makePropagator>

export function makePropagator({ data, offsets, lengths, T }: PropagatorOptions) {

  // valid results adjacent to patternId in given direction
  function getValidPatternIds(patternId: number, direction: number) {
    const index = direction * T + patternId
    const start = offsets[index]!
    const count = lengths[index]!

    return data.subarray(start, start + count)
  }

  function getCompatibleCount(patternId: number, direction: number): number {
    return lengths[direction * T + patternId]!
  }

  /**
   * Analyzes the propagator to find "bottleneck" patterns.
   * High value = Brittle/Risky (few connection options)
   * Low value  = Robust/Flexible (many connection options)
   */
  function getBrittleness() {
    const brittlenessScores = new Float64Array(T)
    const bottlenecks: number[] = []

    for (let t = 0; t < T; t++) {
      let totalConnections = 0
      let isDeadEnd = false

      for (let d = 0; d < 4; d++) {
        const count = getCompatibleCount(t, d)

        // If a tile has NO valid neighbors in a specific direction,
        // it is a guaranteed contradiction if placed anywhere but the edge.
        if (count === 0) {
          isDeadEnd = true
        }
        totalConnections += count
      }

      // Patterns with low connection counts are "brittle"
      // We use an inverse scale so that problematic tiles have HIGHER scores.
      brittlenessScores[t] = isDeadEnd ? 1.0 : 1 / (totalConnections / 4)

      if (brittlenessScores[t]! > 0.8) {
        bottlenecks.push(t)
      }
    }

    return {
      scores: brittlenessScores,
      bottlenecks, // Indices of patterns that are likely to cause contradictions
      averageBrittleness: brittlenessScores.reduce((a, b) => a + b, 0) / T,
    }
  }

  return {
    data,
    // Starting index in data for each (direction, pattern)
    offsets,
    // Number of valid neighbors for each (direction, pattern)
    lengths,
    getValidPatternIds,
    // number of valid results adjacent to patternId in given direction
    getCompatibleCount,

    getBrittleness,
  }
}