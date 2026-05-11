<script setup lang="ts">
import { Pane } from 'tweakpane'
import * as InfodumpPlugin from 'tweakpane-plugin-infodump'
import { onMounted, useTemplateRef, watchEffect } from 'vue'
import { SYMMETRY_DROPDOWN } from '../../../lib/symmetry-options.ts'
import { TextureSynthesisModelType } from '../../../generators/texture-synthesis/TextureSynthesisModel.ts'
import { useTextureSynthesisStore } from '../../../generators/texture-synthesis/TextureSynthesisStore.ts'
import { addInfo, enumToOptions } from '../../../lib/util/tweak-pane.ts'

const store = useTextureSynthesisStore()
const paneRef = useTemplateRef('paneRef')

onMounted(() => {
  const pane = new Pane({
    container: paneRef.value!,
    title: 'Config',
  })
  pane.registerPlugin(InfodumpPlugin)

  const displayFolder = pane.addFolder({
    title: 'Display',
  })

  displayFolder.addBinding(store, 'scale', {
    min: 1,
    max: 10,
    step: 1,
  })

  const preview = displayFolder.addBinding(store.settings, 'previewInterval', {
    min: 0,
    max: 1000,
    step: 1,
    label: 'Preview',
  })
  addInfo(preview, 'How many steps between each frame draw')

  const settingsFolder = pane.addFolder({
    title: 'Settings',
  })

  const N = settingsFolder.addBinding(store.settings, 'N', {
    min: 0,
    max: 10,
    step: 1,
  })
  addInfo(N, 'N represents the pattern size. It is the dimension of the small squares the algorithm extracts from your input image to use as its building blocks.')

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

  const symmetry = settingsFolder.addBinding(store.settings, 'symmetry', {
    options: SYMMETRY_DROPDOWN,
  })
  const symmetryLabel = addInfo(symmetry, '')

  watchEffect(() => {
    symmetryLabel.title = store.currentSymmetryDescription
  })

  const lockInitialImageData = settingsFolder.addBinding(store.settings, 'lockInitialImageData', {
    label: 'lock initial',
  })
  addInfo(lockInitialImageData, 'Re-apply initial state image after every attempt reset')

  settingsFolder.addBinding(store.settings, 'modelType', {
    options: enumToOptions(TextureSynthesisModelType),
  })

  const k = settingsFolder.addBinding(store.settings, 'K', {
    min: 4,
    max: 16,
    step: 1,
    label: 'coherence set size',
  })

  const temperature = settingsFolder.addBinding(store.settings, 'temperature', {
    min: 0,
    step: 0.05,
  })

  watchEffect(() => {
    let show = store.settings.modelType === TextureSynthesisModelType.COHERENT
    k.hidden = !show
    temperature.hidden = !show
  })

  const m = settingsFolder.addBinding(store.settings, 'M', {
    min: 10,
    max: 40,
    step: 1,
    label: 'random candidates per cell',
  })

  const polish = settingsFolder.addBinding(store.settings, 'polish', {
    min: 0,
    max: 10,
    step: 1,
    label: 'polish rounds',
  })

  watchEffect(() => {
    let show = store.settings.modelType === TextureSynthesisModelType.HARRISON
    m.hidden = !show
    polish.hidden = !show
  })

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