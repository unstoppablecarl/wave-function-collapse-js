import { getImgElementImageData } from './ImageData.ts'

export async function getFileAsArrayBuffer(e: Event): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const target = e.target as HTMLInputElement
    if (!target.files || target.files.length === 0) {
      reject(new Error('No file selected'))
      return
    }

    const selectedFile = target.files[0] as Blob
    const reader = new FileReader()

    reader.onload = (event) => {
      const result = event.target?.result
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Could not get file data as ArrayBuffer'))
      } else {
        resolve(result)
      }
    }

    reader.onerror = () => {
      reject(new Error('File read failed'))
    }

    reader.readAsArrayBuffer(selectedFile)
  })
}

export async function arrayBufferToImageData(arrayBuffer: ArrayBuffer, mimeType: string = 'html-dom/png'): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([arrayBuffer], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const tempImg = new Image()

    tempImg.onload = () => {
      try {
        URL.revokeObjectURL(url)  // Cleanup memory
        const imageData = getImgElementImageData(tempImg)
        resolve(imageData)
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(new Error(`Failed to extract ImageData: ${error}`))
      }
    }

    tempImg.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Invalid File'))
    }

    tempImg.src = url
  })
}