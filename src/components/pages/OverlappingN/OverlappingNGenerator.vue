<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { makeIndexedImage } from 'pixel-data-js'
import prettyMilliseconds from 'pretty-ms'
import { computed, markRaw, nextTick, ref, shallowRef, watch } from 'vue'
import { useOverlappingNStore } from '../../../lib/store/OverlappingNStore.ts'
import { drawTileGridToCanvas, getTileGridToCanvasSize } from '../../../lib/util/drawTilesToCanvas.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../../../lib/util/ImageData.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
import { makeImageDataAnalyzer } from '../../../lib/wfc/ImageDataAnalyzer.ts'
import { type OverlappingNAttempt } from '../../../lib/wfc/OverlappingN/OverlappingNAttempt.ts'
import { makeOverlappingNController } from '../../../lib/wfc/OverlappingN/OverlappingNController.ts'
import { RulesetType } from '../../../lib/wfc/OverlappingN/OverlappingNModel.ts'
import ImageFileInput from '../../ImageFileInput.vue'
import PixelCanvasRender from '../../PixelCanvasRender.vue'
import PixelImg from '../../PixelImg.vue'
import WorkerAttemptRow from '../OverlappingN/WorkerAttemptRow.vue'
import OverlappingNSettings from './OverlappingNSettings.vue'

const store = useOverlappingNStore()
const { settings, scale } = storeToRefs(store)

let pendingImageData: Uint8ClampedArray | null = null
const attempts = ref<OverlappingNAttempt[]>([])
const resultCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)
const tileGridCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)

const indexedImage = computed(() => {
  if (!imageDataSource.value) return null
  return makeIndexedImage(imageDataSource.value)
})
const imageDataSource = shallowRef<ImageData | null>(null)
const imageDataAnalysis = makeImageDataAnalyzer(imageDataSource, settings.value)

const { ruleset } = imageDataAnalysis

const controller = makeOverlappingNController({
  settings: store.settings,
  imageDataSource,
  ruleset,
  indexedImage,
  onBeforeRun() {
    attempts.value = []
  },
  onPreview(_response, pixels) {
    pendingImageData = pixels
    requestAnimationFrame(() => {
      if (running.value) {
        updateCanvas()
      }
    })
  },
  onAttemptStart() {
    clearCanvas()
  },
  onAttemptFailure(response) {
    const { attempt, reverts, elapsedTime, filledPercent, totalMemoryUseBytes } = response
    attempts.value.unshift({
      encoded: resultCanvasRef.value!.canvas?.toDataURL?.() ?? '',
      attempt,
      reverts,
      elapsedTime,
      filledPercent,
      totalMemoryUseBytes,
    })
  },
  onSuccess(_response, pixels) {
    draw(pixels)
  },
})

const {
  running,
  hasResult,
  errorMessage,
  currentAttempt,
  finalAttempt,
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

const tileGridSize = shallowRef({ width: 0, height: 0 })

watch(imageDataAnalysis.originalPatternImageDataArray, () => {
  const imageDataArray = imageDataAnalysis.originalPatternImageDataArray.value

  if (!imageDataArray.length) {
    tileGridSize.value = {
      width: 0,
      height: 0,
    }
  }

  const { width, height } = getTileGridToCanvasSize(
    imageDataArray.length,
    imageDataArray[0]!.width,
    imageDataArray[0]!.height,
  )

  tileGridSize.value = {
    width,
    height,
  }

  nextTick(() => {
    drawTileGridToCanvas(tileGridCanvasRef.value!.canvas!, imageDataArray)
  })
})

function updateCanvas() {
  if (!pendingImageData || !resultCanvasRef.value!.canvas) return
  draw(pendingImageData)
  pendingImageData = null
}

function clearCanvas() {
  let canvas = resultCanvasRef.value!.canvas!
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function draw(data: Uint8ClampedArray) {
  let canvas = resultCanvasRef.value!.canvas
  const ctx = canvas!.getContext('2d')!
  const imgData = new ImageData(data as ImageDataArray, settings.value.width, settings.value.height)
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

const slidingWindowImageModules = import.meta.glob('../../../assets/overlapping-n/sliding-window/*.png', { eager: true })
const slidingWindowImages = Object.values(slidingWindowImageModules).map((m) => (m as any).default)

const fragmentImageModules = import.meta.glob('../../../assets/overlapping-n/fragment/*.png', { eager: true })
const fragmentImages = Object.values(fragmentImageModules).map((m) => (m as any).default)

const images = computed(() => {

  if (settings.value.rulesetType === RulesetType.SLIDING_WINDOW) {
    return slidingWindowImages
  }

  return fragmentImages
})

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

      <div class="pattern-images mb-1">
        <template v-for="item in patternImageUrls">
          <PixelImg :src="item" :scale="scale" />
        </template>
      </div>

      <div>
        <p>
          <strong>Tile Sheet:</strong> (not rotated/reflected)
        </p>
        <PixelCanvasRender
          ref="tileGridCanvasRef"
          :width="tileGridSize.width"
          :height="tileGridSize.width"
          :scale="scale"
        />
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
          <div v-if="item.reverts">Reverts: {{ item.reverts }}</div>
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
  display: inline-block;
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
