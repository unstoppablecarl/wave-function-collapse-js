// Map a palette Color32 entry (ABGR packed as RGBA in memory, so c & 0xFF = R) to its channels.
function paletteRGB(c: number): [number, number, number] {
  return [c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF]
}

// For each non-transparent pixel in imageData, set result/origins to the nearest palette entry
// and mark isInitialField. sourceData is the (symmetry-expanded) indexed source pixels.
export function applyInitialState(
  imageData: ImageData,
  palette32: Uint32Array,
  sourceData: Uint32Array,
  result: Int32Array,
  origins: Int32Array,
  isInitialField: Uint8Array,
  width: number,
): void {
  const numColors = palette32.length
  const sourceArea = sourceData.length

  // First source-pixel index for each palette entry (for origins lookup)
  const sourceForPalette = new Int32Array(numColors).fill(-1)
  for (let s = 0; s < sourceArea; s++) {
    const pidx = sourceData[s]!
    if (sourceForPalette[pidx] === -1) sourceForPalette[pidx] = s
  }

  const d = imageData.data
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const pi = (y * imageData.width + x) * 4
      if (d[pi + 3]! === 0) continue

      const r = d[pi]!, g = d[pi + 1]!, b = d[pi + 2]!
      let best = 0, bestDist = Infinity
      for (let c = 0; c < numColors; c++) {
        const [pr, pg, pb] = paletteRGB(palette32[c]!)
        const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if (dist < bestDist) { bestDist = dist; best = c }
      }

      const i = y * width + x
      result[i] = best
      origins[i] = sourceForPalette[best]!
      isInitialField[i] = 1
    }
  }
}
