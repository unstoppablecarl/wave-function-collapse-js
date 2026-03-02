export async function imgLoaded(img: HTMLImageElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // If the browser already has the image (cached or already loaded)
    if (img.complete && img.naturalWidth !== 0) {
      resolve(img)
      return
    }

    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${img.src}`))
  })
}

export async function getImgElementImageData(target: HTMLImageElement): Promise<ImageData> {
  const img = await imgLoaded(target)
  const { naturalWidth: w, naturalHeight: h } = img

  if (w === 0 || h === 0) {
    throw new Error('Image has no dimensions. Is the src valid?')
  }
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  // Draw and extract
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

export function putImageDataScaled(ctx: CanvasRenderingContext2D, imageData: ImageData, scale: number) {
  const offCanvas = new OffscreenCanvas(imageData.width, imageData.height)
  const offCtx = offCanvas.getContext('2d')!
  offCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(offCanvas, 0, 0, imageData.width * scale, imageData.height * scale)
}

export function imageDataToUrlImage(imgData: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = imgData.width
  canvas.height = imgData.height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL()
}

/**
 * Scans ImageData for separate rectangular areas divided by transparency.
 * Throws an error if a non-rectangular shape is encountered.
 */
export function extractRectangularAreas(imageData: ImageData): ImageData[] {
  const { width, height, data } = imageData
  const visited = new Uint8Array(width * height)
  const rects: ImageData[] = []

  // Helper to check if a pixel is transparent (Alpha channel is 0)
  const isTransparent = (x: number, y: number) => data[(y * width + x) * 4 + 3] === 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Skip transparent or already processed pixels
      if (isTransparent(x, y) || visited[y * width + x]) continue

      // 1. Determine the bounds of this connected area
      let minX = x, maxX = x, minY = y, maxY = y
      const stack = [[x, y]]
      const componentPixels: [number, number][] = []

      visited[y * width + x] = 1

      while (stack.length > 0) {
        const [ix, iy] = stack.pop()!
        const cx = ix as number
        const cy = iy as number

        componentPixels.push([cx, cy])

        // Update bounding box
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        // Check 4-way neighbors
        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]
        for (const [jx, jy] of neighbors) {
          const nx = jx as number
          const ny = jy as number

          if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
            !isTransparent(nx, ny) && !visited[ny * width + nx]) {
            visited[ny * width + nx] = 1
            stack.push([nx, ny])
          }
        }
      }

      // 2. Validate Rectangularity
      const rectWidth = maxX - minX + 1
      const rectHeight = maxY - minY + 1
      const expectedPixelCount = rectWidth * rectHeight

      if (componentPixels.length !== expectedPixelCount) {
        // Find a "missing" pixel within the bounding box to report
        for (let ry = minY; ry <= maxY; ry++) {
          for (let rx = minX; rx <= maxX; rx++) {
            // If a pixel inside the box is transparent, that's the error point
            if (isTransparent(rx, ry)) {
              throw new Error(`Non-rectangular shape detected. Transparent hole at x:${rx}, y:${ry}`)
            }
          }
        }
        // If no holes, it must be an L-shape or protruding pixels
        throw new Error(`Non-rectangular shape detected near x:${minX}, y:${minY}`)
      }

      // 3. Extract the area into a new ImageData object
      const rectData = new Uint8ClampedArray(rectWidth * rectHeight * 4)
      for (let ry = 0; ry < rectHeight; ry++) {
        for (let rx = 0; rx < rectWidth; rx++) {
          const sourceIdx = ((minY + ry) * width + (minX + rx)) * 4
          const targetIdx = (ry * rectWidth + rx) * 4
          rectData.set(data.subarray(sourceIdx, sourceIdx + 4), targetIdx)
        }
      }
      rects.push(new ImageData(rectData, rectWidth, rectHeight))
    }
  }

  return rects
}