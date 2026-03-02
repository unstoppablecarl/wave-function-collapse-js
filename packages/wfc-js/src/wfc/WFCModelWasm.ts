import type { RNG } from '@unstoppablecarl/wfc-js'
import init, { WFCModel } from '@unstoppablecarl/wfc-rust'
import wasmUrl from '@unstoppablecarl/wfc-rust/rust_wfc_bg.wasm?url'
import type { Propagator } from './Propagator.ts'

export type WFCModelWasmOptions = {
  width: number,
  height: number,
  periodicOutput: boolean,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
  maxSnapShots: number,
  snapshotIntervalPercent: number,
  propagator: Propagator,
}

export const makeWFCModelWasm = async (
  {
    width,
    height,
    periodicOutput,
    startCoordBias,
    startCoordX,
    startCoordY,
    maxSnapShots,
    snapshotIntervalPercent,
    propagator,
  }: WFCModelWasmOptions) => {

  const wasm = await init({
    module_or_path: wasmUrl,
  })

  const { T } = propagator

  const model = new WFCModel(
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
    maxSnapShots,
    snapshotIntervalPercent / 100,
  )


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
    singleIteration: (rng: RNG) => model.single_iteration_with_snapshots(rng()),
    clear: () => model.clear(),
    isGenerationComplete: () => model.is_generation_complete(),
    getFilledCount: () => model.get_filled_count(),
    getTotalCells: () => model.get_total_cells(),
    filledPercent: () => model.filled_percent(),
    getTotalMemoryUseBytes: () => model.get_total_memory_usage_bytes(),
    getChanges,
    getWave,
    getObserved,
    T,
    width,
    height,
    destroy: () => model.free(),
  }
}