// src/workers/wfc.worker.ts

// Explicitly type 'self' to get the correct postMessage signature
import { makeRunner } from './generator.ts'

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.onmessage = async (e) => {
  const { imageData, settings } = e.data
  const { maxTries, ...wfcParams } = settings

  const runner = makeRunner({
    imageData,
    ...wfcParams,
    destWidth: settings.width,
    destHeight: settings.height,
  })

  for (let i = 0; i < maxTries; i++) {
    ctx.postMessage({ type: 'attempt', attempt: i + 1 })

    const result = runner()
    if (result) {
      // Transfer the underlying ArrayBuffer to the main thread (zero-copy)
      // This uses the signature: postMessage(message, transfer)
      ctx.postMessage({ type: 'success', result }, [result.data.buffer])
      return
    }
  }

  ctx.postMessage({ type: 'failure' })
}