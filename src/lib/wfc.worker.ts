import { makeMulberry32 } from './mulberry32.ts'
import { makeOverlappingModel, type OverlappingModelOptions } from './OverlappingModel.ts'
import { IterationResult } from './WFCModel.ts'

export const WFC_WORKER_ID = 'WFC_WORKER'

export enum WorkerMsg {
  ATTEMPT_START = 'ATTEMPT_START',
  ATTEMPT_END = 'ATTEMPT_END',
  ATTEMPT_FAILURE = 'ATTEMPT_FAILURE',
  FAILURE = 'FAILURE',
  SUCCESS = 'SUCCESS',
  PREVIEW = 'PREVIEW',
  ERROR = 'ERROR',
}

type MsgAttemptStart = { type: WorkerMsg.ATTEMPT_START; attempt: number }
type MsgAttemptEnd = { type: WorkerMsg.ATTEMPT_END; attempt: number, elapsedTime: number }
type MsgSuccess = { type: WorkerMsg.SUCCESS; attempt: number; repairs: number; result: Uint8ClampedArray<ArrayBuffer> }
type MsgPreview = { type: WorkerMsg.PREVIEW; attempt: number; result: Uint8ClampedArray<ArrayBuffer> }
type MsgAttemptFailure = {
  type: WorkerMsg.ATTEMPT_FAILURE;
  attempt: number;
  repairs: number,
  result: Uint8ClampedArray<ArrayBuffer>,
  elapsedTime: number,
  filledPercent: number,
}

type MsgFailure = {
  type: WorkerMsg.FAILURE;
  totalAttempts: number;
  totalRepairs: number,
  result: Uint8ClampedArray<ArrayBuffer>
}
type MsgError = { type: WorkerMsg.ERROR; message: string }

export type WorkerResponse =
  | MsgAttemptStart
  | MsgAttemptEnd
  | MsgAttemptFailure
  | MsgSuccess
  | MsgPreview
  | MsgFailure
  | MsgError

export type WfCWorkerOptions = {
  id: string,
  imageData: ImageData,
  settings: Omit<OverlappingModelOptions, 'imageData'> & {
    seed: number,
    maxTries: number,
    maxRepairsPerAttempt: number,
    previewInterval: number,
  }
}
const ctx: DedicatedWorkerGlobalScope = self as any

ctx.onmessage = async (e: MessageEvent<WfCWorkerOptions>) => {
  try {
    if (e.data.id !== WFC_WORKER_ID) return
    const { imageData, settings } = e.data
    const { maxRepairsPerAttempt, seed, maxTries, previewInterval } = settings

    const model = makeOverlappingModel({
      imageData,
      ...settings,
    })

    const mulberry32 = makeMulberry32(seed)
    let totalRepairsAcrossAllTries = 0

    for (let i = 0; i < maxTries; i++) {
      const currentAttempt = i + 1
      let repairsInThisAttempt = 0
      let stepCount = 0

      ctx.postMessage({ type: WorkerMsg.ATTEMPT_START, attempt: currentAttempt })
      model.clear()

      let attemptFinished = false
      const startTime = performance.now()

      while (!attemptFinished) {
        const result = model.singleIteration(mulberry32)

        if (result === IterationResult.REPAIR) {
          repairsInThisAttempt++
          totalRepairsAcrossAllTries++

          if (repairsInThisAttempt > maxRepairsPerAttempt) {
            const currentData = model.graphics()
            const msg: MsgAttemptFailure = {
              type: WorkerMsg.ATTEMPT_FAILURE,
              attempt: currentAttempt,
              repairs: repairsInThisAttempt,
              result: currentData,
              elapsedTime: performance.now() - startTime,
              filledPercent: model.filledPercent(),
            }

            ctx.postMessage(msg)
            attemptFinished = true
          }
          continue
        }

        if (result === IterationResult.SUCCESS) {
          const finalImage = model.graphics()
          const msg: MsgSuccess = {
            type: WorkerMsg.SUCCESS,
            attempt: currentAttempt,
            repairs: repairsInThisAttempt,
            result: finalImage,
          }
          ctx.postMessage(msg, [finalImage.buffer])
          return
        }

        if (result === IterationResult.STEP) {
          stepCount++
          if (stepCount % previewInterval === 0) {
            const msg: MsgPreview = {
              type: WorkerMsg.PREVIEW,
              attempt: currentAttempt,
              result: model.graphics(),
            }
            ctx.postMessage(msg)
          }
        }
      }

      const msg: MsgAttemptEnd = {
        type: WorkerMsg.ATTEMPT_END,
        attempt: currentAttempt,
        elapsedTime: performance.now() - startTime,
      }
      ctx.postMessage(msg)
    }

    // 5. Final Failure (Ran out of tries)
    const finalImage = model.graphics()
    const msg: MsgFailure = {
      type: WorkerMsg.FAILURE,
      totalAttempts: maxTries,
      totalRepairs: totalRepairsAcrossAllTries,
      result: finalImage,
    }
    ctx.postMessage(msg, [finalImage.buffer])

  } catch (err) {
    const msg: MsgError = {
      type: WorkerMsg.ERROR,
      message: err instanceof Error ? err.message : String(err),
    }
    ctx.postMessage(msg)
  }
}