import init, { WFCModel } from '../../../../rust-wfc/pkg/rust_wfc'
import wasmUrl from '../../../../rust-wfc/pkg/rust_wfc_bg.wasm?url'
import type { RNG } from '../../_types.ts'
import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import type { OverlappingNModel, OverlappingNOptions } from './OverlappingNModel.ts'

export const makeOverlappingNModelWasm = async (
  {
    ruleset,
    width,
    height,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    maxSnapShots,
    snapshotIntervalPercent,
    avgColor,
    palette,
    contradictionColor,
  }: OverlappingNOptions): Promise<OverlappingNModel> => {

  const wasm = await init({
    module_or_path: wasmUrl,
  })

  const { T, propagator, weights } = ruleset

  const model = new WFCModel(
    width,
    height,
    T,
    weights,
    propagator.data,
    propagator.offsets,
    propagator.lengths,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    maxSnapShots,
    snapshotIntervalPercent / 100,
  )
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

  return {
    ruleset,
    syncVisuals: () => buffer.updateCells(getWave(), getObserved(), getChanges()),
    singleIteration: (rng: RNG) => model.single_iteration_with_snapshots(rng()),
    clear: () => {
      buffer.clear()
      model.clear()
    },
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