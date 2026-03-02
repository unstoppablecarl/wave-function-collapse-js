import { makeIndexedImage } from 'pixel-data-js'
import { computed, markRaw, ref, shallowRef, watch } from 'vue'
import { getImgElementImageData, imageDataToUrlImage } from '../util/ImageData.ts'

export function makeReactiveSourceImageData() {

  const sourceImageId = ref(0)
  const sourceImageData = shallowRef<ImageData | null>(null)
  const sourceImageDataUrlImage = shallowRef<string | null>(null)


  watch(sourceImageData, () => {
    if (!sourceImageData.value) {
      sourceImageDataUrlImage.value = null
      return
    }
    sourceImageDataUrlImage.value = imageDataToUrlImage(sourceImageData.value)
  })

  const sourceIndexedImage = computed(() => {
    if (!sourceImageData.value) return null
    return makeIndexedImage(sourceImageData.value)
  })

  async function setImageDataFromElement(target: HTMLImageElement, imgId: number) {
    const imageData = await getImgElementImageData(target as HTMLImageElement)
    sourceImageData.value = markRaw(imageData)
    sourceImageId.value = imgId
  }

  function setImageDataFromFileInput(val: ImageData) {
    sourceImageId.value = -1
    sourceImageData.value = val
  }

  function clearSourceImage(){
    sourceImageId.value = -1
    sourceImageData.value = null
  }

  clearSourceImage()

  return {
    sourceImageId,
    sourceImageData,
    sourceImageDataUrlImage,
    sourceIndexedImage,
    setImageDataFromElement,
    setImageDataFromFileInput,
    clearSourceImage,
  }
}