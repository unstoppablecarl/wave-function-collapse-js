import { makeWorkerHandler } from '../worker/Worker.ts'
import { ConvChainModelTypeFactory, type ConvChainOptions } from './ConvChainModel.ts'

const ctx: DedicatedWorkerGlobalScope = self as any

makeWorkerHandler<ConvChainOptions>(
  ctx,
  async (e) => {

    const {
      modelType,
      previewInterval,
      ...options
    } = e

    const factory = ConvChainModelTypeFactory[modelType]
    return await factory({ ...options })
  },
)
