import type { IndexedImage } from 'pixel-data-js'
import type { IterationResult } from '../_types.ts'
import type { ConvChainStoreSettings } from '../store/ConvChainStore.ts'
import { makeConvChainModelBinary } from './ConvChainModel/ConvChainModelBinary.ts'
import { makeConvChainModelPatch } from './ConvChainModel/ConvChainModelPatch.ts'

export type ConvChainOptions = ConvChainStoreSettings & {
  guidanceField?: Int32Array,
  guidanceWeight?: number,
  indexedImage: IndexedImage,
}

export type ConvChainModelOptions = Omit<ConvChainOptions, 'previewInterval' | 'modelType'>

export type ConvChainModel = {
  step: () => IterationResult,
  getIteration: () => number,
  getProgress: () => number,
  getVisualBuffer: () => Uint8ClampedArray,
  getStabilityPercent: () => number,
}

export type ConvChainCreator = (opt: ConvChainModelOptions) => Promise<ConvChainModel>

export enum ConvChainModelType {
  BINARY,
  PATCH
}

export const ConvChainModelTypeFactory: Record<ConvChainModelType, ConvChainCreator> = {
  [ConvChainModelType.BINARY]: makeConvChainModelBinary,
  [ConvChainModelType.PATCH]: makeConvChainModelPatch,
}