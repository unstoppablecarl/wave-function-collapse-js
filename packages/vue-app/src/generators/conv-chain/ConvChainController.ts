import type { IndexedImage } from 'pixel-data-js'
import type { ConvChainStoreSettings } from './ConvChainStore.ts'
import { type GenericControllerOptions, makeWorkerController } from '../../lib/worker/WorkerController.ts'

export type ConvChainControllerOptions = GenericControllerOptions<IndexedImage, ConvChainStoreSettings, MsgExtra>

type MsgExtra = {
  stabilityPercent: number,
}

const workerUrl = new URL('./ConvChain.worker.ts', import.meta.url)

export function makeConvChainController(opts: ConvChainControllerOptions) {
  return makeWorkerController<IndexedImage, ConvChainStoreSettings, MsgExtra>(
    workerUrl,
    opts,
  )
}