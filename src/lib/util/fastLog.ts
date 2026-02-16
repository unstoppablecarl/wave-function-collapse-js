export type FastLogFunction = (x: number) => number

export const makeFastLog = (options?: {
  minValue?: number,
  maxValue?: number,
  tableSize?: number
}): FastLogFunction => {
  const minValue = options?.minValue ?? 0.0001  // Min expected weight sum
  const maxValue = options?.maxValue ?? 10000    // Max expected weight sum
  const tableSize = options?.tableSize ?? 4096   // Power of 2 for fast lookups

  // Pre-calculate log values
  const logTable = new Float64Array(tableSize)
  const step = (maxValue - minValue) / (tableSize - 1)
  const invStep = 1 / step

  for (let i = 0; i < tableSize; i++) {
    const value = minValue + i * step
    logTable[i] = Math.log(value)
  }

  return (x: number): number => {
    // Handle edge cases
    if (x <= 1e-10) return 0
    if (x < minValue) return Math.log(x)  // Out of range low
    if (x > maxValue) return Math.log(x)  // Out of range high

    // Find position in table
    const position = (x - minValue) * invStep
    const index = position | 0  // Fast floor

    // Return exact value if we're on a table entry
    if (position === index) {
      return logTable[index]!
    }

    // Linear interpolation between two nearest entries
    if (index + 1 < tableSize) {
      const fraction = position - index
      const log1 = logTable[index]!
      const log2 = logTable[index + 1]!
      return log1 + fraction * (log2 - log1)
    }

    // Fallback to last entry
    return logTable[tableSize - 1]!
  }
}