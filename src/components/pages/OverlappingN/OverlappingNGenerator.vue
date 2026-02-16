<script setup lang="ts">
import { storeToRefs } from 'pinia'
import prettyMilliseconds from 'pretty-ms'
import { computed, markRaw, ref, shallowRef, watch } from 'vue'
import { useOverlappingNStore } from '../../../lib/store/OverlappingNStore.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../../../lib/util/ImageData.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
import { type MsgPreview } from '../../../lib/wfc/OverlappingN/OverlappingN.worker.ts'
import { type OverlappingNAttempt } from '../../../lib/wfc/OverlappingN/OverlappingNAttempt.ts'
import { makeOverlappingNController } from '../../../lib/wfc/OverlappingN/OverlappingNController.ts'
import ImageFileInput from '../../ImageFileInput.vue'
import PixelCanvasRender from '../../PixelCanvasRender.vue'
import PixelImg from '../../PixelImg.vue'
import WorkerAttemptRow from '../OverlappingN/WorkerAttemptRow.vue'
import OverlappingNSettings from './OverlappingNSettings.vue'

const store = useOverlappingNStore()
const { settings, scale } = storeToRefs(store)

let pendingImageData: ImageDataArray | null = null
const attempts = ref<OverlappingNAttempt[]>([])
const resultCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)

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
      encoded: resultCanvasRef.value!.canvas?.toDataURL?.() ?? '',
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

const patternImageUrls = computed(() => {
  const imageDataArray = imageDataAnalysis.patternImageDataArray.value
  return imageDataArray.map(id => imageDataToUrlImage(id))
})

function updateCanvas() {
  if (!pendingImageData || !resultCanvasRef.value!.canvas) return
  draw(pendingImageData)
  pendingImageData = null
}

function draw(data: ImageDataArray) {
  const ctx = resultCanvasRef.value!.canvas!.getContext('2d')!
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
        <p>
          <PixelImg :src="imageDataSourceUrlImage" :scale="scale" />
        </p>
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

      <p>
        <strong>Source Patterns:</strong>
        {{ imageDataAnalysis.T }}, {{ settings.N }}x{{ settings.N }}px
      </p>

      <div class="pattern-images">
        <template v-for="item in patternImageUrls">
          <PixelImg :src="item" :scale="scale" />
        </template>
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

      <PixelCanvasRender
        ref="resultCanvasRef"
        v-show="hasResult && !errorMessage"
        :width="settings.width"
        :height="settings.height"
        :scale="scale"
      />
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

.pattern-images {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
