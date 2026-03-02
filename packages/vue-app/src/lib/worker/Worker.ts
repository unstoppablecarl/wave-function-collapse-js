
import { IterationResult } from '@unstoppablecarl/wfc-js'
import { BaseWorkerMsg } from './WorkerController.ts'

export interface WorkerModelInterface {
  step(): IterationResult
  getProgress(): number
  getStabilityPercent(): number
  getVisualBuffer(): Uint8ClampedArray
}

export function makeWorkerHandler<
  TOptions extends { previewInterval: number },
  TModel extends WorkerModelInterface = WorkerModelInterface,
  TExtra = object,
>(
  ctx: DedicatedWorkerGlobalScope,
  createModel: (opts: TOptions) => Promise<TModel>,
  getExtraProps?: (model: TModel) => TExtra,
) {
  ctx.onmessage = async (e: MessageEvent<TOptions>) => {
    const startedAt = performance.now()
    const options = e.data
    const previewInterval = options.previewInterval
    const batchSize = Math.max(previewInterval, 1)

    const postMsg = (
      type: BaseWorkerMsg,
      data: any,
      transfer: Transferable[] = [],
    ) => {
      ctx.postMessage({ type, ...data }, transfer)
    }

    try {
      const model = await createModel(options)

      const runBatch = () => {
        try {
          let status = IterationResult.STEP

          for (let i = 0; i < batchSize; i++) {
            status = model.step()
            if (status !== IterationResult.STEP) break
          }

          const elapsedTime = performance.now() - startedAt
          const progressPercent = model.getProgress()
          const stabilityPercent = model.getStabilityPercent()
          const buffer = model.getVisualBuffer()
          const extra = getExtraProps?.(model) ?? ({} as TExtra)

          const baseData = {
            elapsedTime,
            progressPercent,
            stabilityPercent,
            result: buffer,
            ...extra,
          }

          if (status === IterationResult.SUCCESS) {
            postMsg(BaseWorkerMsg.SUCCESS, {
              ...baseData,
              progressPercent: 1.0,
            }, [buffer.buffer])
            return
          }

          if (status === IterationResult.FAIL) {
            postMsg(BaseWorkerMsg.FAILURE, baseData, [buffer.buffer])
            return
          }

          postMsg(BaseWorkerMsg.PREVIEW, baseData, [buffer.buffer])

          // yields the worker thread so the engine can manage the Map's memory.
          // prevents crashes
          setTimeout(runBatch, 0)
        } catch (err) {
          postMsg(BaseWorkerMsg.ERROR, {
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      runBatch()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      postMsg(BaseWorkerMsg.ERROR, {
        message: errMsg,
      })
    }
  }
}