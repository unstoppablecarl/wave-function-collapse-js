import init, { WFCModel } from '../../../../rust-wfc/pkg/rust_wfc'

// 2. Import the binary URL (the .wasm file)
import wasmUrl from '../../../../rust-wfc/pkg/rust_wfc_bg.wasm?url'
import type { RNG } from '../WFCModel.ts'
import { colorToIdMap } from '../WFCPixelBuffer.ts'
import type { makeOverlappingN } from './OverlappingN.ts'
import { makeOverlappingNRuleset } from './OverlappingNRuleset.ts'

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

export type OverlappingNWasm = Omit<
  ReturnType<typeof makeOverlappingN>,
  'createSnapshot' | 'restoreSnapshot' | 'ban'
> & {
  destroy: () => void,
}

export const makeOverlappingNWasm = async (
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
    startCoordBias,
    startCoordX,
    startCoordY,
  }: OverlappingNOptions): Promise<OverlappingNWasm> => {

  const wasm = await init({
    module_or_path: wasmUrl,
  })
  
  const { T, propagator, weights, patterns } = makeOverlappingNRuleset({
    N,
    sample,
    sampleWidth,
    sampleHeight,
    symmetry,
    periodicInput,
  })

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
    // Direct Mappings
    singleIteration: (rng: RNG) => model.single_iteration(rng()),
    singleIterationWithSnapShots: (rng: RNG) => model.single_iteration_with_snapshots(rng()),
    clear: () => model.clear(),
    isGenerationComplete: () => model.is_generation_complete(),
    // ban: (i: number, t: number) => model.ban(i, t),
    propagate: () => model.propagate(),
    getFilledCount: () => model.get_filled_count(),
    getTotalCells: () => model.get_total_cells(),
    filledPercent: () => model.filled_percent(),
    getObserved: () => {
      // wasm.memory.buffer is a getter that always returns the CURRENT buffer
      return new Int32Array(wasm.memory.buffer, model.observed_ptr(), width * height)
    },
    getWave: () => {
      const wordsPerCell = ((T + 63) / 64) | 0
      const stride = wordsPerCell * 8
      const totalBytes = width * height * stride
      return new Uint8Array(wasm.memory.buffer, model.wave_ptr(), totalBytes)
    },
    getChanges: () => {
       return model.get_changes() as unknown as Int32Array<ArrayBuffer>
    },
    onBoundary: (x: number, y: number) => {
      return !periodicOutput && (x < 0 || y < 0 || x >= width || y >= height)
    },
    T,
    width,
    height,
    weights,
    propagator,
    patterns,
    N,

    destroy: () => model.free(),
  }
}

export async function makeOverlappingModelWasmFromImageData(imageData: ImageData, settings: Omit<OverlappingNOptions, 'sample' | 'sampleWidth' | 'sampleHeight'>) {
  const { sample, palette, avgColor } = colorToIdMap(imageData.data)

  return {
    model: await makeOverlappingNWasm({
      ...settings,
      sample,
      sampleWidth: imageData.width,
      sampleHeight: imageData.height,
    }),
    palette,
    avgColor,
  }
}