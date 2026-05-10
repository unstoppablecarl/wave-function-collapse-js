import type { IndexedImage } from 'pixel-data-js'
import type { WorkerModelInterface } from '../../lib/worker/Worker.ts'
import { makeConvChainModelBinary } from './ConvChainModel/ConvChainModelBinary.ts'
import { makeConvChainModelPatch } from './ConvChainModel/ConvChainModelPatch.ts'

export type ConvChainOptions = {
  seed: number,
  width: number,
  height: number,
  N: number,
  temperature: number,
  maxIterations: number,
  previewInterval: number,
  modelType: ConvChainModelType,
  symmetry: number,
  periodicInput: boolean,
  lockInitialImageData: boolean,

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