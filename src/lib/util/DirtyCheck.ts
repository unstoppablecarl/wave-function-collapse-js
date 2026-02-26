export function makeDirtyCheck(size: number, setter: (cellIndex: number) => number) {
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
      // Hardcoded Black and White: 0 = Black (0,0,0,255), 1 = White (255,255,255,255)
      const val = setter(i)
      pixelBuffer[i] = (255 << 24) | (val << 16) | (val << 8) | val
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