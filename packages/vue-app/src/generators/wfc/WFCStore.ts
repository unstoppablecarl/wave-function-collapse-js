import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../../lib/symmetry-options.ts'
import { makePersistedImageData, makePersistedSourceImageData } from '../../lib/vue/makePersistedImage.ts'
import { setupSourceImageHMR } from '../../lib/vue/setupSourceImageHMR.ts'
import type { WFCWorkerOptions } from './WFC.worker.ts'
import { ModelType, RulesetType } from './WFCModel.ts'

type exclude = 'palette' | 'avgColor'

export type StoreSettings = Omit<WFCWorkerOptions['settings'], exclude> & {
  N: number,
  NOverlap: number,
  periodicInput: boolean,
  periodicOutput: boolean,
  initialGround: number,
  symmetry: number,
  modelType: ModelType,
  rulesetType: RulesetType,
  maxSnapshots: number,
  snapshotIntervalPercent: number,
}

type SerializedData = {
  scale: number,
  settings: StoreSettings,
  sourceImageDataUrl: string | null,
  sourceImageId: number,
  initialImageDataUrl: string | null,
}

export const useWFCStore = defineStore('wfc', () => {

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

  const settings = reactive<StoreSettings>({
    N: 2,
    width: 60,
    height: 60,
    periodicInput: true,
    periodicOutput: true,
    symmetry: 2,
    seed: 1,
    previewInterval: 100,
    modelType: ModelType.WASM,
    NOverlap: 1,
    initialGround: -1,
    maxAttempts: 10,
    contradictionColor: 0xff0055,
    maxRevertsPerAttempt: 100,
    startCoordBias: 0.05,
    startCoordX: 0.5,
    startCoordY: 0.5,
    rulesetType: RulesetType.SLIDING_WINDOW,
    maxSnapshots: 10,
    snapshotIntervalPercent: 5,
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

  const maxNOverlap = computed(() => settings.N - 1)

  setupSourceImageHMR(sourceImageId, sourceImagePresetSrc, setSourceImageFromElement)

  return {
    $reset,
    $serializeState,
    $restoreState,
    maxNOverlap,
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