import { shallowRef, watch } from 'vue'
import { imageDataToUrlImage } from '../util/ImageData.ts'

export function makeReactiveInitialStateImageData() {

  const initialImageData = shallowRef<ImageData | null>(null)
  const initialImageDataUrlImage = shallowRef<string | null>(null)

  watch(initialImageData, () => {
    if (!initialImageData.value) {
      initialImageDataUrlImage.value = null
      return
    }
    initialImageDataUrlImage.value = imageDataToUrlImage(initialImageData.value)
  })

  function setInitialImageDataFromFileInput(val: ImageData) {
    initialImageData.value = val
  }

  function clearInitialImage() {
    initialImageData.value = null
  }

  clearInitialImage()

  return {
    initialImageData,
    initialImageDataUrlImage,
    setInitialImageDataFromFileInput,
    clearInitialImage,
  }
}