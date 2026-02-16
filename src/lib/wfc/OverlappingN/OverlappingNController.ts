import { type Reactive, ref, shallowRef, toValue } from 'vue'
import { makeImageDataAnalyzer } from '../ImageDataAnalyzer.ts'
import {
  type MsgAttemptFailure,
  type MsgPreview,
  type MsgSuccess,
  type OverlappingNWorkerOptions,
  WFC_WORKER_ID,
  WorkerMsg,
  type WorkerResponse,
} from './OverlappingN.worker.ts'
import { makeOverlappingNAttempt, resetOverlappingNAttempt } from './OverlappingNAttempt.ts'

export type OverlappingNControllerOptions = {

  settings: Reactive<OverlappingNWorkerOptions['settings']>,
  onBeforeRun?(): void,
  onPreview?(response: MsgPreview, pixels: Uint8ClampedArray<ArrayBuffer>): void,
  onAttemptFailure?(response: MsgAttemptFailure): void,
  onSuccess?(response: MsgSuccess, pixels: Uint8ClampedArray<ArrayBuffer>): void,
}

export function makeOverlappingNController(
  {
    settings,
    onPreview,
    onAttemptFailure,
    onSuccess,
    onBeforeRun,
  }: OverlappingNControllerOptions,
) {
  let worker: Worker | null = null

  const imageDataSource = shallowRef<ImageData | null>(null)
  const running = ref(false)
  const hasResult = ref(false)
  const errorMessage = shallowRef<{ title: string, message: string } | null>(null)

  const currentAttempt = makeOverlappingNAttempt()
  const finalAttempt = makeOverlappingNAttempt()

  const imageDataAnalysis = makeImageDataAnalyzer(imageDataSource, settings)

  function run() {

    onBeforeRun?.()

    errorMessage.value = null
    const imageData = imageDataSource.value
    if (!imageData) {
      errorMessage.value = { title: 'Invalid Input', message: 'No Target Image' }
      return
    }
    terminateWorker()
    running.value = true

    // Initialize Worker
    worker = new Worker(new URL('./OverlappingN.worker.ts', import.meta.url), {
      type: 'module',
    })

    // Send data to worker
    worker.postMessage({
      id: WFC_WORKER_ID,
      imageData: imageDataSource.value,
      settings: { ...toValue(settings) },
    })

    worker.onmessage = (e) => {
      const response = e.data as WorkerResponse
      const { type } = response

      currentAttempt.elapsedTime = performance.now() - currentAttempt.startedAt

      if (type === WorkerMsg.ATTEMPT_START) {
        const { attempt } = response
        resetOverlappingNAttempt(currentAttempt, attempt)
      }

      if (type === WorkerMsg.ATTEMPT_END) {

      }

      if (type === WorkerMsg.PREVIEW) {
        const { result, filledPercent, repairs } = response
        const pixels = new Uint8ClampedArray(result.buffer)
        onPreview?.(response, pixels)

        currentAttempt.filledPercent = filledPercent
        currentAttempt.repairs = repairs
      }

      if (type === WorkerMsg.ATTEMPT_FAILURE) {
        const { result, attempt } = response
        if (result.byteLength === 0) {
          console.error(`Attempt ${attempt} received an empty buffer!`)
          return
        }

        onAttemptFailure?.(response)
      }

      if (type === WorkerMsg.SUCCESS) {
        const { result } = response
        const pixels = new Uint8ClampedArray(result.buffer)
        onSuccess?.(response, pixels)
        completeWorker()
        Object.assign(finalAttempt, currentAttempt)
        finalAttempt.filledPercent = 1
      }

      if (type === WorkerMsg.FAILURE) {
        hasResult.value = false
        completeWorker()
      }

      if (type === WorkerMsg.ERROR) {
        const { message } = response
        hasResult.value = false
        completeWorker()
        throw new Error(message)
      }
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
    completeWorker,
    running,
    errorMessage,
    imageDataAnalysis,
    run,
    hasResult,
    finalAttempt,
    currentAttempt,
    imageDataSource,
  }
}
