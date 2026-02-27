import { type IndexedImage } from 'pixel-data-js'

export function getPatternsFromIndexedImage(indexedImage: IndexedImage, N: number, periodicInput: boolean): Int32Array[] {
  const patternLen = N * N

  const { width, height, data } = indexedImage
  const getPatternFromSample = (x: number, y: number): Int32Array => {
    const p = new Int32Array(patternLen)
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        const sx = (x + dx) % width
        const sy = (y + dy) % height
        p[dx + dy * N] = data[sx + sy * width]!
      }
    }
    return p
  }

  const yMax = periodicInput ? height : height - N + 1
  const xMax = periodicInput ? width : width - N + 1

  const sourcePatterns: Int32Array[] = []

  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < xMax; x++) {
      sourcePatterns.push(getPatternFromSample(x, y))
    }
  }

  return sourcePatterns
}