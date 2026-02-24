import { makeMulberry32 } from '../../util/mulberry32.ts'
import { IterationResult } from '../WFCModel.ts'
import { makeWFCPixelBuffer } from '../WFCPixelBuffer.ts'
import { deserializeWFCRuleset, type SerializedWFCRuleset } from '../WFCRuleset.ts'
import { ModelType, ModelTypeFactory, type OverlappingNOptions } from './OverlappingNModel.ts'

export enum WorkerMsg {
  ATTEMPT_START = 'ATTEMPT_START',
  ATTEMPT_PREVIEW = 'ATTEMPT_PREVIEW',
  ATTEMPT_SUCCESS = 'ATTEMPT_SUCCESS',
  ATTEMPT_FAILURE = 'ATTEMPT_FAILURE',
  ATTEMPT_FINAL_FAILURE = 'ATTEMPT_FINAL_FAILURE',
  ERROR = 'ERROR',
}

export type MsgAttemptStart = {
  type: WorkerMsg.ATTEMPT_START
  attempt: number
}

type Msg<T extends WorkerMsg> = {
  type: T
  attempt: number
  elapsedTime: number
  filledPercent: number
  reverts: number
  result: Uint8ClampedArray<ArrayBuffer>,
  totalMemoryUseBytes: number,
}

export type MsgAttemptPreview = Msg<WorkerMsg.ATTEMPT_PREVIEW>
export type MsgAttemptFailure = Msg<WorkerMsg.ATTEMPT_FAILURE>
export type MsgAttemptSuccess = Msg<WorkerMsg.ATTEMPT_SUCCESS> & {
  totalElapsedTime: number
  totalReverts: number
}
export type MsgAttemptFinalFailure = Msg<WorkerMsg.ATTEMPT_FINAL_FAILURE> & {
  totalElapsedTime: number
  totalReverts: number
}

export type MsgError = {
  type: WorkerMsg.ERROR
  message: string
}

export type WorkerResponse =
  | MsgAttemptStart
  | MsgAttemptPreview
  | MsgAttemptSuccess
  | MsgAttemptFailure
  | MsgAttemptFinalFailure
  | MsgError

export type OverlappingNWorkerOptions = {
  modelType: ModelType,
  palette: Uint8Array,
  avgColor: number,
  serializedRuleset: SerializedWFCRuleset,
  settings: Omit<OverlappingNOptions, 'ruleset'> & {
    seed: number,
    maxAttempts: number,
    maxRevertsPerAttempt: number,
    previewInterval: number,
    contradictionColor: number,
  }
}

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e: MessageEvent<OverlappingNWorkerOptions>) => {
  const postMsg = <T extends WorkerMsg>(
    type: T,
    extra: Omit<Extract<WorkerResponse, { type: T }>, 'type'>,
    transfer: Transferable[] = [],
  ) => {
    ctx.postMessage({ type, ...extra }, transfer)
  }
  try {
    const startedAt = performance.now()
    const { settings, modelType, palette, avgColor, serializedRuleset } = e.data

    const modelFactory = ModelTypeFactory[modelType]
    const model = await modelFactory({
      ruleset: deserializeWFCRuleset(serializedRuleset),
      ...settings,
    })

    const mulberry32 = makeMulberry32(settings.seed)

    const buffer = makeWFCPixelBuffer({
      palette,
      T: model.T,
      N: model.N,
      width: settings.width,
      height: settings.height,
      weights: model.ruleset.weights,
      patterns: model.ruleset.patterns,
      bgColor: avgColor,
      contradictionColor: settings.contradictionColor,
    })

    const syncVisuals = () => buffer.updateCells(model.getWave(), model.getObserved(), model.getChanges())

    let totalReverts = 0

    for (let attempt = 1; attempt <= settings.maxAttempts; attempt++) {
      const attemptStartedAt = performance.now()
      let revertsInAttempt = 0
      let stepCount = 0

      model.clear()
      buffer.clear()

      syncVisuals()
      postMsg(WorkerMsg.ATTEMPT_START, { attempt })

      let attemptActive = true

      while (attemptActive) {
        stepCount++
        const result = model.singleIterationWithSnapShots(mulberry32)
        syncVisuals()

        if (result === IterationResult.SUCCESS) {
          const img = buffer.getVisualBuffer()
          postMsg(WorkerMsg.ATTEMPT_SUCCESS, {
            attempt,
            elapsedTime: performance.now() - attemptStartedAt,
            filledPercent: 1,
            reverts: revertsInAttempt,
            result: img,
            totalElapsedTime: performance.now() - startedAt,
            totalReverts,
            totalMemoryUseBytes: model.getTotalMemoryUseBytes(),
          }, [img.buffer])
          return
        }

        if (result === IterationResult.REVERT) {
          revertsInAttempt++
          totalReverts++
        }

        const isLastRevert = revertsInAttempt >= settings.maxRevertsPerAttempt
        const isFailure = isLastRevert || result === IterationResult.FAIL
        const isPreviewTime = stepCount % settings.previewInterval === 0

        if (isFailure) {
          let isLastAttempt = attempt === settings.maxAttempts

          if (isLastAttempt) {
            const finalImg = buffer.getVisualBuffer()
            postMsg(WorkerMsg.ATTEMPT_FINAL_FAILURE, {
              attempt,
              elapsedTime: performance.now() - attemptStartedAt,
              filledPercent: model.filledPercent(),
              reverts: revertsInAttempt,
              result: finalImg,
              totalElapsedTime: performance.now() - startedAt,
              totalReverts,
              totalMemoryUseBytes: model.getTotalMemoryUseBytes(),

            }, [finalImg.buffer])
            return // Stop everything, we are done.
          }

          const img = buffer.getVisualBuffer()
          postMsg(WorkerMsg.ATTEMPT_FAILURE, {
            attempt,
            elapsedTime: performance.now() - attemptStartedAt,
            filledPercent: model.filledPercent(),
            reverts: revertsInAttempt,
            result: img,
            totalMemoryUseBytes: model.getTotalMemoryUseBytes(),
          }, [img.buffer])
          attemptActive = false

        } else if (isPreviewTime) {
          const img = buffer.getVisualBuffer()
          postMsg(WorkerMsg.ATTEMPT_PREVIEW, {
            attempt,
            elapsedTime: performance.now() - startedAt,
            filledPercent: model.filledPercent(),
            result: img,
            reverts: revertsInAttempt,
            totalMemoryUseBytes: model.getTotalMemoryUseBytes(),
          }, [img.buffer])
        }
      }
    }
  } catch (err) {
    postMsg(WorkerMsg.ERROR, {
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}