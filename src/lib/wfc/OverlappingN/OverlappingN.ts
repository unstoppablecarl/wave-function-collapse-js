import { makeOverlappingNRuleset } from './OverlappingNRuleset.ts'
import { makeWFCModel } from '../WFCModel.ts'
import { colorToIdMap } from '../WFCPixelBuffer.ts'

export type OverlappingNOptions = {
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
  revertRadius: number,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
}

export const makeOverlappingN = (
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
    startCoordBias,
    startCoordX,
    startCoordY,
  }: OverlappingNOptions) => {

  const { T, propagator, weights, patterns } = makeOverlappingNRuleset({
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

export function makeOverlappingModelFromImageData(imageData: ImageData, settings: Omit<OverlappingNOptions, 'sample' | 'sampleWidth' | 'sampleHeight'>) {
  const { sample, palette, avgColor } = colorToIdMap(imageData.data)

  return {
    model: makeOverlappingN({
      ...settings,
      sample,
      sampleWidth: imageData.width,
      sampleHeight: imageData.height,
    }),
    palette,
    avgColor,
  }
}