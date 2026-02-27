<script setup lang="ts">

import { storeToRefs } from 'pinia'
import prettyMilliseconds from 'pretty-ms'
import { ref } from 'vue'
import { makeConvChainController } from '../../../lib/conv-chain/ConvChainController.ts'
import { SLIDING_WINDOW_IMAGES } from '../../../lib/images.ts'
import { useConvChainStore } from '../../../lib/store/ConvChainStore.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
import { makeReactiveSourceImageData } from '../../../lib/vue/makeReactiveSourceImageData.ts'
import ImageFileInput from '../../ImageFileInput.vue'
import InputImages from '../../InputImages.vue'
import PixelCanvasRender from '../../PixelCanvasRender.vue'
import PixelImg from '../../PixelImg.vue'
import ConvChainSettings from './ConvChainSettings.vue'

const store = useConvChainStore()
const { scale, settings } = storeToRefs(store)

const resultCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)
const progressPercent = ref(0)
const elapsedTime = ref(0)
const stabilityPercent = ref(0)

let pendingImageData: Uint8ClampedArray | null = null

const {
  sourceImageDataUrlImage,
  sourceIndexedImage,
  setImageDataFromElement,
  setImageDataFromFileInput,
  sourceImageId,
} = makeReactiveSourceImageData()

const controller = makeConvChainController({
  indexedImage: sourceIndexedImage,
  settings: store.settings,
  onStart() {
    progressPercent.value = 0
    elapsedTime.value = 0
  },
  onPreview(response) {
    pendingImageData = response.result
    progressPercent.value = response.progressPercent
    elapsedTime.value = response.elapsedTime
    stabilityPercent.value = response.stabilityPercent

    requestAnimationFrame(() => {
      if (running.value) {
        updateCanvas()
      }
    })
  },
})

const {
  running,
  errorMessage,
} = controller

function updateCanvas() {
  if (!pendingImageData || !resultCanvasRef.value!.canvas) return
  draw(pendingImageData)
  pendingImageData = null
}

// function clearCanvas() {
//   let canvas = resultCanvasRef.value!.canvas!
//   const ctx = canvas.getContext('2d')!
//   ctx.clearRect(0, 0, canvas.width, canvas.height)
// }

function draw(data: Uint8ClampedArray) {
  let canvas = resultCanvasRef.value!.canvas
  const ctx = canvas!.getContext('2d')!
  const imgData = new ImageData(data as ImageDataArray, settings.value.width, settings.value.height)
  ctx.putImageData(imgData, 0, 0)
}

const images = SLIDING_WINDOW_IMAGES
</script>
<template>
  <div class="row">
    <div class="col-2">
      <div class="mb-1">
        <ImageFileInput @imageDataLoaded="setImageDataFromFileInput" />
      </div>
      <InputImages
        :images="images"
        :scale="scale"
        :selected-img-id="sourceImageId"
        @img-click="setImageDataFromElement"
      />
    </div>
    <div class="col-3">
      <ConvChainSettings />

      <div class="hstack">
        <button @click="controller.run()" :disabled="running" class="ms-auto">
          Generate
        </button>
      </div>

      <div v-if="sourceImageDataUrlImage" class="mb-1">
        <strong>Target Image: </strong>
        <p>
          <PixelImg :src="sourceImageDataUrlImage" :scale="scale" />
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