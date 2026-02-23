import { RulesetType } from './OverlappingN/OverlappingNModel.ts'
import { makeFragmentRuleset } from './OverlappingN/OverlappingNRulesetFragment.ts'
import { makeOverlappingNSlidingWindowRuleset } from './OverlappingN/OverlappingNRulesetSlidingWindow.ts'
import { colorToIdMap } from './WFCPixelBuffer.ts'
import { type SerializedWFCRuleset, serializeWFCRuleset, type WFCRuleset } from './WFCRuleset.ts'

export type ImageDataAnalyzerWorkerOptions = {
  imageData: ImageData,
  N: number,
  symmetry: number,
  rulesetType: RulesetType,
  periodicInput: boolean,
}

export type ImageDataAnalyzerWorkerResult = {
  averageBrittleness: number,
  weights: Float64Array,
  patterns: Int32Array,
  palette: Uint8Array,
  T: number,
  originalPatterns: Int32Array[],
  serializedRuleset: SerializedWFCRuleset,
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<ImageDataAnalyzerWorkerOptions>) => {
  const { imageData, N, symmetry, periodicInput, rulesetType } = e.data
  const { sample, palette } = colorToIdMap(imageData.data)

  let ruleset: WFCRuleset

  if (rulesetType === RulesetType.SLIDING_WINDOW) {
    ruleset = makeOverlappingNSlidingWindowRuleset({
      N,
      sample,
      sampleWidth: imageData.width,
      sampleHeight: imageData.height,
      symmetry: symmetry,
      periodicInput,
    })
  } else {
    ruleset = makeFragmentRuleset({
      N,
      source: imageData,
      symmetry: symmetry,
    })
  }

  const { propagator, weights, patterns, T, originalPatterns } = ruleset
  const { averageBrittleness } = propagator.getBrittleness()

  const result: ImageDataAnalyzerWorkerResult = {
    averageBrittleness,
    weights,
    patterns,
    palette,
    T,
    originalPatterns,
    serializedRuleset: serializeWFCRuleset(ruleset),
  }
  ctx.postMessage(result)
}
