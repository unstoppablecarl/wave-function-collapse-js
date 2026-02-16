import { type Reactive, ref, shallowRef, type ShallowRef, watch } from 'vue'
import type { ImageDataAnalyzerWorkerOptions, ImageDataAnalyzerWorkerResult } from './ImageDataAnalyzer.worker.ts'
import type { OverlappingNWorkerOptions } from './OverlappingN/OverlappingN.worker.ts'
import { makePatternImageDataArray } from './PatternSheetRenderer.ts'

export function makeImageDataAnalyzer(
  imageDataSource: ShallowRef<ImageData | null>,
  settings: Reactive<OverlappingNWorkerOptions['settings']>,
) {

  let worker: Worker | null = null
  const averageBrittleness = ref<number | null>(null)
  const running = ref(false)
  const patternImageDataArray = shallowRef<ImageData[]>([])
  const T = ref(0)

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
    worker.onmessage = (e: MessageEvent<ImageDataAnalyzerWorkerResult>) => {
      const { averageBrittleness: avgBrittleness, palette, patterns, T: TVal } = e.data
      averageBrittleness.value = avgBrittleness ?? null
      patternImageDataArray.value = makePatternImageDataArray(patterns, TVal, settings.N, palette)
      T.value = TVal
      running.value = false
      terminate()
    }
  }, 200)

  function terminate() {
    worker?.terminate()
    worker = null
  }

  return {
    T,
    averageBrittleness,
    running,
    patternImageDataArray,
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