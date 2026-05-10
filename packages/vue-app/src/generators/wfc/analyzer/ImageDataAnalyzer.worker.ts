import { makeIndexedImageFromImageData } from 'pixel-data-js'
import { RulesetType } from '../WFCModel.ts'
import { type SerializedWFCRuleset, serializeWFCRuleset, type WFCRuleset } from '../WFCRuleset.ts'
import { makeFragmentRuleset } from './WFCRulesetFragment.ts'
import { makeOverlappingNSlidingWindowRuleset } from './WFCRulesetSlidingWindow.ts'

export type ImageDataAnalyzerWorkerOptions = {
  imageData: ImageData,
  N: number,
  NOverlap: number,
  symmetry: number,
  rulesetType: RulesetType,
  periodicInput: boolean,
}

export type ImageDataAnalyzerWorkerResult = {
  palette: Uint32Array,
  serializedRuleset: SerializedWFCRuleset,
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<ImageDataAnalyzerWorkerOptions>) => {
  const { imageData, N, symmetry, periodicInput, rulesetType, NOverlap } = e.data
  const indexedImage = makeIndexedImageFromImageData(imageData)

  let ruleset: WFCRuleset

  if (rulesetType === RulesetType.SLIDING_WINDOW) {
    ruleset = makeOverlappingNSlidingWindowRuleset({
      N,
      NOverlap,
      indexedImage,
      symmetry: symmetry,
      periodicInput,
    })
  } else {
    ruleset = makeFragmentRuleset({
      indexedImage,
      symmetry: symmetry,
    })
  }

  const serializedRuleset = serializeWFCRuleset(ruleset)
  const result: ImageDataAnalyzerWorkerResult = {
    palette: indexedImage.palette,
    serializedRuleset,
  }

  // Optimize by transferring large typed arrays instead of cloning
  ctx.postMessage(result, [
    result.palette.buffer,
    (result.serializedRuleset.patterns as Int32Array).buffer,
    (result.serializedRuleset.propagator.data as Int32Array).buffer,
  ])
}
