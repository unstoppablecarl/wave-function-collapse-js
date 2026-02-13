<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'
import { generateOverlapping } from '../lib/generator.ts'
import { getImgElementImageData } from '../lib/ImageData.ts'
import SymmetryInput from './SymmetryInput.vue'

const imgRef = useTemplateRef('imgRef')
const canvasRef = useTemplateRef('canvasRef')

const N = ref(3)

const width = ref(60)
const height = ref(60)
const scale = ref(4)
const periodicInput = ref(true)
const periodicOutput = ref(true)
const ground = ref(102)
const symmetry = ref(2)

const hasResult = ref(true)

async function generate() {
  const imageData = await getImgElementImageData(imgRef.value!)

  const result = generateOverlapping({
    imageData,
    destWidth: width.value,
    destHeight: height.value,
    N: N.value,
    periodicInput: periodicInput.value,
    periodicOutput: periodicOutput.value,
    ground: ground.value,
    symmetry: symmetry.value,
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

onMounted(async () => {

})

</script>
<template>
  <article class="card">
    <div v-if="!hasResult" role="alert" data-variant="warning">
      <strong>No Result Generated</strong> - The current settings did not generate a result.
    </div>

    <div class="row">
      <div class="col-2">
        <img class="pixel-img" ref="imgRef" src="../assets/flowers.png" :style="`transform: scale(${scale})`" />
      </div>
      <div class="col-4">

        <fieldset class="group input-section"
                  title="In the Wave Function Collapse (WFC) algorithm, N represents the pattern size (or 'kernel size'). It is the dimension of the small squares the algorithm extracts from your input image to use as its 'building blocks.'">
          <legend>N</legend>
          <input type="number" v-model="N" />
        </fieldset>

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
        <div class="text-right">

        <button @click="generate()">Generate</button>
        </div>
      </div>
      <div class="col-6">
        <div class="flex gap-2">

          Scale {{ scale }}
          <label data-field>
            <input type="range" min="1" max="10" step="1" v-model.number="scale">
          </label>
        </div>

        <div class="canvas-container" :style="`width: ${width * scale}px; height: ${height * scale}px;`">
          <canvas
            v-show="hasResult"
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
