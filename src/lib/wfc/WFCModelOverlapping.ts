import { makeOverlappingRuleset } from './OverlappingRuleset.ts'
import { makeWFCModel } from './WFCModel.ts'
import { colorToIdMap } from './WFCPixelBuffer.ts'

export type OverlappingModelOptions = {
  sample: Int32Array,
  sampleWidth: number,
  sampleHeight: number,
  N: number,
  width: number,
  height: number,
  periodicInput: boolean,
  periodicOutput: boolean,
  symmetry: number,
  initialGround: number,
  repairRadius: number,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
}

export const makeOverlappingModel = (
  {
    sample,
    sampleWidth,
    sampleHeight,
    N,
    width,
    height,
    periodicInput,
    periodicOutput,
    symmetry,
    initialGround,
    repairRadius,
    startCoordBias,
    startCoordX,
    startCoordY,
  }: OverlappingModelOptions) => {

  const { T, propagator, weights, patterns } = makeOverlappingRuleset({
    N,
    sample,
    sampleWidth,
    sampleHeight,
    symmetry,
    periodicInput,
  })

  const model = makeWFCModel({
    width,
    height,
    T,
    periodicOutput,
    weights,
    propagator,
    initialGround,
    repairRadius,
    startCoordBias,
    startCoordX,
    startCoordY,
  })

  return {
    ...model,
    patterns,
    N,
  }
}

export function makeOverlappingModelFromImageData(imageData: ImageData, settings: Omit<OverlappingModelOptions, 'sample' | 'sampleWidth' | 'sampleHeight'>) {
  const { sample, palette, avgColor } = colorToIdMap(imageData.data)

  return {
    model: makeOverlappingModel({
      ...settings,
      sample,
      sampleWidth: imageData.width,
      sampleHeight: imageData.height,
    }),
    palette,
    avgColor,
  }
}