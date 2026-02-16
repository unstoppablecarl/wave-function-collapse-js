import { type Reactive, ref, type ShallowRef, watch } from 'vue'
import type { ImageDataAnalyzerWorkerOptions } from './ImageDataAnalyzer.worker.ts'
import type { OverlappingNWorkerOptions } from './OverlappingN/OverlappingN.worker.ts'

export function makeImageDataAnalyzer(
  imageDataSource: ShallowRef<ImageData | null>,
  settings: Reactive<OverlappingNWorkerOptions['settings']>,
) {

  let worker: Worker | null = null
  const averageBrittleness = ref<number | null>(null)
  const running = ref(false)

  watch([
    imageDataSource,
    () => settings.N,
    () => settings.symmetry,
    () => settings.periodicInput,
  ], () => {
    running.value = false
    averageBrittleness.value = null
    if (!imageDataSource.value) return

    const { N, symmetry, periodicInput } = settings

    run({
      imageData: imageDataSource.value,
      N,
      symmetry,
      periodicInput,
    })
  })

  const run = debounce((opts: ImageDataAnalyzerWorkerOptions) => {
    terminate()

    running.value = true
    worker = new Worker(new URL('./ImageDataAnalyzer.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.postMessage(opts)
    worker.onmessage = (e: MessageEvent<{ averageBrittleness: number }>) => {
      averageBrittleness.value = e.data.averageBrittleness ?? null

      running.value = false
      terminate()
    }
  }, 200)

  function terminate() {
    worker?.terminate()
    worker = null
  }

  return {
    averageBrittleness,
    running,
  }
}

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined

  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      func(...args)
    }, wait)
  }
}