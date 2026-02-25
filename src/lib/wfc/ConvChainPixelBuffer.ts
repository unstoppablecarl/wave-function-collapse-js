import { extractPatternColors } from './WFCPixelBuffer.ts'

export type ConvChainPixelBufferOptions = {
  T: number,
  N: number,
  width: number,
  height: number,
  patterns: Int32Array,
  palette: Uint8Array,
  bgColor: number,
}

export const makeConvChainPixelBuffer = (
  {
    T,
    N,
    width,
    height,
    patterns,
    palette,
    bgColor,
  }: ConvChainPixelBufferOptions) => {
  const pixelBuffer = new Uint32Array(width * height)

  const patternColors = extractPatternColors(patterns, palette, T, N)

  const clear = () => {
    pixelBuffer.fill(bgColor)
  }

  clear()

  /**
   * Updates the buffer using pattern indices from the ConvChain field.
   * We keep the 'wave' parameter as null/ignored to maintain interface
   * similarity with the WFC version.
   */
  const updateCells = (
    observed: Int32Array,
    changedIndices: Int32Array,
  ) => {
    const len = changedIndices.length

    for (let k = 0; k < len; k++) {
      const i = changedIndices[k]!
      const patternId = observed[i]!

      // ConvChain patternId should never be -1, but we guard just in case
      if (patternId !== -1) {
        const cIdx = patternId * 3
        const r = patternColors[cIdx]!
        const g = patternColors[cIdx + 1]!
        const b = patternColors[cIdx + 2]!

        pixelBuffer[i] = 0xFF000000 | (b << 16) | (g << 8) | r
      }
    }
  }

  const getVisualBuffer = (): Uint8ClampedArray => {
    return new Uint8ClampedArray(pixelBuffer.buffer).slice()
  }

  return {
    updateCells,
    getVisualBuffer,
    clear,
    pixelBuffer,
  }
}