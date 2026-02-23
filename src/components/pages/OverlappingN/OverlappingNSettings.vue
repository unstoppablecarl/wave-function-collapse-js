<script setup lang="ts">
import { BindingApi } from '@tweakpane/core'
import { Pane } from 'tweakpane'
import * as InfodumpPlugin from 'tweakpane-plugin-infodump'
import { onMounted, reactive, useTemplateRef, watch, watchEffect } from 'vue'
import { useOverlappingNStore } from '../../../lib/store/OverlappingNStore.ts'
import { SYMMETRY_DROPDOWN } from '../../../lib/symmetry-options.ts'
import { ModelType, RulesetType } from '../../../lib/wfc/OverlappingN/OverlappingNModel.ts'

const store = useOverlappingNStore()
const paneRef = useTemplateRef('paneRef')

function addInfo(target: BindingApi, message: string) {
  const labelEl = target.controller.view.element.querySelector('.tp-lblv_l') as HTMLElement
  labelEl.title = message
}

onMounted(() => {
  const pane = new Pane({
    container: paneRef.value!,
    title: 'Config',
  })
  pane.registerPlugin(InfodumpPlugin)

  const displayFolder = pane.addFolder({
    title: 'Display',
  })

  const preview = displayFolder.addBinding(store.settings, 'previewInterval', {
    min: 0,
    max: 1000,
    step: 1,
    label: 'Preview',
  })
  addInfo(preview, 'How many steps between each frame draw')

  displayFolder.addBinding(store, 'scale', {
    min: 0,
    max: 10,
    step: 1,
  })

  const contradictionColor = displayFolder.addBinding(store.settings, 'contradictionColor', {
    view: 'color',
    label: 'cont. color',
  })
  addInfo(contradictionColor, 'Color of contradiction error pixels')

  const settingsFolder = pane.addFolder({
    title: 'Settings',
  })

  const N = settingsFolder.addBinding(store.settings, 'N', {
    min: 0,
    max: 10,
    step: 1,
  })
  addInfo(N, 'In the Wave Function Collapse (WFC) algorithm, N represents the pattern size (or "kernel size"). It is the dimension of the small squares the algorithm extracts from your input image to use as its "building blocks."')

  const initialGround = settingsFolder.addBinding(store.settings, 'initialGround', {
    min: -1,
    step: 1,
    label: 'ground',
  })
  addInfo(initialGround, 'Forces the bottom row of the output to match a specific pattern from the input. -1 will disable ground')

  settingsFolder.addBinding(store.settings, 'seed', {
    min: 0,
    step: 1,
  })

  const periodicInput = settingsFolder.addBinding(store.settings, 'periodicInput', {
    min: 0,
    step: 1,
    label: 'periodic in',
  })
  addInfo(periodicInput, 'The algorithm treats the input image like a seamless texture')

  const periodicOutput = settingsFolder.addBinding(store.settings, 'periodicOutput', {
    min: 0,
    step: 1,
    label: 'periodic out',
  })
  addInfo(periodicOutput, 'Outputs a seamless texture')

  settingsFolder.addBinding(store.settings, 'maxAttempts', {
    min: 0,
    step: 1,
    label: 'max attempts',
  })

  const revertsPerAttempt = settingsFolder.addBinding(store.settings, 'maxRevertsPerAttempt', {
    min: 0,
    step: 1,
    label: 'max reverts',
  })
  addInfo(revertsPerAttempt, 'When encountering a contradiction, revert to a previous valid state and try again.')

  settingsFolder.addBinding(store.settings, 'symmetry', {
    options: SYMMETRY_DROPDOWN,
  })

  const symmetryDesc = settingsFolder.addBlade({
    view: 'infodump',
    content: 'adfs',
    markdown: false,
  })

  watchEffect(() => {
    symmetryDesc.element.innerText = store.currentSymmetryDescription
  })

  const modelType = settingsFolder.addBinding(store.settings, 'modelType', {
    options: [
      {
        text: 'WASM',
        value: ModelType.WASM,
      },
      {
        text: 'JS',
        value: ModelType.JS,
      },
    ],
  })
  addInfo(modelType, 'Rust -> Web Assembly, or JS')

  const rulesetType = settingsFolder.addBinding(store.settings, 'rulesetType', {
    options: [
      {
        text: 'Generated Tiles',
        value: RulesetType.SLIDING_WINDOW,
      },
      {
        text: 'Preset Tiles',
        value: RulesetType.FRAGMENT,
      },
    ],
  })
  addInfo(rulesetType, 'Sliding window, pre-created tiles')

  const startCoordTarget = reactive({
    coord: {
      x: store.settings.startCoordX,
      y: store.settings.startCoordY,
    },
  })

  const startCoord = settingsFolder.addBinding(startCoordTarget, 'coord', {
    picker: 'inline',
    label: 'start',
    x: { min: 0, max: 1 },
    y: { min: 0, max: 1 },
  })
  addInfo(startCoord, 'Position that generation starts')

  watch(startCoordTarget, () => {
    store.settings.startCoordX = startCoordTarget.coord.x
    store.settings.startCoordY = startCoordTarget.coord.y
  })

  const startBias = settingsFolder.addBinding(store.settings, 'startCoordBias', {
    min: 0,
    step: 0.01,
    label: 'start bias',
  })
  addInfo(startBias, 'Bias toward start')

  const outputFolder = pane.addFolder({
    title: 'output',
  })

  outputFolder.addBinding(store.settings, 'width', {
    min: 0,
    step: 1,
  })

  outputFolder.addBinding(store.settings, 'height', {
    min: 0,
    step: 1,
  })

})
</script>
<template>
  <div ref="paneRef" class="pane-container"></div>
</template>
<style lang="scss">
.pane-container {
  margin-bottom: 1rem;
}

.tp-lblv_l[title] {
  white-space: nowrap;

  &::after {
    content: ' ⓘ';
  }
}

.tp-induv {
  color: var(--lbl-fg);
}
</style>