<script setup lang="ts">
import { markRaw, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { generateOverlapping } from '../lib/generator.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../lib/ImageData.ts'
import ImageFileInput from './ImageFileInput.vue'
import PixelImg from './PixelImg.vue'
import SymmetryInput from './SymmetryInput.vue'

const canvasRef = useTemplateRef('canvasRef')

const imageDataSource = shallowRef<ImageData | null>(null)
const imageDataSourceUrlImage = shallowRef<string | null>(null)

const scale = ref(4)
const autoRun = ref(false)

const settings = reactive({
  N: 2,
  width: 60,
  height: 60,
  periodicInput: true,
  periodicOutput: true,
  ground: -1,
  symmetry: 2,
  seed: 1,
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

async function generate() {
  errorMessage.value = ''
  const imageData = imageDataSource.value
  if (!imageData) {
    errorMessage.value = 'No Target Image'
    return
  }

  const result = generateOverlapping({
    imageData,
    ...settings,
    destWidth: settings.width,
    destHeight: settings.height,
  })
  hasResult.value = !!result
  if (!result) {
    return
  }

  const canvas = canvasRef.value!
  canvas.width = settings.width
  canvas.height = settings.height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  ctx.putImageData(result, 0, 0)
}

function setImageDataFromFileInput(val: ImageData) {
  imageDataSource.value = val
}

async function setImageDataFromElement(target: HTMLImageElement) {
  const imageData = await getImgElementImageData(target as HTMLImageElement)
  imageDataSource.value = markRaw(imageData)
}

const images = [
  '/flowers.png',
  '/ex1.png',
  '/ex2.png',
  '/ex3.png',
  '/ex4.png',
  '/ex5.png',
  '/ex6.png',
]

</script>
<template>
  <article class="card">

    <div class="row">
      <div class="col-2">
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
          <div class="col">
            <label
              data-field
              class="checkbox-label"
              title="The algorithm treats the input image like a seamless texture"
            >
              <input type="checkbox" v-model="settings.periodicInput" /> Periodic Input
            </label>
          </div>
          <div class="col">
            <label
              data-field
              class="checkbox-label"
              title="Outputs a seamless texture"
            >
              <input type="checkbox" v-model="settings.periodicOutput" /> Periodic Output
            </label>
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
          <button @click="generate()" class="">Generate</button>
        </div>

        <p v-if="imageDataSourceUrlImage">
          Target Image:
        </p>
        <div v-if="imageDataSourceUrlImage">
          <PixelImg :src="imageDataSourceUrlImage" :scale="scale" />

        </div>
      </div>
      <div class="col-5">
        <div class="flex gap-2">
          Scale {{ scale }}
          <label data-field>
            <input type="range" min="1" max="10" step="1" v-model.number="scale">
          </label>
        </div>
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
