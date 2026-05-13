<script setup lang="ts">
import { fileInputChangeToImageData, getImageDataFromClipboard, UnsupportedFormatError } from 'pixel-data-js'
import { markRaw, ref, useTemplateRef } from 'vue'
import PixelImg from './PixelImg.vue'

type Emits = {
  (e: 'imageDataLoaded', imageData: ImageData): void;
  (e: 'clear'): void;
}

const emit = defineEmits<Emits>()
const fileInputEl = useTemplateRef('fileInputEl')

const { imageDataUrl, scale } = defineProps<{
  imageDataUrl: string | null,
  scale: number,
}>()

const errorMessage = ref('')

async function handleFileUpload(event: Event) {
  errorMessage.value = ''
  try {
    const newImageData = await fileInputChangeToImageData(event)
    if (!newImageData) return
      ;
    (fileInputEl.value as HTMLInputElement).value = ''
    emit('imageDataLoaded', markRaw(newImageData))
  } catch (error) {
    if (error instanceof UnsupportedFormatError) {
      errorMessage.value = error.message
    } else {
      throw error
    }
  }
}

async function paste() {
  const pastedImageData = await getImageDataFromClipboard()
  if (!pastedImageData) {
    console.log('no image data found')
    return
  }
  emit('imageDataLoaded', markRaw(pastedImageData))
}

function clear() {
  emit('clear')
}

</script>
<template>
  <article class="card">
    <header>
      <h6>
        <slot name="label"></slot>
      </h6>
    </header>

    <div v-if="errorMessage" role="alert" data-variant="error">
      {{ errorMessage }}
    </div>

    <input ref="fileInputEl" type="file" accept="image/*" @change="handleFileUpload" placeholder="input" />
    <button role="button" @click="paste" class="small">Paste</button>
    &nbsp;
    <button v-if="imageDataUrl" role="button" @click="clear" data-variant="danger" class="small">Clear</button>

    <div v-if="imageDataUrl" class="mt-1">
      <PixelImg
        :src="imageDataUrl ?? ''"
        class="img-target"
        :scale="scale"
      />
    </div>
  </article>

</template>