import { imageDataToDataUrl, type IndexedImage } from 'pixel-data-js'
import { makeIndexedImageFromImageData } from 'pixel-data-js'
import { computed, type Ref, shallowRef, watch } from 'vue'
import { dataUrlToImageData, getImgElementImageData } from '../util/ImageData.ts'

export function makePersistedSourceImageData(
  sourceImageDataUrl: Ref<string | null>,
  sourceImageId: Ref<number>,
) {

  const {
    imageData: sourceImageData,
    indexedImage: sourceIndexedImage,
    set: setSourceImage,
    clear: clearSourceImage,
  } = makePersistedIndexedImage(sourceImageDataUrl)

  // Non-persisted: the Vite URL that was used to load the current preset image.
  // Used only in development to detect when a preset file changes via HMR.
  const sourceImagePresetSrc = shallowRef<string | null>(null)

  async function setSourceImageFromElement(target: HTMLImageElement, id: number) {
    // Normalize to path-only so it matches the relative src from import.meta.glob
    sourceImagePresetSrc.value = new URL(target.src, location.origin).pathname
      + new URL(target.src, location.origin).search
    setSourceImage(await getImgElementImageData(target))
    sourceImageId.value = id
  }

  function setSourceImageFromFileInput(data: ImageData) {
    setSourceImage(data)
    sourceImageId.value = -1
  }

  return {
    sourceImageData,
    sourceIndexedImage,
    sourceImagePresetSrc,
    clearSourceImage,
    setSourceImage,
    setSourceImageFromFileInput,
    setSourceImageFromElement,
  }
}

// Manages an ImageData whose URL is persisted in a store ref.
// The decoded ImageData is a shallowRef that is rebuilt on page load from the stored URL.
export function makePersistedImageData(urlRef: Ref<string | null>) {
  const imageData = shallowRef<ImageData | null>(null)

  watch(urlRef, async (url) => {
    imageData.value = url ? await dataUrlToImageData(url) : null
  }, { immediate: true })

  return {
    imageData,
    set(data: ImageData) {
      imageData.value = data
      urlRef.value = imageDataToDataUrl(data)
    },
    clear() {
      imageData.value = null
      urlRef.value = null
    },
  }
}

// Same but also exposes an IndexedImage computed from the decoded ImageData.
export function makePersistedIndexedImage(urlRef: Ref<string | null>) {
  const imageData = shallowRef<ImageData | null>(null)
  const indexedImage = computed<IndexedImage | null>(() =>
    imageData.value ? makeIndexedImageFromImageData(imageData.value) : null,
  )

  watch(urlRef, async (url) => {
    imageData.value = url ? await dataUrlToImageData(url) : null
  }, { immediate: true })

  return {
    imageData,
    indexedImage,
    set(data: ImageData) {
      imageData.value = data
      urlRef.value = imageDataToDataUrl(data)
    },
    clear() {
      imageData.value = null
      urlRef.value = null
    },
  }
}
