import type { IndexedImage } from 'pixel-data-js'
import { makeWFCRuleset, type WFCRuleset } from '../WFCRuleset.ts'

export type OverlappingNSlidingWindowRulesetOptions = {
  indexedImage: IndexedImage,
  N: number,
  NOverlap: number,
  periodicInput: boolean,
  symmetry: number,
}

export function makeOverlappingNSlidingWindowRuleset(
  {
    N,
    NOverlap,
    indexedImage,
    symmetry,
    periodicInput,
  }: OverlappingNSlidingWindowRulesetOptions,
): WFCRuleset {
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

  return makeWFCRuleset(N, symmetry, sourcePatterns, NOverlap)
}