import type { Ref } from 'vue'

export function setupSourceImageHMR(
  sourceImageId: Ref<number>,
  sourceImagePresetSrc: Ref<string | null>,
  setSourceImageFromElement: (el: HTMLImageElement, id: number) => Promise<void>,
) {
  if (import.meta.hot) {
    import.meta.hot.on('vite:afterUpdate', async () => {
      const id = sourceImageId.value
      if (id < 0) return
      const { SLIDING_WINDOW_IMAGES: sw, TILESET_IMAGES: ts } = await import('../images.ts')
      const img = [...sw, ...ts].find(i => i.id === id)
      if (!img || img.src === sourceImagePresetSrc.value) return
      const el = new Image()
      el.src = img.src
      await setSourceImageFromElement(el, id)
    })
  }
}
