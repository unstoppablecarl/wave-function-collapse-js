import { makeMulberry32 } from './mulberry32.ts'
import { makeOverlappingModel } from './OverlappingModel.ts'

export function generateOverlapping(
  {
    imageData,
    destWidth,
    destHeight,
    N,
    periodicInput = true,
    periodicOutput = true,
    symmetry = 2,
    ground = 0,
    seed = 1,
    maxTries = 10
  }: {
    imageData: ImageData,
    destWidth: number,
    destHeight: number,
    N: number,
    periodicInput?: boolean,
    periodicOutput?: boolean,
    symmetry?: number,
    ground?: number,
    seed?: number,
    maxTries?: number,
  }) {
  const data = new Uint8ClampedArray(imageData.data)
  const width = imageData.width
  const height = imageData.height

  console.log({
    width, height, N, destWidth, destHeight, periodicInput, periodicOutput, symmetry, ground
  })

  const model = makeOverlappingModel(data, width, height, N, destWidth, destHeight, periodicInput, periodicOutput, symmetry, ground)

  const mulberry32 = makeMulberry32(seed)
  const finished = model.generateWithRetry(mulberry32, maxTries)

  if (finished) {
    const result = model.graphics()

    const outImgData = new ImageData(destWidth, destHeight)
    outImgData.data.set(result)

    return outImgData
  }
}