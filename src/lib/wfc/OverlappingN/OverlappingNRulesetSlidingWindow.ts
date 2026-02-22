import { makeWFCRuleset, type WFCRuleset } from '../WFCRuleset.ts'

export type OverlappingNSlidingWindowRulesetOptions = {
  sample: Int32Array,
  sampleWidth: number,
  sampleHeight: number,
  N: number,
  periodicInput: boolean,
  symmetry: number,
}

export function makeOverlappingNSlidingWindowRuleset(
  {
    N,
    sample,
    sampleWidth,
    sampleHeight,
    symmetry,
    periodicInput,
  }: OverlappingNSlidingWindowRulesetOptions,
): WFCRuleset {
  const patternLen = N * N
  const getPatternFromSample = (x: number, y: number): Int32Array => {
    const p = new Int32Array(patternLen)
    for (let dy = 0; dy < N; dy++) {
      for (let dx = 0; dx < N; dx++) {
        const sx = (x + dx) % sampleWidth
        const sy = (y + dy) % sampleHeight
        p[dx + dy * N] = sample[sx + sy * sampleWidth]!
      }
    }
    return p
  }

  const yMax = periodicInput ? sampleHeight : sampleHeight - N + 1
  const xMax = periodicInput ? sampleWidth : sampleWidth - N + 1

  const sourcePatterns: Int32Array[] = []

  for (let y = 0; y < yMax; y++) {
    for (let x = 0; x < xMax; x++) {
      sourcePatterns.push(getPatternFromSample(x, y))
    }
  }

  return makeWFCRuleset(N, symmetry, sourcePatterns)
}