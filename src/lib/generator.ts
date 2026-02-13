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
    ground = 102,
  }: {
    imageData: ImageData,
    destWidth: number,
    destHeight: number,
    N: number,
    periodicInput?: boolean,
    periodicOutput?: boolean,
    symmetry?: number,
    ground?: number
  }) {
  const data = new Uint8ClampedArray(imageData.data)
  const width = imageData.width
  const height = imageData.height

  const model = makeOverlappingModel(data, width, height, N, destWidth, destHeight, periodicInput, periodicOutput, symmetry, ground)

  const mulberry32 = makeMulberry32(3)
  const finished = model.generate(mulberry32)

  if (finished) {
    const result = model.graphics()

    const outImgData = new ImageData(destWidth, destHeight)
    outImgData.data.set(result)

    return outImgData
  }
}