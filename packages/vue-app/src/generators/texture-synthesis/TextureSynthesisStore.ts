import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../../lib/symmetry-options.ts'
import { makePersistedImageData, makePersistedSourceImageData } from '../../lib/vue/makePersistedImage.ts'
import { setupSourceImageHMR } from '../../lib/vue/setupSourceImageHMR.ts'
import { TextureSynthesisModelType } from './TextureSynthesisModel.ts'

export type TextureSynthesisStoreSettings = {
  N: number,
  width: number,
  height: number,
  periodicInput: boolean,
  periodicOutput: boolean,
  seed: number,
  modelType: TextureSynthesisModelType,
  symmetry: number,
  lockInitialImageData: boolean,
  previewInterval: number,
  K: number,             // K-coherence set size (Coherent; 4..16)
  M: number,             // random candidates per cell (Harrison; 10..40)
  polish: number,        // polish rounds (Harrison; 0..3)
  temperature: number,   // softmax temperature (Coherent; 0.05..0.3)
}

type SerializedData = {
  scale: number,
  settings: TextureSynthesisStoreSettings
}

export const useTextureSynthesisStore = defineStore('texture-synthesis', () => {

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

  const settings = reactive<TextureSynthesisStoreSettings>({
    N: 2,
    width: 60,
    height: 60,
    periodicInput: true,
    periodicOutput: true,
    symmetry: 2,
    seed: 1,
    previewInterval: 10,
    modelType: TextureSynthesisModelType.HARRISON,
    lockInitialImageData: true,

    K: 8,
    M: 20,
    polish: 2,
    temperature: 2,
  })

  const state = {
    scale,
    settings,
  }

  const defaults: SerializedData = {
    scale: scale.value,
    settings: { ...toRaw(settings) },
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
    setInitialImageData,
    clearInitialImageData,
  }
}, {
  persist: true,
})