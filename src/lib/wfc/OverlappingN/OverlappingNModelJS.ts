import { makeWFCModel } from '../WFCModel.ts'
import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import type { OverlappingNModel, OverlappingNModelCreator, OverlappingNOptions } from './OverlappingNModel.ts'

export const makeOverlappingNJS: OverlappingNModelCreator = async (
  {
    width,
    height,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    ruleset,
    palette,
    avgColor,
    contradictionColor,
  }: OverlappingNOptions): Promise<OverlappingNModel> => {

  const { T, N, propagator, weights, patterns } = ruleset

  const initialGround = -1
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
    patterns,
    N,
  })

  const buffer = makeWFCPixelBuffer({
    palette,
    T: T,
    N: ruleset.N,
    width: width,
    height: height,
    weights: ruleset.weights,
    patterns: ruleset.patterns,
    bgColor: avgColor,
    contradictionColor,
  })

  return {
    ...model,
    syncVisuals: () => buffer.updateCells(model.getWave(), model.getObserved(), model.getChanges()),
    getImageBuffer: () => buffer.getVisualBuffer(),
    destroy: () => {
    },
    ruleset,
    getTotalMemoryUseBytes: () => 0,
  }
}