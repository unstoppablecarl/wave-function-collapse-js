import { ref, shallowRef, type ShallowRef, watch } from 'vue'
import type { StoreSettings } from '../store/OverlappingNStore.ts'
import type { ImageDataAnalyzerWorkerOptions, ImageDataAnalyzerWorkerResult } from './ImageDataAnalyzer.worker.ts'
import { makeOriginalPatternImageDataArray, makePatternImageDataArray } from './PatternSheetRenderer.ts'
import { deserializeWFCRuleset, type WFCRuleset } from './WFCRuleset.ts'

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
    const currentWorker = new Worker(new URL('./ImageDataAnalyzer.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker = currentWorker
    worker.postMessage(opts)
    worker.onmessage = (e: MessageEvent<ImageDataAnalyzerWorkerResult>) => {
      // Only proceed if this is still the active worker
      if (currentWorker !== worker) return

      const {
        serializedRuleset,
        palette,
      } = e.data

      const rs = deserializeWFCRuleset(serializedRuleset)

      const patterns = rs.patterns
      const originalPatterns = rs.originalPatterns
      const brittleness = rs.propagator.getBrittleness()

      patternImageDataArray.value = makePatternImageDataArray(
        patterns,
        rs.T,
        rs.N,
        palette,
      )

      originalPatternImageDataArray.value = makeOriginalPatternImageDataArray(
        originalPatterns,
        rs.N,
        palette,
      )

      averageBrittleness.value = brittleness.averageBrittleness ?? null

      ruleset.value = rs
      T.value = rs.T
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