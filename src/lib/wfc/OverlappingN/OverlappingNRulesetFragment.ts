import type { IndexedImage } from 'pixel-data-js'
import { DX, DY } from '../../util/direction.ts'
import { makeWFCRuleset, type WFCRuleset } from '../WFCRuleset.ts'

export type FragmentRulesetOptions = {
  indexedImage: IndexedImage,
  symmetry: number,
}

export function makeFragmentRuleset(
  {
    indexedImage,
    symmetry,
  }: FragmentRulesetOptions,
): WFCRuleset {
  const { data, width, height } = indexedImage
  const visited = new Uint8Array(data.length)
  const fragments: { x: number, y: number, id: number }[][] = []
  const fragmentBounds: { w: number, h: number, minX: number, minY: number }[] = []

  // 1. Extract islands (fragments)
  for (let i = 0; i < data.length; i++) {
    if (visited[i] || data[i] === 0) {
      continue
    }

    const fragmentPixels: { x: number, y: number, id: number }[] = []
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
      const cId = data[currIdx]!

      fragmentPixels.push({
        x: cx,
        y: cy,
        id: cId,
      })

      minX = Math.min(minX, cx)
      maxX = Math.max(maxX, cx)
      minY = Math.min(minY, cy)
      maxY = Math.max(maxY, cy)

      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d]!
        const ny = cy + DY[d]!

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx
          if (!visited[nIdx] && data[nIdx] !== 0) {
            visited[nIdx] = 1
            stack.push(nIdx)
          }
        }
      }
    }

    fragments.push(fragmentPixels)
    fragmentBounds.push({
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      minX,
      minY,
    })
  }

  // 2. Validate island sizes
  if (fragments.length === 0) {
    throw new Error('No islands found in source image.')
  }

  const firstW = fragmentBounds[0]!.w
  const firstH = fragmentBounds[0]!.h

  // Verify all islands match the first one
  for (let i = 1; i < fragmentBounds.length; i++) {
    const b = fragmentBounds[i]!
    if (b.w !== firstW || b.h !== firstH) {
      throw new Error(
        `Island size mismatch! Expected ${firstW}x${firstH}, but found ${b.w}x${b.h} at index ${i}`,
      )
    }
  }

  // Islands must be square for D4 symmetry (rotation) to work correctly
  if (firstW !== firstH) {
    throw new Error(`Islands must be square for symmetry. Found ${firstW}x${firstH}`)
  }

  const N = firstW
  const patternLen = N * N
  const sourcePatterns: Int32Array[] = []

  // 3. Create patterns (No offsets needed since islands are already N x N)
  for (let i = 0; i < fragments.length; i++) {
    const fragmentPixels = fragments[i]!
    const bounds = fragmentBounds[i]!
    const pattern = new Int32Array(patternLen)

    for (const p of fragmentPixels) {
      const px = p.x - bounds.minX
      const py = p.y - bounds.minY

      pattern[px + py * N] = p.id
    }

    sourcePatterns.push(pattern)
  }

  return makeWFCRuleset(N, symmetry, sourcePatterns)
}