import type { IndexedImage } from 'pixel-data-js'
import { IterationResult } from '../_types.ts'
import type { ConvChainStoreSettings } from '../store/ConvChainStore.ts'
import { ConvChainModelTypeFactory } from './ConvChain.ts'

export enum WorkerMsg {
  FAILURE = 'FAILURE',
  PREVIEW = 'PREVIEW',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

type Msg<T extends WorkerMsg> = {
  type: T
  elapsedTime: number
  progressPercent: number
  result: Uint8ClampedArray
  stabilityPercent: number,
}

export type MsgPreview = Msg<WorkerMsg.PREVIEW>
export type MsgSuccess = Msg<WorkerMsg.SUCCESS>
export type MsgFailure = Msg<WorkerMsg.FAILURE>

export type MsgError = {
  type: WorkerMsg.ERROR
  message: string
}

export type WorkerResponse =
  | MsgPreview
  | MsgSuccess
  | MsgFailure
  | MsgError

export type ConvChainWorkerOptions = ConvChainStoreSettings & {
  indexedImage: IndexedImage,
}
const ctx: DedicatedWorkerGlobalScope = self as any

ctx.onmessage = async (e: MessageEvent<ConvChainWorkerOptions>) => {
  const postMsg = <T extends WorkerMsg>(
    type: T,
    extra: Omit<Extract<WorkerResponse, { type: T }>, 'type'>,
    transfer: Transferable[] = [],
  ) => {
    ctx.postMessage({ type, ...extra }, transfer)
  }

  const {
    modelType,
    previewInterval,
    ...options
  } = e.data

  const factory = ConvChainModelTypeFactory[modelType]
  const model = await factory({ ...options })
  const startedAt = performance.now()
  const batchSize = Math.max(previewInterval, 1)

  const runBatch = () => {
    try {
      let result = IterationResult.STEP

      for (let i = 0; i < batchSize; i++) {
        result = model.step()
        if (result !== IterationResult.STEP) break
      }

      const elapsedTime = performance.now() - startedAt
      const progressPercent = model.getProgress()
      const stabilityPercent = model.getStabilityPercent()
      const buffer = model.getVisualBuffer()

      if (result === IterationResult.SUCCESS) {
        postMsg(WorkerMsg.SUCCESS, {
          result: buffer,
          elapsedTime,
          progressPercent: 1.0,
          stabilityPercent,
        }, [buffer.buffer]) // Transfer ownership to save memory
        return
      }

      // Send preview after completing the batch
      postMsg(WorkerMsg.PREVIEW, {
        result: buffer,
        elapsedTime,
        progressPercent,
        stabilityPercent,
      }, [buffer.buffer])

      // yields the worker thread so the engine can manage the Map's memory.
      // prevents crashes
      setTimeout(runBatch, 0)

    } catch (err) {
      postMsg(WorkerMsg.ERROR, {
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  runBatch()
}