import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../../lib/symmetry-options.ts'
import { makePersistedImageData, makePersistedSourceImageData } from '../../lib/vue/makePersistedImage.ts'
import { setupSourceImageHMR } from '../../lib/vue/setupSourceImageHMR.ts'
import { ConvChainModelType, type ConvChainOptions } from './ConvChainModel.ts'

type Exclude =
  | 'guidanceWeight'
  | 'guidanceField'
  | 'indexedImage'
  | 'initialImageData'

export type ConvChainStoreSettings = Omit<Required<ConvChainOptions>, Exclude>

type SerializedData = {
  scale: number,
  settings: ConvChainStoreSettings,
  sourceImageDataUrl: string | null,
  sourceImageId: number,
  initialImageDataUrl: string | null,
}

export const useConvChainStore = defineStore('conv-chain', () => {

  const scale = ref(4)
  const sourceImageDataUrl = ref<string | null>(null)
  const sourceImageId = ref(-1)
  const initialImageDataUrl = ref<string | null>(null)

  const {
    sourceIndexedImage,
    sourceImageData,
    sourceImagePresetSrc,
    setSourceImageFromFileInput,
    setSourceImageFromElement,
    clearSourceImage,
  } = makePersistedSourceImageData(sourceImageDataUrl, sourceImageId)

  const {
    imageData: initialImageData,
    set: setInitialImageData,
    clear: clearInitialImageData,
  } = makePersistedImageData(initialImageDataUrl)

  const settings = reactive<ConvChainStoreSettings>({
    N: 2,
    seed: 1,
    width: 60,
    height: 60,
    periodicInput: true,
    periodicOutput: true,
    symmetry: 1,
    previewInterval: 10,
    modelType: ConvChainModelType.BINARY,
    lockInitialImageData: false,
    temperature: 2,
    maxIterations: 50,
    initialPatchCount: 4,
    initialPatchSize: 4,
  })

  const state = {
    scale,
    settings,
    sourceImageDataUrl,
    sourceImageId,
    initialImageDataUrl,
  }

  const defaults: SerializedData = {
    scale: scale.value,
    settings: { ...toRaw(settings) },
    sourceImageDataUrl: null,
    sourceImageId: -1,
    initialImageDataUrl: null,
  }

  const mapper = makeSimplePersistMapper<SerializedData>(
    state,
    defaults,
  )

  function $reset() {
    // uses defaults to reset all state
    mapper.$reset()
  }

  function $serializeState(): SerializedData {
    return {
      // unwraps reactive values for serialization
      ...mapper.$serializeState(),
    }
  }

  function $restoreState(data: SerializedData) {
    // set all states from storage
    mapper.$restoreState(data)
  }

  const currentSymmetryDescription = computed(() => {
    return SYMMETRY_OPTIONS[settings.symmetry]?.description || ''
  })

  setupSourceImageHMR(sourceImageId, sourceImagePresetSrc, setSourceImageFromElement)

  return {
    $reset,
    $serializeState,
    $restoreState,
    scale,
    settings,
    currentSymmetryDescription,
    sourceImageData,
    sourceIndexedImage,
    sourceImageDataUrl,
    sourceImageId,
    setSourceImageFromElement,
    setSourceImageFromFileInput,
    clearSourceImage,
    initialImageData,
    initialImageDataUrl,
    setInitialImageData,
    clearInitialImageData,
  }
}, {
  persist: true,
})
