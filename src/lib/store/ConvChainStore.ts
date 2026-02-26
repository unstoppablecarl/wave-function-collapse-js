import { defineStore } from 'pinia'
import { makeSimplePersistMapper } from 'pinia-simple-persist'
import { reactive, ref, toRaw } from 'vue'
import { ConvChainModelType } from '../conv-chain/ConvChain.ts'

export type ConvChainStoreSettings = {
  seed: number,
  width: number,
  height: number,
  N: number,
  temperature: number,
  maxIterations: number,
  previewInterval: number,
  modelType: ConvChainModelType,
}

type SerializedData = {
  scale: number,
  settings: ConvChainStoreSettings
}

export const useConvChainStore = defineStore('conv-chain', () => {

  const scale = ref(4)

  const settings = reactive<ConvChainStoreSettings>({
    N: 2,
    width: 60,
    height: 60,
    temperature: 1,
    maxIterations: 50,
    seed: 1,
    previewInterval: 10,
    modelType: ConvChainModelType.BINARY,
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

  return {
    $reset,
    $serializeState,
    $restoreState,
    scale,
    settings,
  }
}, {
  persist: true,
})