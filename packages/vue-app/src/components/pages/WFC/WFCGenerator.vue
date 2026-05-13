<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { imageDataToDataUrl } from 'pixel-data-js'
import prettyMilliseconds from 'pretty-ms'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { SLIDING_WINDOW_IMAGES, TILESET_IMAGES } from '../../../lib/images.ts'
import { useWFCStore } from '../../../generators/wfc/WFCStore.ts'
import { drawTileGridToCanvas, getTileGridToCanvasSize } from '../../../lib/util/drawTilesToCanvas.ts'
import { formatPercent } from '../../../lib/util/misc.ts'
import { makeCanvasRenderer } from '../../../lib/vue/CanvasRenderer.ts'
import { makeImageDataAnalyzer } from '../../../generators/wfc/analyzer/ImageDataAnalyzer.ts'
import {
  makeWFCController,
  type WFCAttempt,
} from '../../../generators/wfc/WFCController.ts'
import { RulesetType } from '../../../generators/wfc/WFCModel.ts'
import ImageFileInput from '../../ImageFileInput.vue'
import InputImages from '../../InputImages.vue'
import PixelCanvasRender from '../../PixelCanvasRender.vue'
import PixelImg from '../../PixelImg.vue'
import WorkerAttemptRow from './WorkerAttemptRow.vue'
import WfcSettings from './WFCSettings.vue'

const store = useWFCStore()
const { settings, scale, sourceImageData, sourceIndexedImage, initialImageData } = storeToRefs(store)

const attempts = ref<WFCAttempt[]>([])
const resultCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)
const tileGridCanvasRef = ref<InstanceType<typeof PixelCanvasRender> | null>(null)

const imageDataAnalysis = makeImageDataAnalyzer(sourceImageData, settings.value)

const { ruleset } = imageDataAnalysis

const {
  clearCanvas,
  updateImageBuffer,
} = makeCanvasRenderer(resultCanvasRef, store.settings)

const controller = makeWFCController({
  settings: store.settings,
  imageDataSource: sourceImageData,
  initialImageData,
  ruleset,
  indexedImage: sourceIndexedImage,
  onBeforeRun() {
    attempts.value = []
  },
  onPreview(_response, pixels) {
    updateImageBuffer(pixels)
    hasResult.value = true
  },
  onAttemptStart() {
    clearCanvas()
  },
  onAttemptFailure(response) {
    const { attempt, reverts, elapsedTime, filledPercent, totalMemoryUseBytes } = response
    attempts.value.unshift({
      encoded: resultCanvasRef.value?.canvas?.toDataURL?.() ?? '',
      attempt,
      reverts,
      elapsedTime,
      filledPercent,
      totalMemoryUseBytes,
    })
  },
  onSuccess(_response, pixels) {
    updateImageBuffer(pixels)
    hasResult.value = true
  },
})

const {
  running,
  hasResult,
  errorMessage,
  currentAttempt,
  finalAttempt,
} = controller

const patternImageUrls = computed(() => {
  const imageDataArray = imageDataAnalysis.patternImageDataArray.value
  return imageDataArray.map(id => imageDataToDataUrl(id))
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
    const canvas = tileGridCanvasRef.value?.canvas
    if (canvas && imageDataArray.length) {
      drawTileGridToCanvas(canvas, imageDataArray)
    }
  })
})

const images = computed(() => {
  if (settings.value.rulesetType === RulesetType.SLIDING_WINDOW) {
    return SLIDING_WINDOW_IMAGES
  }

  return TILESET_IMAGES
})


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
      <WfcSettings />
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
