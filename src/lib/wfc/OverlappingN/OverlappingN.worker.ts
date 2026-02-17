import { makeMulberry32 } from '../../util/mulberry32.ts'
import { IterationResult } from '../WFCModel.ts'
import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import { makeOverlappingModelFromImageData, type OverlappingNOptions } from './OverlappingN.ts'

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

export type MsgAttemptStart = {
  type: WorkerMsg.ATTEMPT_START
  attempt: number
}
export type MsgAttemptEnd = {
  type: WorkerMsg.ATTEMPT_END
  attempt: number
  elapsedTime: number
  filledPercent: number,
}
export type MsgSuccess = {
  type: WorkerMsg.SUCCESS
  attempt: number
  repairs: number
  result: Uint8ClampedArray<ArrayBuffer>
  totalElapsedTime: number
}
export type MsgPreview = {
  type: WorkerMsg.PREVIEW
  attempt: number
  result: Uint8ClampedArray<ArrayBuffer>
  filledPercent: number
  repairs: number
}
export type MsgAttemptFailure = {
  type: WorkerMsg.ATTEMPT_FAILURE
  attempt: number
  repairs: number
  result: Uint8ClampedArray<ArrayBuffer>
  elapsedTime: number
  filledPercent: number
}
export type MsgFailure = {
  type: WorkerMsg.FAILURE
  totalAttempts: number
  totalRepairs: number
  totalElapsedTime: number
  result: Uint8ClampedArray<ArrayBuffer>
  filledPercent: number
}
export type MsgError = {
  type: WorkerMsg.ERROR
  message: string
}

export type WorkerResponse =
  | MsgAttemptStart
  | MsgAttemptEnd
  | MsgAttemptFailure
  | MsgSuccess
  | MsgPreview
  | MsgFailure
  | MsgError

export type OverlappingNWorkerOptions = {
  id: string,
  imageData: ImageData,
  settings: Omit<OverlappingNOptions, 'sample' | 'sampleWidth' | 'sampleHeight'> & {
    seed: number,
    maxAttempts: number,
    maxRepairsPerAttempt: number,
    previewInterval: number,
    contradictionColor: number,
  }
}
const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<OverlappingNWorkerOptions>) => {
  try {
    if (e.data.id !== WFC_WORKER_ID) return
    const startedAt = performance.now()

    const { imageData, settings } = e.data
    const { maxRepairsPerAttempt, seed, maxAttempts, previewInterval } = settings
    const { model, palette, avgColor } = makeOverlappingModelFromImageData(imageData, settings)

    // 3. Init Rendering Buffer (Bridging Palette + Patterns)
    const buffer = makeWFCPixelBuffer({
      palette,
      T: model.T,
      N: settings.N,
      width: settings.width,
      height: settings.height,
      weights: model.weights,
      patterns: model.patterns,
      bgColor: avgColor,
      contradictionColor: settings.contradictionColor,
    })

    const mulberry32 = makeMulberry32(seed)
    let totalRepairsAcrossAllTries = 0

    for (let i = 0; i < maxAttempts; i++) {
      const currentAttempt = i + 1
      let repairsInThisAttempt = 0
      let stepCount = 0

      ctx.postMessage({ type: WorkerMsg.ATTEMPT_START, attempt: currentAttempt })

      model.clear()
      buffer.clear()
      // Initial sync for the blank state
      buffer.updateCells(model.getWave(), model.getChanges())

      let attemptFinished = false
      const startTime = performance.now()
      let maxFilledPercent = 0

      while (!attemptFinished) {

        const result = model.singleIteration(mulberry32)

        // 4. Update the visual buffer only for changed cells
        buffer.updateCells(model.getWave(), model.getChanges())

        if (result !== IterationResult.REPAIR) {
          const currentFilled = model.filledPercent()
          if (currentFilled > maxFilledPercent) {
            maxFilledPercent = currentFilled
          }
        }

        if (result === IterationResult.REPAIR) {
          repairsInThisAttempt++
          totalRepairsAcrossAllTries++

          if (repairsInThisAttempt >= maxRepairsPerAttempt) {
            const currentData = buffer.getVisualBuffer()
            const msg: MsgAttemptFailure = {
              type: WorkerMsg.ATTEMPT_FAILURE,
              attempt: currentAttempt,
              repairs: repairsInThisAttempt,
              result: currentData,
              elapsedTime: performance.now() - startTime,
              filledPercent: maxFilledPercent,
            }

            ctx.postMessage(msg)
            attemptFinished = true
          }
          continue
        }

        if (result === IterationResult.SUCCESS) {
          const finalImage = buffer.getVisualBuffer()
          const msg: MsgSuccess = {
            type: WorkerMsg.SUCCESS,
            attempt: currentAttempt,
            repairs: repairsInThisAttempt,
            result: finalImage,
            totalElapsedTime: performance.now() - startedAt,
          }
          ctx.postMessage(msg, [finalImage.buffer])
          return
        }

        if (result === IterationResult.STEP) {
          stepCount++
          if (stepCount % previewInterval === 0) {
            const previewData = buffer.getVisualBuffer()
            const msg: MsgPreview = {
              type: WorkerMsg.PREVIEW,
              attempt: currentAttempt,
              result: previewData,
              filledPercent: model.filledPercent(),
              repairs: repairsInThisAttempt,
            }
            // Use transferable objects for high performance
            ctx.postMessage(msg)
          }
        }
      }

      const msg: MsgAttemptEnd = {
        type: WorkerMsg.ATTEMPT_END,
        attempt: currentAttempt,
        elapsedTime: performance.now() - startTime,
        filledPercent: model.filledPercent(),
      }
      ctx.postMessage(msg)
    }

    // 5. Final Failure (Ran out of tries)
    const finalImage = buffer.getVisualBuffer()
    const msg: MsgFailure = {
      type: WorkerMsg.FAILURE,
      totalAttempts: maxAttempts,
      totalRepairs: totalRepairsAcrossAllTries,
      result: finalImage,
      totalElapsedTime: performance.now() - startedAt,
      filledPercent: model.filledPercent(),
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