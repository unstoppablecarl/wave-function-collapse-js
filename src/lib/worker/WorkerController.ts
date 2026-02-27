import { type ComputedRef, type Reactive, ref, shallowRef } from 'vue'

export enum BaseWorkerMsg {
  FAILURE = 'FAILURE',
  PREVIEW = 'PREVIEW',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

type BaseMsgProps = {
  elapsedTime: number
  progressPercent: number
  result: Uint8ClampedArray
}

export type MsgPreview<TExtra = object> = { type: BaseWorkerMsg.PREVIEW } & BaseMsgProps & TExtra
export type MsgSuccess<TExtra = object> = { type: BaseWorkerMsg.SUCCESS } & BaseMsgProps & TExtra
export type MsgFailure<TExtra = object> = { type: BaseWorkerMsg.FAILURE } & BaseMsgProps & TExtra

export type MsgError = {
  type: BaseWorkerMsg.ERROR
  message: string
}

export type BaseWorkerResponse<TExtra = object> =
  | MsgPreview<TExtra>
  | MsgSuccess<TExtra>
  | MsgFailure<TExtra>
  | MsgError

export type GenericControllerOptions<
  TData,
  TSettings,
  TExtra = object,
> = {
  settings: Reactive<TSettings>,
  inputData: ComputedRef<TData | null>,
  onStart?(): void,
  onPreview?(data: MsgPreview<TExtra>): void,
  onSuccess?(data: MsgSuccess<TExtra>): void,
  onError?(data: MsgError): void,
  onFailure?(data: MsgFailure<TExtra>): void,
}

export function makeWorkerController<
  TData, TSettings, TExtra = object
>(
  workerUrl: URL,
  {
    settings,
    inputData,

    onPreview,
    onSuccess,
    onError,
    onFailure,
    onStart,
  }: GenericControllerOptions<TData, TSettings, TExtra>,
) {
  let worker: Worker | null = null
  const running = ref(false)
  const errorMessage = shallowRef<{ title: string, message: string } | null>(null)

  const terminateWorker = () => {
    if (worker) {
      worker.terminate()
      running.value = false
      worker = null
    }
  }

  const run = () => {
    if (worker) {
      worker.terminate()
    }

    errorMessage.value = null
    if (!inputData.value) {
      errorMessage.value = {
        title: 'Invalid Input',
        message: 'No Input Data Provided',
      }
      return
    }

    worker = new Worker(workerUrl, {
      type: 'module',
    })

    running.value = true
    onStart?.()

    worker.onmessage = (e: MessageEvent<BaseWorkerResponse<TExtra>>) => {
      const msg = e.data

      switch (msg.type) {
        case BaseWorkerMsg.PREVIEW:
          onPreview?.(msg)
          break
        case BaseWorkerMsg.SUCCESS:
          onSuccess?.(msg)
          terminateWorker()
          break
        case BaseWorkerMsg.FAILURE:
          onFailure?.(msg)
          terminateWorker()
          break
        case BaseWorkerMsg.ERROR:
          onError?.(msg as unknown as MsgError)
          terminateWorker()
          break
      }
    }

    worker.postMessage({
      indexedImage: inputData.value,
      ...settings,
    })
  }

  return {
    run,
    terminateWorker,
    running,
    errorMessage,
  }
}