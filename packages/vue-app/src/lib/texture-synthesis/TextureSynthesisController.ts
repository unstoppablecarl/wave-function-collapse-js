import type { IndexedImage } from 'pixel-data-js'
import type { TextureSynthesisStoreSettings } from './TextureSynthesisStore.ts'
import { type GenericControllerOptions, makeWorkerController } from '../worker/WorkerController.ts'

export type TextureSynthesisControllerOptions = GenericControllerOptions<IndexedImage, TextureSynthesisStoreSettings, MsgExtra>

type MsgExtra = {
  stabilityPercent: number,
}

const workerUrl = new URL('./TextureSynthesis.worker.ts', import.meta.url)

export function makeTextureSynthesisController(opts: TextureSynthesisControllerOptions) {
  return makeWorkerController<IndexedImage, TextureSynthesisStoreSettings, MsgExtra>(
    workerUrl,
    opts,
  )
}