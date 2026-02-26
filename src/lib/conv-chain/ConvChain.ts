import type { IterationResult, RNG } from '../_types.ts'
import type { ConvChainWorkerOptions } from './ConvChain.worker.ts'
import { createConvChainBinary } from './ConvChainBinary.ts'

export type ConvChainOptions = Omit<ConvChainWorkerOptions, 'seed' | 'previewInterval'> & { prng: RNG }

export type ConvChain = {
  step: () => IterationResult,
  field: Uint8Array,
  palette: Uint8Array,
  getIteration: () => number,
  getProgress: () => number,
  getVisualBuffer: () => Uint8ClampedArray,
}

export type ConvChainCreator = (opt: ConvChainOptions) => Promise<ConvChain>

export enum ConvChainModelType {
  BINARY,
}

export const ConvChainModelTypeFactory: Record<ConvChainModelType, ConvChainCreator> = {
  [ConvChainModelType.BINARY]: createConvChainBinary,
}