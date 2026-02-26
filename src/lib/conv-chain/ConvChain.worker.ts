import type { IndexedImage } from 'pixel-data-js'
import { IterationResult } from '../_types.ts'
import { makeMulberry32 } from '../util/mulberry32.ts'
import { createConvChainBinary } from './ConvChainBinary.ts'

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

export type ConvChainWorkerOptions = {
  width: number,
  height: number,
  N: number,
  temperature: number,
  maxIterations: number,
  indexedImage: IndexedImage,
  seed: number,
  previewInterval: number,
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

  const { seed, previewInterval, ...options } = e.data

  const prng = makeMulberry32(seed)
  const model = await createConvChainBinary({ ...options, prng })
  const startedAt = performance.now()

  try {
    let result = IterationResult.STEP
    while (result === IterationResult.STEP) {
      result = model.step()
      const iteration = model.getIteration()

      if (result === IterationResult.SUCCESS) {
        const buffer = model.getVisualBuffer()
        postMsg(WorkerMsg.SUCCESS, {
          result: buffer,
          elapsedTime: performance.now() - startedAt,
          progressPercent: 1.0,
        })
        break
      }

      if (iteration % previewInterval === 0) {
        const buffer = model.getVisualBuffer()
        postMsg(WorkerMsg.PREVIEW, {
          result: buffer,
          elapsedTime: performance.now() - startedAt,
          progressPercent: model.getProgress(),
        })
      }
    }
  } catch (err) {
    postMsg(WorkerMsg.ERROR, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}