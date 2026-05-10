import { type IndexedImage, indexedImageToAverageColor } from 'pixel-data-js'
import { type ComputedRef, reactive, type Reactive, type Ref, ref, type ShallowRef, shallowRef, toValue } from 'vue'
import {
  type MsgAttemptFailure,
  type MsgAttemptPreview,
  type MsgAttemptStart,
  type MsgAttemptSuccess,
  type WFCWorkerOptions,
  WorkerMsg,
  type WorkerResponse,
} from './WFC.worker.ts'
import { serializeWFCRuleset, type WFCRuleset } from './WFCRuleset.ts'
import type { StoreSettings } from './WFCStore.ts'

export type WFCControllerOptions = {
  settings: Reactive<StoreSettings>,
  ruleset: Ref<WFCRuleset | null>,
  indexedImage: ComputedRef<IndexedImage | null>,
  imageDataSource: ShallowRef<ImageData | null>
  onBeforeRun?(): void,
  onPreview?(response: MsgAttemptPreview, pixels: Uint8ClampedArray): void,
  onAttemptStart?(response: MsgAttemptStart): void,
  onAttemptFailure?(response: MsgAttemptFailure): void,
  onSuccess?(response: MsgAttemptSuccess, pixels: Uint8ClampedArray): void,
}

export function makeWFCController(
  {
    settings,
    onPreview,
    onAttemptFailure,
    onSuccess,
    onAttemptStart,
    onBeforeRun,
    ruleset,
    indexedImage,
    imageDataSource,
  }: WFCControllerOptions,
) {
  let worker: Worker | null = null

  const running = ref(false)
  const hasResult = ref(false)
  const errorMessage = shallowRef<{ title: string, message: string } | null>(null)

  const currentAttempt = makeWFCAttempt()
  const finalAttempt = makeWFCAttempt()

  const handlers: Partial<Record<WorkerMsg, (data: any) => void>> = {
    [WorkerMsg.ATTEMPT_START]: (data: MsgAttemptStart) => {
      resetWFCAttempt(currentAttempt, data.attempt)
      onAttemptStart?.(data)
    },

    [WorkerMsg.ATTEMPT_PREVIEW]: (data: MsgAttemptPreview) => {
      const pixels = new Uint8ClampedArray(data.result.buffer)
      currentAttempt.filledPercent = data.filledPercent
      currentAttempt.reverts = data.reverts
      currentAttempt.totalMemoryUseBytes = data.totalMemoryUseBytes
      onPreview?.(data, pixels)
    },

    [WorkerMsg.ATTEMPT_SUCCESS]: (data: MsgAttemptSuccess) => {
      const pixels = new Uint8ClampedArray(data.result.buffer)
      onSuccess?.(data, pixels)
      Object.assign(finalAttempt, currentAttempt)
      finalAttempt.filledPercent = 1
      hasResult.value = true
      completeWorker()
    },

    [WorkerMsg.ATTEMPT_FAILURE]: (data: MsgAttemptFailure) => {
      if (data.result.byteLength > 0) onAttemptFailure?.(data)
    },

    [WorkerMsg.ATTEMPT_FINAL_FAILURE]: () => {
      hasResult.value = false
      completeWorker()
    },

    [WorkerMsg.ERROR]: (data: any) => {
      hasResult.value = false
      errorMessage.value = { title: 'Worker Error', message: data.message }
      completeWorker()
    },
  }

  function run() {
    onBeforeRun?.()

    errorMessage.value = null
    const imageData = imageDataSource.value
    if (!imageData) {
      errorMessage.value = { title: 'Invalid Input', message: 'No Target Image' }
      return
    }
    if (!ruleset.value) return
    if (!indexedImage.value) return
    terminateWorker()
    running.value = true

    worker = new Worker(new URL('./WFC.worker.ts', import.meta.url), {
      type: 'module',
    })

    const { palette } = indexedImage.value

    const avgColor = indexedImageToAverageColor(indexedImage.value)
    const opts: WFCWorkerOptions = {
      settings: { ...toValue(settings), palette, avgColor },
      modelType: settings.modelType,
      serializedRuleset: serializeWFCRuleset(ruleset.value),
    }
    worker.postMessage(opts)

    worker.onmessage = (e) => {
      const response = e.data as WorkerResponse
      handlers[response.type]?.(response)
      currentAttempt.elapsedTime = performance.now() - currentAttempt.startedAt
    }
  }

  function terminateWorker() {
    hasResult.value = false
    completeWorker()
  }

  function completeWorker() {
    running.value = false
    if (worker) {
      worker.terminate()
      worker = null
    }
  }

  return {
    terminateWorker,
    running,
    errorMessage,
    run,
    hasResult,
    finalAttempt,
    currentAttempt,
    imageDataSource,
  }
}

export type WFCAttempt = Omit<WFCWorkerAttempt, 'startedAt'> & {
  encoded: string,
}
export type WFCWorkerAttempt = {
  attempt: number,
  startedAt: number,
  reverts: number,
  elapsedTime: number,
  filledPercent: number,
  totalMemoryUseBytes: number,
}

export function makeWFCAttempt() {
  return reactive<WFCWorkerAttempt>({
    attempt: 0,
    startedAt: 0,
    filledPercent: 0,
    elapsedTime: 0,
    reverts: 0,
    totalMemoryUseBytes: 0,
  })
}

export function resetWFCAttempt(result: WFCWorkerAttempt, attempt: number) {
  result.attempt = attempt
  result.filledPercent = 0
  result.startedAt = performance.now()
  result.elapsedTime = 0
  result.reverts = 0
}