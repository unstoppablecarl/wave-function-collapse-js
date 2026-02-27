import { type Color32, unpackBlue, unpackGreen, unpackRed } from 'pixel-data-js'

export type PatternArrayToCanvasCalculation = ReturnType<typeof calculatePatternArrayToCanvas>

export function calculatePatternArrayToCanvas(
  images: ImageData[],
  padding: number = 2,
) {
  if (images.length === 0) return
  const T = images.length
  // Assume all patterns are N x N
  const N = images[0]!.width

  // Calculate grid layout
  const cols = Math.ceil(Math.sqrt(T))
  const rows = Math.ceil(T / cols)
  const cellSize = N + padding

  return {
    cols,
    rows,
    width: cols * cellSize,
    height: rows * cellSize,
    T,
    N,
    cellSize,
  }
}

export function drawPatternArrayToCanvas(
  canvas: HTMLCanvasElement,
  images: ImageData[],
  {
    T,
    cols,
    width,
    height,
    cellSize,
  }: NonNullable<PatternArrayToCanvasCalculation>,
) {
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  if (!ctx || images.length === 0) return

  canvas.width = width
  canvas.height = height
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (let t = 0; t < T; t++) {
    const col = t % cols
    const row = Math.floor(t / cols)

    const x = col * cellSize
    const y = row * cellSize

    ctx.putImageData(images[t]!, x, y)
  }

  return {
    width: canvas.width,
    height: canvas.height,
  }
}

export function makePatternImageDataArray(
  patterns: Int32Array,
  T: number,
  N: number,
  palette: Int32Array,
): ImageData[] {
  const images: ImageData[] = []
  const patternLen = N * N

  for (let t = 0; t < T; t++) {
    const patternOffset = t * patternLen
    const img = createPatternImageData(patterns, N, palette, patternOffset)
    images.push(img)
  }

  return images
}

export function makeOriginalPatternImageDataArray(
  patterns: Int32Array[],
  N: number,
  palette: Int32Array,
): ImageData[] {
  const images: ImageData[] = []

  for (let t = 0; t < patterns.length; t++) {
    const currentPattern = patterns[t]!
    const img = createPatternImageData(currentPattern, N, palette)
    images.push(img)
  }

  return images
}

function createPatternImageData(
  pattern: Int32Array | Uint32Array,
  N: number,
  palette: Int32Array,
  offset: number = 0,
): ImageData {
  const patternLen = N * N
  const buffer = new Uint8ClampedArray(patternLen * 4)

  for (let i = 0; i < patternLen; i++) {
    const pixelId = pattern[offset + i]!
    const color = palette[pixelId]! as Color32
    const targetIdx = i * 4

    buffer[targetIdx] = unpackRed(color)
    buffer[targetIdx + 1] = unpackGreen(color)
    buffer[targetIdx + 2] = unpackBlue(color)

    // Extracting Alpha and applying visibility fallback
    const sourceAlpha = (color >> 24) & 0xFF
    buffer[targetIdx + 3] = sourceAlpha === 0 ? 255 : sourceAlpha
  }

  return new ImageData(buffer, N, N)
}