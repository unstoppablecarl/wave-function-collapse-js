import { makeOverlappingNRuleset } from './OverlappingN/OverlappingNRuleset.ts'
import { colorToIdMap } from './WFCPixelBuffer.ts'

export type ImageDataAnalyzerWorkerOptions = {
  imageData: ImageData,
  N: number,
  symmetry: number,
  periodicInput: boolean,
}

export type ImageDataAnalyzerWorkerResult = {
  averageBrittleness: number,
  weights: Float64Array<ArrayBuffer>,
  patterns: Int32Array<ArrayBuffer>,
  palette: Uint8Array<ArrayBuffer>,
  T: number,
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<ImageDataAnalyzerWorkerOptions>) => {
  const { imageData, N, symmetry, periodicInput } = e.data
  const { sample, palette } = colorToIdMap(imageData.data)
  const { propagator, weights, patterns } = makeOverlappingNRuleset({
    N,
    sample,
    sampleWidth: imageData.width,
    sampleHeight: imageData.height,
    symmetry: symmetry,
    periodicInput,
  })

  const { averageBrittleness } = propagator.getBrittleness()

  ctx.postMessage({ averageBrittleness, weights, patterns, palette } as ImageDataAnalyzerWorkerResult)
}
