<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

type Emits = {
  (e: 'imgClick', el: HTMLImageElement): void;
}
const emit = defineEmits<Emits>()

const imgRef = useTemplateRef('imgRef')

const { src, scale } = defineProps<{
  src: string,
  scale: number,
}>()
const baseWidth = ref(0)

function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  baseWidth.value = img.naturalWidth
}

const scaledWidth = computed(() => {
  return baseWidth.value > 0 ? `${baseWidth.value * scale}px` : 'auto'
})

</script>
<template>
  <img
    ref="imgRef"
    @click="emit('imgClick', imgRef!)"
    :src="src"
    @load="handleImageLoad"
    :style="{ width: scaledWidth }"
    class="pixel-art"
  />
</template>
<style>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  display: block;
}
</style>