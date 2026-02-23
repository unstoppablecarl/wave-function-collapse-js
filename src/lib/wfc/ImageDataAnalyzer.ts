import { ref, shallowRef, type ShallowRef, watch } from 'vue'
import type { StoreSettings } from '../store/OverlappingNStore.ts'
import type { ImageDataAnalyzerWorkerOptions, ImageDataAnalyzerWorkerResult } from './ImageDataAnalyzer.worker.ts'
import { makeOriginalPatternImageDataArray, makePatternImageDataArray } from './PatternSheetRenderer.ts'
import {
  deserializeWFCRuleset,
  type WFCRuleset,
} from './WFCRuleset.ts'

export function makeImageDataAnalyzer(
  imageDataSource: ShallowRef<ImageData | null>,
  settings: StoreSettings,
) {

  let worker: Worker | null = null
  const averageBrittleness = ref<number | null>(null)
  const running = ref(false)
  const patternImageDataArray = shallowRef<ImageData[]>([])
  const originalPatternImageDataArray = shallowRef<ImageData[]>([])
  const T = ref(0)

  const ruleset = shallowRef<WFCRuleset | null>(null)

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
      rulesetType: settings.rulesetType,
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
      const {
        averageBrittleness: avgBrittleness,
        T: TVal,
        serializedRuleset,
        palette,
        patterns,
        originalPatterns,
      } = e.data

      ruleset.value = deserializeWFCRuleset(serializedRuleset)

      patternImageDataArray.value = makePatternImageDataArray(patterns, TVal, settings.N, palette)
      originalPatternImageDataArray.value = makeOriginalPatternImageDataArray(originalPatterns, settings.N, palette)

      averageBrittleness.value = avgBrittleness ?? null

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
    originalPatternImageDataArray,
    ruleset,
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