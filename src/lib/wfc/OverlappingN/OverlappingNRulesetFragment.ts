import { DX, DY } from '../../util/direction.ts'
import { makeWFCRuleset, type WFCRuleset } from '../WFCRuleset.ts'

export type FragmentRulesetOptions = {
  source: ImageData,
  N: number,
  symmetry: number,
}

export function makeFragmentRuleset(
  {
    N,
    source,
    symmetry,
  }: FragmentRulesetOptions,
): WFCRuleset {
  const width = source.width
  const height = source.height
  const data = source.data
  const patternLen = N * N

  // Use a 32-bit view to read RGBA as a single integer per pixel
  const sample = new Int32Array(data.buffer)

  // We'll define a "background" as a fully transparent pixel for the flood fill
  const emptyColor = 0
  const visited = new Uint8Array(sample.length)
  const sourcePatterns: Int32Array[] = []

  for (let i = 0; i < sample.length; i++) {
    // Skip if already visited or if the pixel is empty (0x00000000)
    if (visited[i] || sample[i] === emptyColor) {
      continue
    }

    const fragmentPixels: { x: number, y: number, color: number }[] = []
    const stack = [i]
    visited[i] = 1

    let minX = i % width
    let maxX = minX
    let minY = Math.floor(i / width)
    let maxY = minY

    while (stack.length > 0) {
      const currIdx = stack.pop()!
      const cx = currIdx % width
      const cy = Math.floor(currIdx / width)
      const color = sample[currIdx]!

      fragmentPixels.push({ x: cx, y: cy, color })

      minX = Math.min(minX, cx)
      maxX = Math.max(maxX, cx)
      minY = Math.min(minY, cy)
      maxY = Math.max(maxY, cy)

      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d]!
        const ny = cy + DY[d]!
        const nIdx = ny * width + nx

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (!visited[nIdx] && sample[nIdx] !== emptyColor) {
            visited[nIdx] = 1
            stack.push(nIdx)
          }
        }
      }
    }

    // Map fragment to pattern, using emptyColor (0) for the background padding
    const pattern = new Int32Array(patternLen).fill(emptyColor)
    const fragW = maxX - minX + 1
    const fragH = maxY - minY + 1
    const offX = Math.floor((N - fragW) / 2)
    const offY = Math.floor((N - fragH) / 2)

    for (const p of fragmentPixels) {
      const px = p.x - minX + offX
      const py = p.y - minY + offY

      if (px >= 0 && px < N && py >= 0 && py < N) {
        pattern[px + py * N] = p.color
      }
    }

    sourcePatterns.push(pattern)
  }

  return makeWFCRuleset(N, symmetry, sourcePatterns)
}