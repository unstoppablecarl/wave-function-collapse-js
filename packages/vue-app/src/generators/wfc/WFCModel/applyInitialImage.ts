import type { Color32 } from 'pixel-data-js'
import { unpackBlue, unpackGreen, unpackRed } from 'pixel-data-js'

export function applyInitialImage<C extends number, P extends number>(
  ban: (cell: C, pattern: P) => void,
  propagate: () => boolean,
  initialImageData: ImageData,
  width: number,
  height: number,
  T: number,
  N: number,
  patterns: Int32Array,
  palette: Uint32Array,
) {
  const { data } = initialImageData
  const imgW = initialImageData.width
  const imgH = initialImageData.height
  const patternStride = N * N

  for (let y = 0; y < Math.min(imgH, height); y++) {
    for (let x = 0; x < Math.min(imgW, width); x++) {
      const pixelOffset = (y * imgW + x) * 4
      if (data[pixelOffset + 3] === 0) continue

      const r = data[pixelOffset]!
      const g = data[pixelOffset + 1]!
      const b = data[pixelOffset + 2]!
      const cellIdx = (y * width + x) as C

      for (let t = 0; t < T; t++) {
        const colorId = patterns[t * patternStride]!
        const c = palette[colorId]! as Color32
        if (unpackRed(c) !== r || unpackGreen(c) !== g || unpackBlue(c) !== b) {
          ban(cellIdx, t as P)
        }
      }
    }
  }
  propagate()
}
