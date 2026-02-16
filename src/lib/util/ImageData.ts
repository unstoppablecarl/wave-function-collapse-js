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