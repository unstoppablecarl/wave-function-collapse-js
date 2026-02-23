import init, { WFCModel } from '../../../../rust-wfc/pkg/rust_wfc'
import wasmUrl from '../../../../rust-wfc/pkg/rust_wfc_bg.wasm?url'
import type { RNG } from '../WFCModel.ts'
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
  }: OverlappingNOptions): Promise<OverlappingNModel> => {

  const wasm = await init({
    module_or_path: wasmUrl,
  })

  const { T, propagator, weights } = ruleset

  const maxSnapshots = 10
  const snapshotIntervalPercent = 0.05

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
    maxSnapshots,
    snapshotIntervalPercent,
  )

  return {
    ruleset,
    singleIterationWithSnapShots: (rng: RNG) => model.single_iteration_with_snapshots(rng()),
    clear: () => model.clear(),
    isGenerationComplete: () => model.is_generation_complete(),
    getFilledCount: () => model.get_filled_count(),
    getTotalCells: () => model.get_total_cells(),
    filledPercent: () => model.filled_percent(),
    getObserved: () => {
      return new Int32Array(wasm.memory.buffer, model.observed_ptr(), width * height)
    },
    getWave: () => {
      const wordsPerCell = ((T + 63) / 64) | 0
      const stride = wordsPerCell * 8
      const totalBytes = width * height * stride
      return new Uint8Array(wasm.memory.buffer, model.wave_ptr(), totalBytes)
    },
    getTotalMemoryUseBytes: () => {
      return model.get_total_memory_usage_bytes()
    },
    getChanges: () => {
      return model.get_changes() as unknown as Int32Array<ArrayBuffer>
    },
    T,
    width,
    height,
    N: ruleset.N,
    destroy: () => model.free(),
  }
}