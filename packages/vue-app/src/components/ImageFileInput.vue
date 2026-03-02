<script setup lang="ts">
import { markRaw, ref, useTemplateRef } from 'vue'
import { arrayBufferToImageData, getFileAsArrayBuffer } from '../lib/util/file-upload.ts'

type Emits = {
  (e: 'imageDataLoaded', imageData: ImageData): void;
}

const emit = defineEmits<Emits>()
const fileInputEl = useTemplateRef('fileInputEl')

const errorMessage = ref('')

const handleFileUpload = (event: Event) => {
  errorMessage.value = ''
  getFileAsArrayBuffer(event)
    .then(arrayBufferToImageData)
    .then((imageData) => {
      (fileInputEl.value as HTMLInputElement).value = ''
      emit('imageDataLoaded', markRaw(imageData))
    })
    .catch(error => {
      errorMessage.value = error.message
    })
}

</script>
<template>
  <div v-if="errorMessage" role="alert" data-variant="error">
    {{ errorMessage }}
  </div>
  <input ref="fileInputEl" type="file" accept="image/*" @change="handleFileUpload" class="form-control" />
</template>