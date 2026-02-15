export type WFCPixelBufferOptions = {
  T: number
  N: number
  weights: Float64Array
  width: number
  height: number
  patterns: Int32Array
  palette: Uint8Array
}

export const makeWFCPixelBuffer = (
  {
    palette,
    T,
    N,
    patterns,
    weights,
    width,
    height,
  }: WFCPixelBufferOptions) => {
  const pixelBuffer = new Uint32Array(width * height)

  // Pre-calculate pattern colors once so updateCells is just math
  const patternColors = extractPatternColors(patterns, palette, T, N)

  const clear = () => {
    pixelBuffer.fill(0xFF000000) // Opaque Black
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
        pixelBuffer[i] = 0xFF2D2828 // Contradiction dark grey
      } else {
        const invW = 1 / totalW
        // Optimization: Use bitwise OR for truncation instead of Math.floor
        pixelBuffer[i] = (255 << 24) |
          (((b * invW) | 0) << 16) |
          (((g * invW) | 0) << 8) |
          ((r * invW) | 0)
      }
    }
  }

  const getVisualBuffer = (
    repairCounts?: Uint32Array,
    showHeatmap?: boolean,
  ): Uint8ClampedArray<ArrayBuffer> => {
    // .slice() is necessary because postMessage transfers ownership of the buffer.
    // If we didn't slice, the Worker would lose access to pixelBuffer.buffer!
    const out = new Uint8ClampedArray(pixelBuffer.buffer).slice()

    if (showHeatmap && repairCounts) {
      for (let i = 0; i < width * height; i++) {
        const heat = repairCounts[i]!
        if (heat > 0) {
          const px = i * 4
          const intensity = Math.min(heat * 40, 200)
          out[px] = Math.min(out[px]! + intensity, 255)
          out[px + 1] = Math.max(out[px + 1]! - intensity, 0)
          out[px + 2] = Math.max(out[px + 2]! - intensity, 0)
        }
      }
    }
    return out
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
export const colorToIdMap = (data: Uint8ClampedArray) => {
  const sample = new Int32Array(data.length / 4)
  const colorMap = new Map<string, number>()

  // Temporary array to collect unique colors
  const tempPalette: number[] = []

  for (let i = 0; i < sample.length; i++) {
    const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!, a = data[i * 4 + 3]!
    const key = `${r},${g},${b},${a}`

    let id = colorMap.get(key)
    if (id === undefined) {
      id = colorMap.size
      tempPalette.push(r, g, b, a)
      colorMap.set(key, id)
    }
    sample[i] = id
  }

  const palette = new Uint8Array(tempPalette)
  return { sample, palette }
}