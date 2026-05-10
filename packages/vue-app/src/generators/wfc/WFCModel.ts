import { IterationResult, type RNG } from '@unstoppablecarl/wfc-js'
import type { WFCRuleset } from './WFCRuleset.ts'
import { makeWFCJS } from './WFCModel/WFCModelJS.ts'
import { makeWFCModelWasm } from './WFCModel/WFCModelWasm.ts'

export type WFCOptions = {
  ruleset: WFCRuleset,
  width: number,
  height: number,
  periodicOutput: boolean,
  startCoordBias: number,
  startCoordX: number,
  startCoordY: number,
  maxSnapShots: number,
  snapshotIntervalPercent: number,
  avgColor: number,
  palette: Uint32Array,
  contradictionColor: number,
}

export type WFCModel = {
  singleIteration: (rng: RNG) => IterationResult,
  clear: () => void,
  isGenerationComplete: () => boolean,
  getFilledCount: () => number,
  getTotalCells: () => number,
  filledPercent: () => number,
  T: number,
  N: number,
  width: number,
  height: number,
  destroy: () => void,
  ruleset: WFCRuleset,
  getTotalMemoryUseBytes: () => number,
  syncVisuals: () => void,
  getImageBuffer: () => Uint8ClampedArray,
}

export type WFCModelCreator = (opt: WFCOptions) => Promise<WFCModel>

export enum ModelType {
  JS,
  WASM
}

export const ModelTypeFactory: Record<ModelType, WFCModelCreator> = {
  [ModelType.JS]: makeWFCJS,
  [ModelType.WASM]: makeWFCModelWasm,
}

export enum RulesetType {
  SLIDING_WINDOW,
  FRAGMENT
}
