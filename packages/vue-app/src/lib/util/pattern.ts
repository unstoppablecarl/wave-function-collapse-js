import { type IndexedImage } from 'pixel-data-js'

export function getPatternsFromIndexedImage(indexedImage: IndexedImage, N: number, periodicInput: boolean): Uint32Array[] {
  const patternLen = N * N

  const { w, h, data } = indexedImage
  const getPatternFromSample = (x: number, y: number): Uint32Array => {
    const p = new Uint32Array(patternLen)
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        const sx = (x + dx) % w
        const sy = (y + dy) % h
        p[dx + dy * N] = data[sx + sy * w]!
      }
    }
    return p
  }

  const yMax = periodicInput ? h : h - N + 1
  const xMax = periodicInput ? w : w - N + 1

  const sourcePatterns: Uint32Array[] = []

  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < xMax; x++) {
      sourcePatterns.push(getPatternFromSample(x, y))
    }
  }

  return sourcePatterns
}

export const getPatternHash = (p: Uint32Array): bigint => {
  let h = 0n

  for (let i = 0; i < p.length; i++) {
    h = (h * 31n) + BigInt(p[i]!)
  }

  return h
}