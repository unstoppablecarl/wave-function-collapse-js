import { type Color32, unpackBlue, unpackGreen, unpackRed } from 'pixel-data-js'

export type WFCPixelBufferOptions = {
  T: number
  N: number
  weights: Float64Array
  width: number
  height: number
  patterns: Int32Array
  palette: Int32Array
  bgColor: number,
  contradictionColor?: number,
}

export const makeWFCPixelBuffer = (
  {
    T,
    N,
    weights,
    width,
    height,
    patterns,
    palette,
    bgColor,
    contradictionColor = 0xFFFF00FF,
  }: WFCPixelBufferOptions) => {

  const pixelBuffer = new Uint32Array(width * height)

  // Pre-calculate pattern colors once so updateCells is just math
  const patternColors = extractPatternColors(patterns, palette, T, N)

  const clear = () => {
    pixelBuffer.fill(bgColor)
  }

  clear()

  const updateCells = (wave: Uint8Array, observed: Int32Array, changedIndices: Int32Array) => {
    const len = changedIndices.length

    // Match the Rust u64 alignment
    const wordsPerCell = Math.floor((T + 63) / 64)
    const bytesPerCell = wordsPerCell * 8

    for (let k = 0; k < len; k++) {
      const i = changedIndices[k]!
      const collapsedId = observed[i]!

      if (collapsedId !== -1) {
        // Cell is collapsed: Simple high-speed render
        const cIdx = collapsedId * 3
        const r = patternColors[cIdx]!
        const g = patternColors[cIdx + 1]!
        const b = patternColors[cIdx + 2]!
        pixelBuffer[i] = 0xFF000000 | (b << 16) | (g << 8) | r
      } else {
        // Cell is uncollapsed: Average the possible patterns
        let r = 0, g = 0, b = 0, totalW = 0

        const cellByteOffset = i * bytesPerCell

        for (let t = 0; t < T; t++) {
          const byteIdx = cellByteOffset + (t >> 3)
          const bitIdx = t & 7

          // Check if the bit is set
          if ((wave[byteIdx]! & (1 << bitIdx)) !== 0) {
            const w = weights[t]!
            const cIdx = t * 3
            r += patternColors[cIdx]! * w
            g += patternColors[cIdx + 1]! * w
            b += patternColors[cIdx + 2]! * w
            totalW += w
          }
        }

        if (totalW === 0) {
          pixelBuffer[i] = contradictionColor
        } else {
          const invW = 1 / totalW
          pixelBuffer[i] = 0xFF000000 |
            (((b * invW) | 0) << 16) |
            (((g * invW) | 0) << 8) |
            ((r * invW) | 0)
        }
      }
    }
  }

  const getVisualBuffer = (): Uint8ClampedArray<ArrayBuffer> => {
    // .slice() is necessary because postMessage transfers ownership of the buffer.
    // If we didn't slice, the Worker would lose access to pixelBuffer.buffer!
    return new Uint8ClampedArray(pixelBuffer.buffer).slice()
  }

  return { updateCells, getVisualBuffer, clear, pixelBuffer }
}

/**
 * Maps the first pixel of each unique NxN pattern to its actual RGB values.
 * @param patterns - The flat Int32Array [T * N * N] of Color IDs from makeOverlappingModel
 * @param palette - The array of [r, g, b, a] color arrays from colorToIdMap
 * @param T - Total number of unique patterns
 * @param N - The pattern size (e.g., 3 for a 3x3 pattern)
 * @returns Uint8Array - A flattened RGB array [T * 3]
 */
export const extractPatternColors = (
  patterns: Int32Array,
  palette: Int32Array,
  T: number,
  N: number,
): Uint8Array => {
  const patternColors = new Uint8Array(T * 3)
  const patternLen = N * N

  for (let t = 0; t < T; t++) {
    const colorId = patterns[t * patternLen]!
    const color = palette[colorId]! as Color32
    const outIdx = t * 3

    // Extracting 8-bit channels from the 32-bit integer
    patternColors[outIdx] = unpackRed(color)
    patternColors[outIdx + 1] = unpackGreen(color)
    patternColors[outIdx + 2] = unpackBlue(color)
  }

  return patternColors
}