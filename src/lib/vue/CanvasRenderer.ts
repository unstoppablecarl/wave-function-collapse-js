import { type Reactive, type Ref } from 'vue'
import PixelCanvasRender from '../../components/PixelCanvasRender.vue'

export function makeCanvasRenderer(
  canvasRef: Ref<InstanceType<typeof PixelCanvasRender> | null>,
  size: Reactive<{ width: number, height: number }>,
) {

  let pendingImageData: Uint8ClampedArray | null = null
  let rafId: number | null = null

  function updateCanvas() {
    if (!pendingImageData || !canvasRef.value?.canvas) return
    draw(pendingImageData)
    pendingImageData = null
  }

  function clearCanvas() {
    const canvas = canvasRef.value!.canvas!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function draw(data: Uint8ClampedArray) {
    const canvas = canvasRef.value!.canvas
    const ctx = canvas!.getContext('2d')!
    const imgData = new ImageData(data as ImageDataArray, size.width, size.height)
    ctx.putImageData(imgData, 0, 0)
  }

  function updateImageBuffer(buffer: Uint8ClampedArray) {
    pendingImageData = buffer
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      updateCanvas()
    })
  }

  return {
    updateImageBuffer,
    updateCanvas,
    clearCanvas,
    draw,
  }
}