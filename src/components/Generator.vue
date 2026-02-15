<script setup lang="ts">
import { storeToRefs } from 'pinia'
import prettyMilliseconds from 'pretty-ms'
import { markRaw, ref, shallowRef, toValue, useTemplateRef, watch } from 'vue'
import { type Attempt, makeAttempt, resetAttempt } from '../lib/_types.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../lib/ImageData.ts'
import { useStore } from '../lib/store.ts'
import { WFC_WORKER_ID, WorkerMsg, type WorkerResponse } from '../lib/WFCOverlappingModelImageData.worker.ts'
import ImageFileInput from './ImageFileInput.vue'
import PixelImg from './PixelImg.vue'
import TweakPane from './TweakPane.vue'
import WorkerAttemptRow from './WorkerAttemptRow.vue'

const store = useStore()
const { settings, autoRun, scale } = storeToRefs(store)

const canvasRef = useTemplateRef('canvasRef')

const imageDataSource = shallowRef<ImageData | null>(null)
const imageDataSourceUrlImage = shallowRef<string | null>(null)

const running = ref(false)
const attempts = ref<Attempt[]>([])

const hasResult = ref(false)
const errorMessage = shallowRef<{ title: string, message: string } | null>(null)

const currentAttempt = makeAttempt()
const finalAttempt = makeAttempt()

watch(imageDataSource, () => {
  if (!imageDataSource.value) {
    imageDataSourceUrlImage.value = null
    return
  }
  imageDataSourceUrlImage.value = imageDataToUrlImage(imageDataSource.value)
})

watch(settings, () => {
  if (autoRun.value) {
    generate()
  }
})

let wfcWorker: Worker | null = null
let pendingImageData: ImageDataArray | null = null

function terminateWorker() {
  hasResult.value = false
  completeWorker()
}

function completeWorker() {
  running.value = false
  if (wfcWorker) {
    wfcWorker.terminate()
    wfcWorker = null
  }
}

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

async function generate() {
  attempts.value = []
  errorMessage.value = null
  const imageData = imageDataSource.value
  if (!imageData) {
    errorMessage.value = { title: 'Invalid Input', message: 'No Target Image' }
    return
  }
  terminateWorker()
  running.value = true

  // Initialize Worker
  wfcWorker = new Worker(new URL('../lib/WFCOverlappingModelImageData.worker.ts', import.meta.url), {
    type: 'module',
  })

  // Send data to worker
  wfcWorker.postMessage({
    id: WFC_WORKER_ID,
    imageData: imageDataSource.value,
    settings: { ...toValue(settings) },
  })

  wfcWorker.onmessage = (e) => {
    const response = e.data as WorkerResponse
    const { type } = response

    currentAttempt.elapsedTime = performance.now() - currentAttempt.startedAt

    if (type === WorkerMsg.ATTEMPT_START) {
      const { attempt } = response

      resetAttempt(currentAttempt, attempt)
    }

    if (type === WorkerMsg.ATTEMPT_END) {

    }

    if (type === WorkerMsg.PREVIEW) {
      const { result, filledPercent } = response
      pendingImageData = new Uint8ClampedArray(result.buffer)
      currentAttempt.filledPercent = filledPercent

      requestAnimationFrame(() => {
        if (running.value) {
          updateCanvas()
        }
      })
    }

    if (type === WorkerMsg.ATTEMPT_FAILURE) {
      const { result, attempt, repairs, elapsedTime, filledPercent } = response
      if (result.byteLength === 0) {
        console.error(`Attempt ${attempt} received an empty buffer!`)
        return
      }

      attempts.value.unshift({
        encoded: canvasRef.value?.toDataURL?.() ?? '',
        attempt,
        repairs,
        elapsedTime,
        filledPercent,
      })
    }

    if (type === WorkerMsg.SUCCESS) {
      const { result } = response
      draw(new Uint8ClampedArray(result.buffer))
      completeWorker()
      Object.assign(finalAttempt, currentAttempt)
      finalAttempt.filledPercent = 1
    }

    if (type === WorkerMsg.FAILURE) {
      hasResult.value = false
      completeWorker()
    }

    if (type === WorkerMsg.ERROR) {
      const { message } = response
      hasResult.value = false
      completeWorker()
      throw new Error(message)
    }
  }
}

function setImageDataFromFileInput(val: ImageData) {
  imageDataSource.value = val
}

async function setImageDataFromElement(target: HTMLImageElement) {
  const imageData = await getImgElementImageData(target as HTMLImageElement)
  imageDataSource.value = markRaw(imageData)
}

const imageModules = import.meta.glob('../assets/*.png', { eager: true })
const images = Object.values(imageModules).map((m) => (m as any).default)
</script>
<template>
  <article class="card">
    <div class="row">
      <div class="col-2">
        <div class="flex gap-1">
          <small style="white-space: nowrap">
            Scale {{ scale }}
          </small>
          <label data-field>
            <input type="range" min="1" max="10" step="1" v-model.number="scale">
          </label>
        </div>
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
        <fieldset class="group input-section">
          <legend>Preview Interval</legend>
          <input type="number" v-model="settings.previewInterval" />
        </fieldset>
        <TweakPane />
        <div class="hstack">
          <div class="">
            <label data-field class="form-label" title="Auto Run when settings change">
              <input type="checkbox" v-model="autoRun" /> Auto Run
            </label>
          </div>

          <button @click="generate()" :disabled="running" class="ms-auto">
            Generate
          </button>
        </div>

        <p v-if="imageDataSourceUrlImage">
          Target Image:
        </p>
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
          <button v-if="running" data-variant="danger" class="small" @click="terminateWorker">Terminate</button>
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
            <div>Progress: {{ (item.filledPercent * 100).toFixed(1) }}%</div>
            <div v-if="item.repairs">Repairs: {{ item.repairs }}</div>
          </div>
          <PixelImg :src="item.encoded" :scale="scale" />
        </div>
      </div>
    </div>
  </article>
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
