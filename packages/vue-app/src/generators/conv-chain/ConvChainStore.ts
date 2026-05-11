import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../../lib/symmetry-options.ts'
import { ConvChainModelType, type ConvChainOptions } from './ConvChainModel.ts'

type Exclude =
  | 'guidanceWeight'
  | 'guidanceField'
  | 'indexedImage'
  | 'initialImageData'

export type ConvChainStoreSettings = Omit<Required<ConvChainOptions>, Exclude>

type SerializedData = {
  scale: number,
  settings: ConvChainStoreSettings
}

export const useConvChainStore = defineStore('conv-chain', () => {

  const scale = ref(4)

  const settings = reactive<ConvChainStoreSettings>({
    N: 2,
    seed: 1,
    width: 60,
    height: 60,
    temperature: 2,
    maxIterations: 50,
    previewInterval: 10,
    modelType: ConvChainModelType.BINARY,
    symmetry: 1,
    periodicInput: true,
    periodicOutput: true,
    initialPatchCount: 4,
    initialPatchSize: 4,
    lockInitialImageData: false,
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

  return {
    $reset,
    $serializeState,
    $restoreState,
    scale,
    settings,
    currentSymmetryDescription,
  }
}, {
  persist: true,
})