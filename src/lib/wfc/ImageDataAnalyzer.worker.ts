import { makeIndexedImage } from 'pixel-data-js'
import { RulesetType } from './OverlappingN/OverlappingNModel.ts'
import { makeFragmentRuleset } from './OverlappingN/OverlappingNRulesetFragment.ts'
import { makeOverlappingNSlidingWindowRuleset } from './OverlappingN/OverlappingNRulesetSlidingWindow.ts'
import { type SerializedWFCRuleset, serializeWFCRuleset, type WFCRuleset } from './WFCRuleset.ts'

export type ImageDataAnalyzerWorkerOptions = {
  imageData: ImageData,
  N: number,
  symmetry: number,
  rulesetType: RulesetType,
  periodicInput: boolean,
}

export type ImageDataAnalyzerWorkerResult = {
  palette: Uint8Array,
  serializedRuleset: SerializedWFCRuleset,
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<ImageDataAnalyzerWorkerOptions>) => {
  const { imageData, N, symmetry, periodicInput, rulesetType } = e.data
  const indexedImage = makeIndexedImage(imageData)

  let ruleset: WFCRuleset

  if (rulesetType === RulesetType.SLIDING_WINDOW) {
    ruleset = makeOverlappingNSlidingWindowRuleset({
      N,
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
    result.serializedRuleset.propagator.data.buffer,
  ])
}
