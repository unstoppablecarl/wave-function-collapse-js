import type { Color32 } from 'pixel-data-js'

export function makeDirtyCheck(size: number, setter: (cellIndex: number) => Color32) {
  const changedCells = new Int32Array(size)
  let changedCount = 0
  const dirtyFlags = new Uint8Array(size)
  const pixelBuffer = new Uint32Array(size)

  const markDirty = (i: number) => {
    if (dirtyFlags[i] === 0) {
      dirtyFlags[i] = 1
      changedCells[changedCount++] = i
    }
  }

  const getVisualBuffer = (): Uint8ClampedArray => {
    for (let idx = 0; idx < changedCount; idx++) {
      const i = changedCells[idx]!
      pixelBuffer[i] = setter(i)
      dirtyFlags[i] = 0
    }
    changedCount = 0

    const out = new Uint8ClampedArray(size * 4)
    const view = new Uint32Array(out.buffer)
    view.set(pixelBuffer)
    return out
  }

  return {
    markDirty,
    getVisualBuffer,
  }
}