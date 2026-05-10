import { makeWorkerHandler } from '../../lib/worker/Worker.ts'
import { TextureSynthesisModelTypeFactory, type TextureSynthesisOptions } from './TextureSynthesisModel.ts'

const ctx: DedicatedWorkerGlobalScope = self as any

makeWorkerHandler<TextureSynthesisOptions>(
  ctx,
  async (e) => {

    const {
      modelType,
      previewInterval,
      ...options
    } = e

    const factory = TextureSynthesisModelTypeFactory[modelType]
    return await factory({ ...options })
  },
)
