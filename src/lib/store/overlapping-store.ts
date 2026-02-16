import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../symmetry-options.ts'
import type { WfCWorkerOptions } from '../wfc/WFCModelOverlapping.worker.ts'

type Settings = WfCWorkerOptions['settings']

type SerializedData = {
  scale: number,
  settings: Settings
}

export const useOverlappingStore = defineStore('wfc-overlapping', () => {

  const scale = ref(4)
  const autoRun = ref(false)

  const settings = reactive<Settings>({
    N: 2,
    width: 60,
    height: 60,
    periodicInput: true,
    periodicOutput: true,
    initialGround: -1,
    symmetry: 2,
    seed: 1,
    maxAttempts: 10,
    maxRepairsPerAttempt: 10,
    previewInterval: 100,
    repairRadius: 2,
    startCoordBias: 0.05,
    startCoordX: 0.5,
    startCoordY: 0.5,
  })

  const state = {
    scale,
    autoRun,
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
    autoRun,
    settings,
    currentSymmetryDescription,
  }
}, {
  persist: true,
})