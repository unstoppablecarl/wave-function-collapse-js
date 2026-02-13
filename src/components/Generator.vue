<script setup lang="ts">
import { markRaw, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { generateOverlapping } from '../lib/generator.ts'
import { getImgElementImageData, imageDataToUrlImage } from '../lib/ImageData.ts'
import ImageFileInput from './ImageFileInput.vue'
import PixelImg from './PixelImg.vue'
import SymmetryInput from './SymmetryInput.vue'

const canvasRef = useTemplateRef('canvasRef')

const imageDataSource = shallowRef<ImageData | null>(null)
const imageDataSourceUrlImage = shallowRef<string | null>(null)

const N = ref(3)
const width = ref(60)
const height = ref(60)
const scale = ref(4)
const periodicInput = ref(true)
const periodicOutput = ref(true)
const ground = ref(0)
const symmetry = ref(2)
const seed = ref(1)

const hasResult = ref(true)

const errorMessage = ref('')
watch(imageDataSource, () => {
  if (!imageDataSource.value) {
    imageDataSourceUrlImage.value = null
    return
  }
  imageDataSourceUrlImage.value = imageDataToUrlImage(imageDataSource.value)
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
    destWidth: width.value,
    destHeight: height.value,
    N: N.value,
    periodicInput: periodicInput.value,
    periodicOutput: periodicOutput.value,
    ground: ground.value,
    symmetry: symmetry.value,
    seed: seed.value,
  })
  hasResult.value = !!result
  if (!result) {
    return
  }

  const canvas = canvasRef.value!
  canvas.width = width.value
  canvas.height = height.value
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
</script>
<template>
  <article class="card">

    <div class="row">
      <div class="col-2">
        <PixelImg
          src="/flowers.png"
          :scale="scale"
          @img-click="setImageDataFromElement($event)"
        />

        <ImageFileInput @imageDataLoaded="setImageDataFromFileInput" />

      </div>
      <div class="col-5">
        <div class="row input-section">
          <div class="col-4">
            <fieldset class="group input-section"
                      title="In the Wave Function Collapse (WFC) algorithm, N represents the pattern size (or 'kernel size'). It is the dimension of the small squares the algorithm extracts from your input image to use as its 'building blocks.'">
              <legend>N</legend>
              <input type="number" min="1" v-model="N" />
            </fieldset>
          </div>
          <div class="col-4">
            <fieldset class="group input-section"
                      title="Forces the bottom row of the output to match a specific pattern from the input. -1 will disable ground">
              <legend>Ground</legend>
              <input type="number" min="-1" v-model="ground" />
            </fieldset>
          </div>

          <div class="col-4">
            <fieldset class="group input-section">
              <legend>Seed</legend>
              <input type="number" v-model="seed" />
            </fieldset>
          </div>
        </div>

        <fieldset class="group input-section">
          <legend>Output Width/Height</legend>
          <input type="number" v-model="width" />
          <input type="number" v-model="height" />
        </fieldset>

        <div class="row input-section periodic">
          <div class="col-6">
            <label data-field title="The algorithm treats the input image like a seamless texture">
              <input type="checkbox" v-model="periodicInput" /> Periodic Input
            </label>
          </div>
          <div class="col-6">
            <label data-field title="Outputs a seamless texture">
              <input type="checkbox" v-model="periodicOutput" /> Periodic Output
            </label>
          </div>
        </div>

        <div class="input-section">
          <SymmetryInput v-model="symmetry" />
        </div>

        <div class="hstack">
          <div v-if="imageDataSourceUrlImage">
            Target Image:
          </div>
          <button @click="generate()" class="ms-auto">Generate</button>
        </div>

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
             :style="`width: ${width * scale}px; height: ${height * scale}px;`">
          <canvas
            ref="canvasRef"
            class="canvas-output"
            :width="width"
            :height="height"
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
</style>
