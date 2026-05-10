import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../../lib/symmetry-options.ts'
import { TextureSynthesisModelType } from './TextureSynthesisModel.ts'

export type TextureSynthesisStoreSettings = {
  width: number,
  height: number,
  N: number,             // L-neighbourhood radius (1..3)
  K: number,             // K-coherence set size (Coherent; 4..16)
  M: number,             // random candidates per cell (Harrison; 10..40)
  polish: number,        // polish rounds (Harrison; 0..3)
  temperature: number,   // softmax temperature (Full + Coherent; 0.05..0.3)
  seed: number,
  modelType: TextureSynthesisModelType,
  lockInitialImageData: boolean,
  previewInterval: number,
  symmetry: number,
}

type SerializedData = {
  scale: number,
  settings: TextureSynthesisStoreSettings
}

export const useTextureSynthesisStore = defineStore('texture-synthesis', () => {

  const scale = ref(4)

  const settings = reactive<TextureSynthesisStoreSettings>({
    N: 2,
    K: 8,
    M: 20,
    width: 60,
    height: 60,
    polish: 2,
    temperature: 2,
    seed: 1,
    previewInterval: 10,
    symmetry: 2,
    lockInitialImageData: true,
    modelType: TextureSynthesisModelType.FULL,
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