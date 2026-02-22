import { makeOverlappingNSlidingWindowRuleset } from './OverlappingN/OverlappingNRulesetSlidingWindow.ts'
import { colorToIdMap } from './WFCPixelBuffer.ts'

export type ImageDataAnalyzerWorkerOptions = {
  imageData: ImageData,
  N: number,
  symmetry: number,
  periodicInput: boolean,
}

export type ImageDataAnalyzerWorkerResult = {
  averageBrittleness: number,
  weights: Float64Array,
  patterns: Int32Array,
  palette: Uint8Array,
  T: number,
  originalPatterns: Int32Array[],
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<ImageDataAnalyzerWorkerOptions>) => {
  const { imageData, N, symmetry, periodicInput } = e.data
  const { sample, palette } = colorToIdMap(imageData.data)
  const { propagator, weights, patterns, T, originalPatterns } = makeOverlappingNSlidingWindowRuleset({
    N,
    sample,
    sampleWidth: imageData.width,
    sampleHeight: imageData.height,
    symmetry: symmetry,
    periodicInput,
  })

  const { averageBrittleness } = propagator.getBrittleness()

  const result: ImageDataAnalyzerWorkerResult = { averageBrittleness, weights, patterns, palette, T, originalPatterns }
  ctx.postMessage(result)
}
