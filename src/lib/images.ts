export type ImageFile = {
  src: string
  width: number
  height: number
  colorCount: number
}

type ImageMeta = {
  src: string
  width: number
  height: number
}

type ProcessImageInput = {
  images: Record<string, ImageMeta>,
  imageCounts: Record<string, number>
}

const processImages = ({ images, imageCounts }: ProcessImageInput): ImageFile[] => {
  return Object.entries(images)
    .map(([path, meta]) => {
      return {
        src: meta.src,
        width: meta.width,
        height: meta.height,
        colorCount: imageCounts[path]!,
      }
    })
    .sort((a, b) => a.width - b.width)
}

export const SLIDING_WINDOW_IMAGES = processImages({
  images: import.meta.glob('../assets/sliding-window/*.png', {
    eager: true,
    import: 'default',
    query: {
      as: 'metadata',
    },
  }),
  imageCounts: import.meta.glob('../assets/sliding-window/*.png', {
    eager: true,
    import: 'default',
    query: { count_colors: 'true' },
  }),
})

export const TILESET_IMAGES = processImages({
  images: import.meta.glob('../assets/tileset/*.png', {
    eager: true,
    import: 'default',
    query: {
      as: 'metadata',
    },
  }),
  imageCounts: import.meta.glob('../assets/tileset/*.png', {
    eager: true,
    import: 'default',
    query: { count_colors: 'true' },
  }),
})
