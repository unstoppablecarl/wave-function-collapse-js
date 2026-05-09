import type { IterationResult } from '@unstoppablecarl/wfc-js'
import type { IndexedImage } from 'pixel-data-js'
import type { TextureSynthesisStoreSettings } from './TextureSynthesisStore.ts'
import { makeTextureSynthesisModelFull } from './TextureSynthesisModel/TextureSynthesisModelFull.ts'
import { makeTextureSynthesisModelCoherent } from './TextureSynthesisModel/TextureSynthesisModelCoherent.ts'
import { makeTextureSynthesisModelHarrison } from './TextureSynthesisModel/TextureSynthesisModelHarrison.ts'

export type TextureSynthesisOptions = TextureSynthesisStoreSettings & {
  indexedImage: IndexedImage,
}

export type TextureSynthesisModelOptions = Omit<TextureSynthesisOptions, 'previewInterval' | 'modelType'>

export type TextureSynthesisModel = {
  step: () => IterationResult,
  getIteration: () => number,
  getProgress: () => number,
  getVisualBuffer: () => Uint8ClampedArray,
  getStabilityPercent: () => number,
}

export type TextureSynthesisCreator = (opt: TextureSynthesisModelOptions) => Promise<TextureSynthesisModel>

export enum TextureSynthesisModelType {
  FULL,
  COHERENT,
  HARRISON,
}

export const TextureSynthesisModelTypeFactory: Record<TextureSynthesisModelType, TextureSynthesisCreator> = {
  [TextureSynthesisModelType.FULL]: makeTextureSynthesisModelFull,
  [TextureSynthesisModelType.COHERENT]: makeTextureSynthesisModelCoherent,
  [TextureSynthesisModelType.HARRISON]: makeTextureSynthesisModelHarrison,
}