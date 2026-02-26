import type { IndexedImage } from 'pixel-data-js'
import { type ComputedRef, type Reactive, ref, shallowRef } from 'vue'
import type { ConvChainStoreSettings } from '../store/ConvChainStore.ts'
import {
  type ConvChainWorkerOptions,
  type MsgError,
  type MsgPreview,
  type MsgSuccess,
  WorkerMsg,
  type WorkerResponse,
} from './ConvChain.worker.ts'

export type ConvChainControllerOptions = {
  settings: Reactive<ConvChainStoreSettings>,
  indexedImage: ComputedRef<IndexedImage | null>,
  onStart?(): void,
  onPreview?(data: MsgPreview): void,
  onSuccess?(data: MsgSuccess): void,
  onError?(data: MsgError): void,
}

export function makeConvChainController(
  {
    settings,
    indexedImage,
    onPreview,
    onSuccess,
    onError,
    onStart,
  }: ConvChainControllerOptions,
) {
  let worker: Worker | null = null
  const running = ref(false)
  const errorMessage = shallowRef<{ title: string, message: string } | null>(null)

  const run = () => {
    if (worker) {
      worker.terminate()
    }

    errorMessage.value = null
    if (!indexedImage.value) {
      errorMessage.value = { title: 'Invalid Input', message: 'No Target Image' }
      return
    }

    worker = new Worker(new URL('./ConvChain.worker.ts', import.meta.url), {
      type: 'module',
    })

    running.value = true
    onStart?.()

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      switch (msg.type) {
        case WorkerMsg.PREVIEW:
          onPreview?.(msg)
          break
        case WorkerMsg.SUCCESS:
          onSuccess?.(msg)
          worker?.terminate()
          worker = null
          running.value = false
          break
        case WorkerMsg.ERROR:
          onError?.(msg)
          worker?.terminate()
          worker = null
          running.value = false
          break
      }
    }

    worker.postMessage({
      indexedImage: indexedImage.value,
      ...settings,
    } as ConvChainWorkerOptions)
  }

  const terminateWorker = () => {
    if (worker) {
      worker.terminate()
      running.value = false
      worker = null
    }
  }

  return {
    run,
    terminateWorker,
    running,
    errorMessage,
  }
}