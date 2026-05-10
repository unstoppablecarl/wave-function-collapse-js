import type { IndexedImage } from 'pixel-data-js'
import type { WorkerModelInterface } from '../../lib/worker/Worker.ts'
import { makeTextureSynthesisModelCoherent } from './TextureSynthesisModel/TextureSynthesisModelCoherent.ts'
import { makeTextureSynthesisModelFull } from './TextureSynthesisModel/TextureSynthesisModelFull.ts'
import { makeTextureSynthesisModelHarrison } from './TextureSynthesisModel/TextureSynthesisModelHarrison.ts'
import type { TextureSynthesisStoreSettings } from './TextureSynthesisStore.ts'

export type TextureSynthesisOptions = TextureSynthesisStoreSettings & {
  indexedImage: IndexedImage,
}

export type TextureSynthesisModelOptions = Omit<TextureSynthesisOptions, 'previewInterval' | 'modelType'>

export type TextureSynthesisModel = WorkerModelInterface

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