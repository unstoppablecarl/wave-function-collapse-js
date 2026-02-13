import { makeMulberry32 } from './mulberry32.ts'
import { makeOverlappingModel, type OverlappingModelOptions } from './OverlappingModel.ts'

export type WfCWorkerOptions = {
  imageData: ImageData,
  settings: Omit<OverlappingModelOptions, 'data' | 'dataWidth' | 'dataHeight'> & {
    seed: number,
    maxTries: number,
    maxRepairsPerAttempt: number
  }
}

const ctx: DedicatedWorkerGlobalScope = self as any
let repairs = 0
ctx.onmessage = async (e: any) => {
  try {
    const { imageData, settings } = e.data as WfCWorkerOptions

    const { maxRepairsPerAttempt, seed, maxTries } = settings

    const model = makeOverlappingModel(
      {
        data: imageData.data,
        dataWidth: imageData.width,
        dataHeight: imageData.height,
        ...settings,
      })

    const mulberry32 = makeMulberry32(seed)

    for (let i = 0; i < maxTries; i++) {
      ctx.postMessage({ type: 'attempt_start', attempt: i + 1 })
      model.clear()

      let finished = false
      let stepCount = 0

      while (!finished) {
        // Run one unit of work
        const result = model.singleIteration(mulberry32)

        if (result === 'repair') {
          repairs++
          if (repairs > maxRepairsPerAttempt) {
            console.warn('Max repairs reached for this attempt. Restarting...')
            finished = true // This exits the while loop, failing this attempt
            continue
          }
          continue // Continue to the next singleIteration
        }

        if (result !== null) {
          finished = true
          if (result === true) {
            // Success! Send final image
            const finalData = model.graphics()
            ctx.postMessage({ type: 'success', result: finalData }, [finalData.buffer])
            return
          }
        }

        stepCount++
        if (stepCount % 50 === 0) {
          const previewData = model.graphics()
          ctx.postMessage({ type: 'preview', result: previewData })
        }
      }
      ctx.postMessage({ type: 'attempt_end', attempt: i + 1 })
    }
    ctx.postMessage({ type: 'failure' })
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as any).message })
  }
}