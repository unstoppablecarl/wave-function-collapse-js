import { ref, type ShallowRef, watch } from 'vue'
import { useStore } from '../store.ts'
import type { CalcBrittlenessWorkerOptions } from './calcBrittleness.worker.ts'

export function makeImageDataBrittlenessCalculator(imageDataSource: ShallowRef<ImageData | null>) {
  const store = useStore()

  let worker: Worker | null = null
  const averageBrittleness = ref<number | null>(null)
  const running = ref(false)

  watch([
    imageDataSource,
    () => store.settings.N,
    () => store.settings.symmetry,
    () => store.settings.periodicInput,
  ], () => {
    running.value = false
    averageBrittleness.value = null
    if (!imageDataSource.value) return

    const { N, symmetry, periodicInput } = store.settings

    run({
      imageData: imageDataSource.value,
      N,
      symmetry,
      periodicInput,
    })
  })

  const run = debounce((opts: CalcBrittlenessWorkerOptions) => {
    terminate()

    running.value = true
    worker = new Worker(new URL('./calcBrittleness.worker.ts', import.meta.url), {
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
    average: averageBrittleness,
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