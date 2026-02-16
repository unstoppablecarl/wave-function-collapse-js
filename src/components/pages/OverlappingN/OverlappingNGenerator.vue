<script setup lang="ts">
import { storeToRefs } from 'pinia'
import prettyMilliseconds from 'pretty-ms'
import { markRaw, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useOverlappingNStore } from '../../../lib/store/OverlappingNStore.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../../../lib/util/ImageData.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
import { type MsgPreview } from '../../../lib/wfc/OverlappingN/OverlappingN.worker.ts'
import { type OverlappingNAttempt } from '../../../lib/wfc/OverlappingN/OverlappingNAttempt.ts'
import { makeOverlappingNController } from '../../../lib/wfc/OverlappingN/OverlappingNController.ts'
import ImageFileInput from '../../ImageFileInput.vue'
import PixelImg from '../../PixelImg.vue'
import WorkerAttemptRow from '../OverlappingN/WorkerAttemptRow.vue'
import OverlappingNSettings from './OverlappingNSettings.vue'

const store = useOverlappingNStore()
const { settings, scale } = storeToRefs(store)

let pendingImageData: ImageDataArray | null = null
const attempts = ref<OverlappingNAttempt[]>([])
const canvasRef = useTemplateRef('canvasRef')

const controller = makeOverlappingNController({
  settings: store.settings,
  onBeforeRun() {
    attempts.value = []
  },
  onPreview(_response: MsgPreview, pixels) {
    pendingImageData = pixels
    requestAnimationFrame(() => {
      if (running.value) {
        updateCanvas()
      }
    })
  },
  onAttemptFailure(response) {
    const { attempt, repairs, elapsedTime, filledPercent } = response
    attempts.value.unshift({
      encoded: canvasRef.value?.toDataURL?.() ?? '',
      attempt,
      repairs,
      elapsedTime,
      filledPercent,
    })
  },
  onSuccess(_response, pixels) {
    draw(pixels)
  },
})

const {
  imageDataSource,
  running,
  hasResult,
  errorMessage,
  currentAttempt,
  finalAttempt,
  imageDataAnalysis,
} = controller

const imageDataSourceUrlImage = shallowRef<string | null>(null)

watch(imageDataSource, () => {
  if (!imageDataSource.value) {
    imageDataSourceUrlImage.value = null
    return
  }
  imageDataSourceUrlImage.value = imageDataToUrlImage(imageDataSource.value)
})

function updateCanvas() {
  if (!pendingImageData || !canvasRef.value) return
  draw(pendingImageData)
  pendingImageData = null
}

function draw(data: ImageDataArray) {
  const ctx = canvasRef.value!.getContext('2d')!
  const imgData = new ImageData(data, settings.value.width, settings.value.height)
  ctx.putImageData(imgData, 0, 0)
  hasResult.value = true
}

function setImageDataFromFileInput(val: ImageData) {
  imageDataSource.value = val
}

async function setImageDataFromElement(target: HTMLImageElement) {
  const imageData = await getImgElementImageData(target as HTMLImageElement)
  imageDataSource.value = markRaw(imageData)
}

const imageModules = import.meta.glob('../../../assets/overlapping-n/*.png', { eager: true })
const images = Object.values(imageModules).map((m) => (m as any).default)
</script>
<template>
  <div class="row">
    <div class="col-2">
      <div class="mb-1">
        <ImageFileInput @imageDataLoaded="setImageDataFromFileInput" />
      </div>
      <p>Examples</p>
      <template v-for="image in images" :key="image">
        <PixelImg
          :src="image"
          class="img-target"
          :scale="scale"
          @img-click="setImageDataFromElement($event)"
        />
      </template>
    </div>
    <div class="col-3">
      <OverlappingNSettings />
      <div class="hstack">
        <button @click="controller.run()" :disabled="running" class="ms-auto">
          Generate
        </button>
      </div>

      <div v-if="imageDataSourceUrlImage" class="mb-1">
        <strong>Target Image: </strong>
        <div>
          <strong>Brittleness: </strong>
          <template v-if="imageDataAnalysis.averageBrittleness.value">
            {{ formatPercent(imageDataAnalysis.averageBrittleness.value) }}
          </template>
          <template v-else-if="imageDataAnalysis.running.value">
            <span role="status" class="spinner small" style="display: inline-block"></span>
          </template>
        </div>
      </div>
      <div v-if="imageDataSourceUrlImage">
        <PixelImg :src="imageDataSourceUrlImage" :scale="scale" />
      </div>
    </div>
    <div class="col-7">
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
      <div v-if="errorMessage" role="alert" data-variant="warning">
        <strong>
          {{ errorMessage.title }}
        </strong>
        {{ errorMessage.message }}
      </div>

      <WorkerAttemptRow
        v-if="running"
        :attempt="currentAttempt"
      />

      <WorkerAttemptRow
        v-if="!running && hasResult"
        :attempt="finalAttempt"
      />

      <div class="canvas-container" v-show="hasResult && !errorMessage"
           :style="`width: ${settings.width * scale}px; height: ${settings.height * scale}px;`">
        <canvas
          ref="canvasRef"
          class="canvas-output"
          :width="settings.width"
          :height="settings.height"
          :style="`transform: scale(${scale})`"
        ></canvas>
      </div>
      <div class="attempt-log" v-for="item in attempts" :key="item.attempt">
        <div class="hstack attempt-log-info">
          <div>Attempt: {{ item.attempt }}</div>
          <div>Time: {{ prettyMilliseconds(item.elapsedTime) }}</div>
          <div>Progress: {{ formatPercent(item.filledPercent) }}</div>
          <div v-if="item.repairs">Repairs: {{ item.repairs }}</div>
        </div>
        <PixelImg :src="item.encoded" :scale="scale" />
      </div>
    </div>
  </div>
</template>
<style lang="scss">

.pixel-img,
.canvas-output {
  transform-origin: top left; /* Ensures it scales from the top-left corner */
  image-rendering: -moz-crisp-edges; /* Firefox */
  image-rendering: pixelated; /* Chrome, Edge, Safari */
}

.periodic {
  padding-left: 0.5rem;
}

.img-target {
  cursor: pointer;
  margin: 0.5rem 0.5rem 0 0;
}

.attempt-log {
  font-size: 0.7rem;
}

.attempt-log-info {
  margin: 0.5rem 0 0.25rem;
}
</style>
