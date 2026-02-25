<script setup lang="ts">
import { BindingApi } from '@tweakpane/core'
import { Pane } from 'tweakpane'
import * as InfodumpPlugin from 'tweakpane-plugin-infodump'
import { onMounted, useTemplateRef } from 'vue'
import { useConvChainStore } from '../../../lib/store/ConvChainStore.ts'

const store = useConvChainStore()
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

  settingsFolder.addBinding(store.settings, 'N', {
    min: 0,
    max: 10,
    step: 1,
  })

  settingsFolder.addBinding(store.settings, 'seed', {
    min: 0,
    step: 1,
  })

  settingsFolder.addBinding(store.settings, 'temperature', {
    min: 0,
    step: 1,
  })

  settingsFolder.addBinding(store.settings, 'maxIterations', {
    min: 1,
    step: 1,
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