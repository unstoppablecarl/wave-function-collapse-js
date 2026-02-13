import { makeRunner } from './runner.ts'

const ctx: DedicatedWorkerGlobalScope = self as any
ctx.onmessage = async (e) => {
  try {
    const { imageData, settings } = e.data
    const runner = makeRunner({
      imageData,
      ...settings,
      destWidth: settings.width,
      destHeight: settings.height,
    })

    for (let i = 0; i < settings.maxTries; i++) {
      ctx.postMessage({ type: 'attempt_start', attempt: i + 1 })
      const result = runner()
      ctx.postMessage({ type: 'attempt_end', attempt: i + 1 })

      if (result) {
        ctx.postMessage({ type: 'success', result }, [result.data.buffer])
        return
      }
    }
    ctx.postMessage({ type: 'failure' })
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as any).message })
  }
}