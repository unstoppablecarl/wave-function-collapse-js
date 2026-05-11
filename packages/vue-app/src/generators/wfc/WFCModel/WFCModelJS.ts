import { IterationResult, makeWFCModel } from '@unstoppablecarl/wfc-js'
import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import type { WFCModel, WFCModelCreator, WFCOptions } from '../WFCModel.ts'
import { applyInitialImage } from './applyInitialImage.ts'

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
    maxSnapshots,
    snapshotIntervalPercent,
    initialImageData,
    lockInitialImageData,
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
    maxSnapshots,
    snapshotIntervalPercent,
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

  const originalClear = model.clear.bind(model)

  function applyLock() {
    applyInitialImage(model.ban, model.propagate, initialImageData!, width, height, T, N, ruleset.patterns, palette)
  }

  function clear() {
    originalClear()
    if (initialImageData) applyLock()
  }

  function singleIteration(rng: () => number) {
    const result = model.singleIteration(rng)
    if (lockInitialImageData && initialImageData && result === IterationResult.REVERT) {
      applyLock()
    }
    return result
  }

  return {
    ...model,
    clear,
    singleIteration,
    N: ruleset.N,
    syncVisuals: () => buffer.updateCells(model.getWave(), model.getObserved(), model.getChanges()),
    getImageBuffer: () => buffer.getVisualBuffer(),
    destroy: () => {
    },
    ruleset,
    getTotalMemoryUseBytes: () => 0,
  }
}
