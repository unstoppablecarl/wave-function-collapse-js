import init, { IterationResult, WFCModel as RustWFCModel } from '@unstoppablecarl/wfc-rust'
import wasmUrl from '@unstoppablecarl/wfc-rust/rust_wfc_bg.wasm?url'

import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import type { WFCModel, WFCOptions } from '../WFCModel.ts'
import { applyInitialImage } from './applyInitialImage.ts'

export type RNG = () => number
export const makeWFCModelWasm = async (
  {
    ruleset,
    width,
    height,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    maxSnapshots,
    snapshotIntervalPercent,
    avgColor,
    palette,
    contradictionColor,
    initialImageData,
    lockInitialImageData,
  }: WFCOptions): Promise<WFCModel> => {

  const wasm = await init({
    module_or_path: wasmUrl,
  })

  const { T, propagator } = ruleset

  const model = new RustWFCModel(
    width,
    height,
    T,
    propagator.weights,
    propagator.data,
    propagator.offsets,
    propagator.lengths,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    maxSnapshots,
    snapshotIntervalPercent / 100,
  )
  const buffer = makeWFCPixelBuffer({
    palette,
    T: T,
    N: ruleset.N,
    width: width,
    height: height,
    weights: propagator.weights,
    patterns: ruleset.patterns,
    bgColor: avgColor,
    contradictionColor,
  })

  function getObserved() {
    return new Int32Array(wasm.memory.buffer, model.observed_ptr(), width * height)
  }

  function getWave() {
    const wordsPerCell = ((T + 63) / 64) | 0
    const stride = wordsPerCell * 8
    const totalBytes = width * height * stride
    return new Uint8Array(wasm.memory.buffer, model.wave_ptr(), totalBytes)
  }

  function getChanges() {
    return model.get_changes() as unknown as Int32Array<ArrayBuffer>
  }

  function applyLock() {
    applyInitialImage(
      (cell, pattern) => model.ban(cell, pattern),
      () => model.propagate(),
      initialImageData!,
      width,
      height,
      T,
      ruleset.N,
      ruleset.patterns,
      palette,
    )
  }

  function clear() {
    buffer.clear()
    model.clear()
    if (initialImageData) applyLock()
  }

  function singleIteration(rng: RNG) {
    const result = model.single_iteration_with_snapshots(rng()) as unknown as IterationResult
    if (lockInitialImageData && initialImageData && result === IterationResult.REVERT) {
      applyLock()
    }
    return result
  }

  return {
    ruleset,
    syncVisuals: () => buffer.updateCells(getWave(), getObserved(), getChanges()),
    singleIteration,
    clear,
    isGenerationComplete: () => model.is_generation_complete(),
    getFilledCount: () => model.get_filled_count(),
    getTotalCells: () => model.get_total_cells(),
    filledPercent: () => model.filled_percent(),
    getTotalMemoryUseBytes: () => model.get_total_memory_usage_bytes(),
    getImageBuffer: () => buffer.getVisualBuffer(),
    T,
    width,
    height,
    N: ruleset.N,
    destroy: () => model.free(),
  }
}
