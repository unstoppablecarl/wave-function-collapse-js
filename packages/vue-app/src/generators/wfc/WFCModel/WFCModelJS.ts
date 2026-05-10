import { makeWFCModel } from '@unstoppablecarl/wfc-js'
import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import type { WFCModel, WFCModelCreator, WFCOptions } from '../WFCModel.ts'

export const makeWFCJS: WFCModelCreator = async (
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
  }: WFCOptions): Promise<WFCModel> => {

  const { T, N, propagator } = ruleset

  const initialGround = -1
  const model = makeWFCModel({
    width,
    height,
    T,
    periodicOutput,
    propagator,
    initialGround,
    startCoordBias,
    startCoordX,
    startCoordY,
  })

  const buffer = makeWFCPixelBuffer({
    palette,
    T,
    N,
    width: width,
    height: height,
    weights: propagator.weights,
    patterns: ruleset.patterns,
    bgColor: avgColor,
    contradictionColor,
  })

  return {
    ...model,
    N: ruleset.N,
    syncVisuals: () => buffer.updateCells(model.getWave(), model.getObserved(), model.getChanges()),
    getImageBuffer: () => buffer.getVisualBuffer(),
    destroy: () => {
    },
    ruleset,
    getTotalMemoryUseBytes: () => 0,
  }
}