import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { computed, reactive, ref, toRaw } from 'vue'
import { SYMMETRY_OPTIONS } from '../symmetry-options.ts'
import type { OverlappingNWorkerOptions } from '../wfc/OverlappingN/OverlappingN.worker.ts'
import { ModelType, RulesetType } from '../wfc/OverlappingN/OverlappingNModel.ts'

export type StoreSettings = OverlappingNWorkerOptions['settings'] & {
  N: number,
  periodicInput: boolean,
  initialGround: number,
  symmetry: number,
  modelType: ModelType,
  rulesetType: RulesetType,
}

type SerializedData = {
  scale: number,
  settings: StoreSettings
}

export const useOverlappingNStore = defineStore('wfc-overlapping-n', () => {

  const scale = ref(4)

  const settings = reactive<StoreSettings>({
    N: 2,
    width: 60,
    height: 60,
    periodicInput: true,
    periodicOutput: true,
    initialGround: -1,
    symmetry: 2,
    seed: 1,
    maxAttempts: 10,
    contradictionColor: 0xff0055,
    maxRevertsPerAttempt: 10,
    previewInterval: 100,
    startCoordBias: 0.05,
    startCoordX: 0.5,
    startCoordY: 0.5,
    modelType: ModelType.WASM,
    rulesetType: RulesetType.SLIDING_WINDOW,
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