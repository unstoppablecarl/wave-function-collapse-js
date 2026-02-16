export type WFCPixelBufferOptions = {
  T: number
  N: number
  weights: Float64Array
  width: number
  height: number
  patterns: Int32Array
  palette: Uint8Array
  bgColor: number
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
  }: WFCPixelBufferOptions) => {
  const pixelBuffer = new Uint32Array(width * height)

  // Pre-calculate pattern colors once so updateCells is just math
  const patternColors = extractPatternColors(patterns, palette, T, N)

  const clear = () => {
    pixelBuffer.fill(bgColor)
  }

  clear()

  const updateCells = (wave: Uint8Array, changedIndices: Int32Array) => {
    const len = changedIndices.length
    for (let k = 0; k < len; k++) {
      const i = changedIndices[k]!
      let r = 0, g = 0, b = 0, totalW = 0
      const waveOffset = i * T

      for (let t = 0; t < T; t++) {
        if (wave[waveOffset + t] === 1) {
          const w = weights[t]!
          const cIdx = t * 3
          r += patternColors[cIdx]! * w
          g += patternColors[cIdx + 1]! * w
          b += patternColors[cIdx + 2]! * w
          totalW += w
        }
      }

      if (totalW === 0) {
        pixelBuffer[i] = 0xFF2D2828
      } else {
        const invW = 1 / totalW

        // We use bitwise OR with 0 to truncate to integer (faster than Math.floor)
        const finalR = (r * invW) | 0
        const finalG = (g * invW) | 0
        const finalB = (b * invW) | 0

        // Pack ABGR (Little-Endian)
        pixelBuffer[i] = 0xFF000000 | (finalB << 16) | (finalG << 8) | finalR
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
  palette: Uint8Array,
  T: number,
  N: number,
): Uint8Array => {
  const patternColors = new Uint8Array(T * 3)
  const patternLen = N * N

  for (let t = 0; t < T; t++) {
    const colorId = patterns[t * patternLen]!

    // palette[id * 4] is Red, [id * 4 + 1] is Green, etc.
    const pIdx = colorId * 4
    const outIdx = t * 3

    patternColors[outIdx] = palette[pIdx]!     // R
    patternColors[outIdx + 1] = palette[pIdx + 1]! // G
    patternColors[outIdx + 2] = palette[pIdx + 2]! // B
  }

  return patternColors
}

/**
 * Maps RGBA pixel data to unique sequential integer IDs.
 * This keeps the WFC model's memory footprint small and logic fast.
 * * @param data - The raw Uint8ClampedArray from ImageData.data
 * @returns { sample: Int32Array, palette: number[][] }
 * sample: An array of IDs representing the image grid
 * palette: A lookup table where palette[id] = [r, g, b, a]
 */
export const colorToIdMap = (data: Uint8ClampedArray): {
  sample: Int32Array<ArrayBuffer>,
  palette: Uint8Array<ArrayBuffer>,
  avgColor: number,
} => {
  const sample = new Int32Array(data.length / 4)
  const colorMap = new Map<string, number>()
  const tempPalette: number[] = []

  // Track sums for the average background color
  let rSum = 0, gSum = 0, bSum = 0

  for (let i = 0; i < sample.length; i++) {
    const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!, a = data[i * 4 + 3]!

    rSum += r
    gSum += g
    bSum += b

    const key = `${r},${g},${b},${a}`
    let id = colorMap.get(key)
    if (id === undefined) {
      id = colorMap.size
      tempPalette.push(r, g, b, a)
      colorMap.set(key, id)
    }
    sample[i] = id
  }

  const count = sample.length
  // Pack the average color into an ABGR Uint32 for the buffer
  const avgColor = 0xFF000000 |
    (((bSum / count) | 0) << 16) |
    (((gSum / count) | 0) << 8) |
    ((rSum / count) | 0)

  return {
    sample,
    palette: new Uint8Array(tempPalette),
    avgColor,
  }
}