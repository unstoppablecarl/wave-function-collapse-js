<script setup lang="ts">

import { storeToRefs } from 'pinia'
import prettyMilliseconds from 'pretty-ms'
import { onUnmounted, ref } from 'vue'
import { makeConvChainController } from '../../../generators/conv-chain/ConvChainController.ts'
import { SLIDING_WINDOW_IMAGES } from '../../../lib/images.ts'
import { useConvChainStore } from '../../../generators/conv-chain/ConvChainStore.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
import { makeCanvasRenderer } from '../../../lib/vue/CanvasRenderer.ts'
import ImageFileInput from '../../ImageFileInput.vue'
import InputImages from '../../InputImages.vue'
import PixelCanvasRender from '../../PixelCanvasRender.vue'
import PixelImg from '../../PixelImg.vue'
import ConvChainSettings from './ConvChainSettings.vue'

const store = useConvChainStore()
const { scale, settings, sourceIndexedImage, initialImageData } = storeToRefs(store)

const resultCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)
const progressPercent = ref(0)
const elapsedTime = ref(0)
const stabilityPercent = ref(0)

const {
  updateImageBuffer,
} = makeCanvasRenderer(resultCanvasRef, store.settings)

const controller = makeConvChainController({
  initialImageData,
  inputData: sourceIndexedImage,
  settings: store.settings,
  onStart() {
    progressPercent.value = 0
    elapsedTime.value = 0
  },
  onPreview(response) {
    updateImageBuffer(response.result)
    progressPercent.value = response.progressPercent
    elapsedTime.value = response.elapsedTime
    stabilityPercent.value = response.stabilityPercent
  },
  onSuccess(response) {
    updateImageBuffer(response.result)
    progressPercent.value = 1
  },
})

const {
  running,
  errorMessage,
} = controller

onUnmounted(() => controller.terminateWorker())

const images = SLIDING_WINDOW_IMAGES
</script>
<template>
  <div class="row">
    <div class="col-2">
      <div class="mb-1">
        <ImageFileInput @imageDataLoaded="store.setSourceImageFromFileInput" />
      </div>
      <InputImages
        :images="images"
        :scale="scale"
        :selected-img-id="store.sourceImageId"
        @img-click="store.setSourceImageFromElement"
      />
    </div>
    <div class="col-3">
      <ConvChainSettings />

      <div class="hstack">
        <button @click="controller.run()" :disabled="running" class="ms-auto">
          Generate
        </button>
      </div>

      <div class="mb-1">
        <label class="form-label">Initial State <span style="opacity: 0.5">(transparent ignored)</span></label>
        <p>
          <ImageFileInput @imageDataLoaded="store.setInitialImageData" />
        </p>
        <p v-if="store.initialImageDataUrl">
          <button @click="store.clearInitialImageData" :disabled="running" data-variant="danger" class="small">
            Clear
          </button>
          <PixelImg :src="store.initialImageDataUrl" :scale="scale" />
        </p>
      </div>

      <div v-if="store.sourceImageDataUrl" class="mb-1">
        <strong>Target Image: </strong>
        <p>
          <PixelImg :src="store.sourceImageDataUrl" :scale="scale" />
        </p>
      </div>
    </div>
    <div class="col-3">
      <p class="hstack">
        <strong v-if="running">
          Generating:
          <span role="status" class="spinner small" style="display: inline-block"></span>
        </strong>
        <strong v-else>
          Ready
        </strong>
        <button v-if="running" data-variant="danger" class="small" @click="controller.terminateWorker()">Terminate
        </button>
      </p>
      <div v-if="errorMessage" role="alert" data-variant="warning" class="mb-1">
        <strong>
          {{ errorMessage.title }}
        </strong>
        {{ errorMessage.message }}
      </div>

      <div class="row mb-1 attempt-row">
        <div class="col-4">
          <strong>Progress: </strong> {{ formatPercent(progressPercent) }}
        </div>
        <div class="col-4">
          <strong>Stability: </strong> {{ formatPercent(stabilityPercent) }}
        </div>
        <div class="col-4">
          <strong>Elapsed: </strong> {{ prettyMilliseconds(elapsedTime) }}
        </div>
      </div>
      <PixelCanvasRender
        ref="resultCanvasRef"
        :width="settings.width"
        :height="settings.height"
        :scale="scale"
      />
    </div>
  </div>
</template>
<style scoped lang="scss">

</style>
