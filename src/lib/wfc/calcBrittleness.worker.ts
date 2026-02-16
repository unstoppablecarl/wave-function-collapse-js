import { makeOverlappingRuleset } from './OverlappingRuleset.ts'
import { colorToIdMap } from './WFCPixelBuffer.ts'

export type CalcBrittlenessWorkerOptions = {
  imageData: ImageData,
  N: number,
  symmetry: number,
  periodicInput: boolean,
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<CalcBrittlenessWorkerOptions>) => {
  const { imageData, N, symmetry, periodicInput } = e.data
  const { sample } = colorToIdMap(imageData.data)
  const { propagator } = makeOverlappingRuleset({
    N,
    sample,
    sampleWidth: imageData.width,
    sampleHeight: imageData.height,
    symmetry: symmetry,
    periodicInput,
  })

  const { averageBrittleness } = propagator.getBrittleness()

  ctx.postMessage({ averageBrittleness })
}
