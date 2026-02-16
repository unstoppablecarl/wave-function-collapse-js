export type PropagatorOptions = {
  data: Int32Array;
  offsets: Int32Array;
  lengths: Int32Array;
  T: number;
};

export type Propagator = ReturnType<typeof makePropagator>

export function makePropagator({ data, offsets, lengths, T }: PropagatorOptions) {
  return {
    data,
    // Starting index in data for each (direction, pattern)
    offsets,
    // Number of valid neighbors for each (direction, pattern)
    lengths,
    // valid results adjacent to patternId in given direction
    getValidPatternIds(patternId: number, direction: number) {
      const index = direction * T + patternId
      const start = offsets[index]!
      const count = lengths[index]!

      return data.subarray(start, start + count)
    },
    // number of valid results adjacent to patternId in given direction
    getCompatibleCount(patternId: number, direction: number): number {
      return lengths[direction * T + patternId]!;
    }
  }
}