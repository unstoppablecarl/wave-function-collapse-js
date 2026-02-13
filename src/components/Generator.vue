<script setup lang="ts">
import { markRaw, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { EXAMPLE_IMAGES } from '../lib/example-images.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../lib/ImageData.ts'
import type { WfCWorkerOptions } from '../lib/wfc.worker.ts'
import ImageFileInput from './ImageFileInput.vue'
import PixelImg from './PixelImg.vue'
import SymmetryInput from './SymmetryInput.vue'

const canvasRef = useTemplateRef('canvasRef')

const imageDataSource = shallowRef<ImageData | null>(null)
const imageDataSourceUrlImage = shallowRef<string | null>(null)

const scale = ref(4)
const autoRun = ref(false)
const running = ref(false)
const currentWorkerStatus = ref('')

type Settings = WfCWorkerOptions['settings']

const settings = reactive<Settings>({
  N: 2,
  width: 60,
  height: 60,
  periodicInput: true,
  periodicOutput: true,
  ground: -1,
  symmetry: 2,
  seed: 1,
  maxTries: 10,
  maxRepairsPerAttempt: 10,
})

const hasResult = ref(true)
const errorMessage = ref('')

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

function updateCanvas() {
  if (!pendingImageData || !canvasRef.value) return
  draw(pendingImageData)
  pendingImageData = null
}

function draw(data: ImageDataArray) {
  const ctx = canvasRef.value!.getContext('2d')!
  const imgData = new ImageData(data, settings.width, settings.height)
  ctx.putImageData(imgData, 0, 0)
}

async function generate() {

  errorMessage.value = ''
  const imageData = imageDataSource.value
  if (!imageData) {
    errorMessage.value = 'No Target Image'
    return
  }
  running.value = true
  currentWorkerStatus.value = 'Building Model'

  // Clean up previous worker if it's still running
  if (wfcWorker) wfcWorker.terminate()

  // Initialize Worker
  wfcWorker = new Worker(new URL('../lib/wfc.worker.ts', import.meta.url), {
    type: 'module',
  })

  // Send data to worker
  wfcWorker.postMessage({
    imageData: imageDataSource.value,
    settings: { ...settings },
  })

  let currentAttempt: number
  let startTime: number

  wfcWorker.onmessage = (e) => {
    const { type, result, attempt } = e.data

    if (type === 'attempt_start') {
      currentAttempt = attempt
      startTime = performance.now()
      console.log('attempt start: ', attempt)
      currentWorkerStatus.value = 'Attempt ' + attempt
    }

    if (type === 'attempt_end') {
      if (currentAttempt !== attempt) {
        console.error({ currentAttempt, attempt })
        throw new Error('attempt sequence failure')
      }
      const elapsedTime = performance.now() - startTime
      console.log('attempt end: ', attempt, elapsedTime)
    }

    if (type === 'preview') {
      pendingImageData = new Uint8ClampedArray(result.buffer)
      requestAnimationFrame(updateCanvas)
    }

    if (type === 'success') {
      draw(new Uint8ClampedArray(result.buffer))
      cleanupWorker()
    }

    if (type === 'failure') {
      hasResult.value = false
      cleanupWorker()
    }
  }
}

function cleanupWorker() {
  running.value = false
  if (wfcWorker) {
    wfcWorker.terminate()
    wfcWorker = null
  }
}

function setImageDataFromFileInput(val: ImageData) {
  imageDataSource.value = val
}

async function setImageDataFromElement(target: HTMLImageElement) {
  const imageData = await getImgElementImageData(target as HTMLImageElement)
  imageDataSource.value = markRaw(imageData)
}

const images = EXAMPLE_IMAGES
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
        <p>Examples</p>
        <template v-for="image in images" :key="image">
          <div class="mb-2">

            <PixelImg
              :src="image"
              class="img-target"
              :scale="scale"
              @img-click="setImageDataFromElement($event)"
            />
          </div>
        </template>
      </div>
      <div class="col-5">
        <div class="row input-section">
          <div class="col-4">
            <fieldset class="group input-section"
                      title="In the Wave Function Collapse (WFC) algorithm, N represents the pattern size (or 'kernel size'). It is the dimension of the small squares the algorithm extracts from your input image to use as its 'building blocks.'">
              <legend>N</legend>
              <input type="number" min="1" v-model="settings.N" />
            </fieldset>
          </div>
          <div class="col-4">
            <fieldset class="group input-section"
                      title="Forces the bottom row of the output to match a specific pattern from the input. -1 will disable ground">
              <legend>Ground</legend>
              <input type="number" min="-1" v-model="settings.ground" />
            </fieldset>
          </div>

          <div class="col-4">
            <fieldset class="group input-section">
              <legend>Seed</legend>
              <input type="number" v-model="settings.seed" />
            </fieldset>
          </div>
        </div>

        <fieldset class="group input-section">
          <legend>Output Width/Height</legend>
          <input type="number" v-model="settings.width" />
          <input type="number" v-model="settings.height" />
        </fieldset>

        <div class="row input-section periodic">
          <div class="col-4">
            <label
              data-field
              class="checkbox-label"
              title="The algorithm treats the input image like a seamless texture"
            >
              <input type="checkbox" v-model="settings.periodicInput" /> Periodic Input
            </label>
          </div>
          <div class="col-4">
            <label
              data-field
              class="checkbox-label"
              title="Outputs a seamless texture"
            >
              <input type="checkbox" v-model="settings.periodicOutput" /> Periodic Output
            </label>
          </div>

          <div class="col-4">
            <fieldset class="group input-section">
              <legend>Tries</legend>
              <input type="number" v-model="settings.maxTries" />
            </fieldset>
          </div>
        </div>

        <div class="input-section">
          <SymmetryInput v-model="settings.symmetry" />
        </div>

        <div class="hstack">
          <ImageFileInput @imageDataLoaded="setImageDataFromFileInput" />
          <div class="ms-auto">
            <label data-field class="checkbox-label" title="Auto Run when settings change">
              <input type="checkbox" v-model="autoRun" /> Auto Run
            </label>
          </div>
          <button @click="generate()" :disabled="running">
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
      <div class="col-5">
        <p>
          <span v-if="running" role="status" class="spinner small" style="display: inline-block"></span>
          <strong v-if="running">
            Generating:
          </strong>
          <strong v-else>
            Ready
          </strong>
          <span v-if="running"> {{ currentWorkerStatus }}</span>
        </p>
        <div v-if="errorMessage" role="alert" data-variant="warning">
          {{ errorMessage }}
        </div>
        <div v-if="!hasResult" role="alert" data-variant="warning">
          <strong>No Result Generated</strong> - The current settings did not generate a result.
        </div>
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
      </div>
    </div>
  </article>
</template>
<style lang="scss">
.input-section {
  margin-bottom: 1rem;
}

.pixel-img,
.canvas-output {
  transform-origin: top left; /* Ensures it scales from the top-left corner */
  image-rendering: -moz-crisp-edges; /* Firefox */
  image-rendering: pixelated; /* Chrome, Edge, Safari */
}

.periodic {
  padding-left: 0.5rem;
}

.checkbox-label {
  padding: 0.5rem 0;
  margin-block-end: 0;
}

.img-target {
  cursor: pointer;
}
</style>
