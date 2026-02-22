import { type ComputedRef, type Reactive, ref, shallowRef, toValue } from 'vue'
import { makeImageDataAnalyzer } from '../ImageDataAnalyzer.ts'
import { type ColorData } from '../WFCPixelBuffer.ts'
import { serializeWFCRuleset, type WFCRuleset } from '../WFCRuleset.ts'
import {
  type MsgAttemptFailure,
  type MsgAttemptPreview,
  type MsgAttemptStart,
  type MsgAttemptSuccess,
  type OverlappingNWorkerOptions,
  WorkerMsg,
  type WorkerResponse,
} from './OverlappingN.worker.ts'
import { makeOverlappingNAttempt, resetOverlappingNAttempt } from './OverlappingNAttempt.ts'
import { ModelType } from './OverlappingNModel.ts'

export type OverlappingNControllerOptions = {
  settings: Reactive<OverlappingNWorkerOptions['settings']>,
  ruleset: ComputedRef<WFCRuleset | null>,
  colorData: ComputedRef<ColorData>,
  onBeforeRun?(): void,
  onPreview?(response: MsgAttemptPreview, pixels: Uint8ClampedArray<ArrayBuffer>): void,
  onAttemptStart?(response: MsgAttemptStart): void,
  onAttemptFailure?(response: MsgAttemptFailure): void,
  onSuccess?(response: MsgAttemptSuccess, pixels: Uint8ClampedArray<ArrayBuffer>): void,
}

export function makeOverlappingNController(
  {
    settings,
    onPreview,
    onAttemptFailure,
    onSuccess,
    onAttemptStart,
    onBeforeRun,
    ruleset,
    colorData,
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

  const handlers: Partial<Record<WorkerMsg, (data: any) => void>> = {
    [WorkerMsg.ATTEMPT_START]: (data: MsgAttemptStart) => {
      resetOverlappingNAttempt(currentAttempt, data.attempt)
      onAttemptStart?.(data)
    },

    [WorkerMsg.ATTEMPT_PREVIEW]: (data: MsgAttemptPreview) => {
      const pixels = new Uint8ClampedArray(data.result.buffer)
      currentAttempt.filledPercent = data.filledPercent
      currentAttempt.reverts = data.reverts
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
    if (!colorData.value) return
    terminateWorker()
    running.value = true

    worker = new Worker(new URL('./OverlappingN.worker.ts', import.meta.url), {
      type: 'module',
    })

    const { palette, avgColor } = colorData.value

    const opts: OverlappingNWorkerOptions = {
      settings: { ...toValue(settings) },
      modelType: ModelType.WASM,
      palette,
      avgColor,
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
