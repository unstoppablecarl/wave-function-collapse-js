<script setup lang="ts">
import { ref } from 'vue'
const {
  width,
  height,
  scale,
} = defineProps<{
  width: number,
  height: number,
  scale: number,
}>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
defineExpose({
  canvas: canvasRef,
})
</script>
<template>
  <div class="canvas-container"
       :style="`width: ${width * scale}px; height: ${height * scale}px;`">
    <canvas
      ref="canvasRef"
      class="canvas-output"
      :width="width"
      :height="height"
      :style="`transform: scale(${scale})`"
    ></canvas>
  </div>
</template>
<style scoped lang="scss">
.canvas-container {
  overflow: hidden;
  position: relative;
}
</style>