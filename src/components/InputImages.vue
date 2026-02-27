<script setup lang="ts">
import type { ImageFile } from '../lib/images.ts'
import PixelImg from './PixelImg.vue'

const emit = defineEmits<{
  (e: 'img-click', target: HTMLImageElement, id: number): void
}>()

const {
  images,
  scale,
  selectedImgId,
} = defineProps<{
  images: ImageFile[],
  scale: number,
  selectedImgId: number,
}>()
</script>
<template>
  <p><strong>Input Images</strong></p>
  <div
    class="img-wrapper"
    :class="{
      'selected': image.id === selectedImgId
    }"
    :style="{
      width: image.width * scale + 4 + 'px',
      height: image.height * scale + 4 + 'px'
    }"
    v-for="image in images"
    :key="image.src"
  >
    <PixelImg
      :src="image.src"
      class="img-target"
      :scale="scale"
      @img-click="emit('img-click', $event, image.id)"
    />
  </div>
</template>
<style scoped lang="scss">

.img-wrapper {
  display: inline-block;
  border: 1px solid rgba(255, 255, 255, 0);
  transition: border-color 0.1s ease-in;
  padding: 2px;
  margin: 0.5rem 0.5rem 0 0;

  &:hover,
  &.selected {
    border-color: rgba(255, 255, 255, 1);
    transition: border-color 0.1s ease-out;
  }
}

.img-target {
  cursor: pointer;
}
</style>