import { IterationResult, type RNG } from '../WFCModel.ts'
import type { WFCRuleset } from '../WFCRuleset.ts'
import { makeOverlappingNJS } from './OverlappingNModelJS.ts'
import { makeOverlappingNModelWasm } from './OverlappingNModelWasm.ts'

export type OverlappingNOptions = {
  ruleset: WFCRuleset,
  width: number,
  height: number,
  periodicOutput: boolean,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
}

export type OverlappingNModel = {
  singleIterationWithSnapShots: (rng: RNG) => IterationResult,
  clear: () => void,
  isGenerationComplete: () => boolean,
  getFilledCount: () => number,
  getTotalCells: () => number,
  filledPercent: () => number,
  getObserved: () => Int32Array,
  getWave: () => Uint8Array,
  getChanges: () => Int32Array,
  T: number,
  N: number,
  width: number,
  height: number,
  destroy: () => void,
  ruleset: WFCRuleset,
  getTotalMemoryUseBytes: () => bigint,
}

export type OverlappingNModelCreator = (opt: OverlappingNOptions) => Promise<OverlappingNModel>

export enum ModelType {
  JS,
  WASM
}

export const ModelTypeFactory: Record<ModelType, OverlappingNModelCreator> = {
  [ModelType.JS]: makeOverlappingNJS,
  [ModelType.WASM]: makeOverlappingNModelWasm,
}

export enum RulesetType {
  SLIDING_WINDOW,
  FRAGMENT
}
