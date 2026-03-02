import type { IndexedImage } from 'pixel-data-js'
import { getPatternsFromIndexedImage } from '../../util/pattern.ts'
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
  const sourcePatterns = getPatternsFromIndexedImage(indexedImage, N, periodicInput)

  return makeWFCRuleset(N, symmetry, sourcePatterns, NOverlap)
}