import type { IterationResult } from '../_types.ts'
import type { ConvChainWorkerOptions } from './ConvChain.worker.ts'
import { createConvChainBinary } from './ConvChainBinary.ts'

export type ConvChainOptions = Omit<ConvChainWorkerOptions, 'previewInterval'>

export type ConvChain = {
  step: () => IterationResult,
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