import type { IterationResult } from '../_types.ts'
import type { ConvChainWorkerOptions } from './ConvChain.worker.ts'
import { makeConvChainModelBinary } from './ConvChainModel/ConvChainModelBinary.ts'
import { makeConvChainModelPatch } from './ConvChainModel/ConvChainModelPatch.ts'

export type ConvChainOptions = Omit<ConvChainWorkerOptions, 'previewInterval' | 'modelType'>

export type ConvChain = {
  step: () => IterationResult,
  getIteration: () => number,
  getProgress: () => number,
  getVisualBuffer: () => Uint8ClampedArray,
  getStabilityPercent: () => number,
}

export type ConvChainCreator = (opt: ConvChainOptions) => Promise<ConvChain>

export enum ConvChainModelType {
  BINARY,
  PATCH
}

export const ConvChainModelTypeFactory: Record<ConvChainModelType, ConvChainCreator> = {
  [ConvChainModelType.BINARY]: makeConvChainModelBinary,
  [ConvChainModelType.PATCH]: makeConvChainModelPatch,
}