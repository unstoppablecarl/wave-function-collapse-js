import type { IndexedImage } from 'pixel-data-js'
import type { WorkerModelInterface } from '../../lib/worker/Worker.ts'
import { makeConvChainModelBinary } from './ConvChainModel/ConvChainModelBinary.ts'
import { makeConvChainModelPatch } from './ConvChainModel/ConvChainModelPatch.ts'
import type { ConvChainStoreSettings } from './ConvChainStore.ts'

export type ConvChainOptions = ConvChainStoreSettings & {
  guidanceField?: Int32Array,
  guidanceWeight?: number,
  indexedImage: IndexedImage,
  initialImageData?: ImageData,
  initialPatchCount?: number,
  initialPatchSize?: number
}

export type ConvChainModelOptions = Omit<ConvChainOptions, 'previewInterval' | 'modelType'>

export type ConvChainModel = WorkerModelInterface

export type ConvChainCreator = (opt: ConvChainModelOptions) => Promise<ConvChainModel>

export enum ConvChainModelType {
  BINARY,
  PATCH
}

export const ConvChainModelTypeFactory: Record<ConvChainModelType, ConvChainCreator> = {
  [ConvChainModelType.BINARY]: makeConvChainModelBinary,
  [ConvChainModelType.PATCH]: makeConvChainModelPatch,
}