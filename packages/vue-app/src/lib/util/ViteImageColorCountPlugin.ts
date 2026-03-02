import fs from 'fs'
import sharp from 'sharp'
import { type Plugin } from 'vite'

const query = '?count_colors=true'

export const ColorCountPlugin = (): Plugin => {
  return {
    name: 'vite-plugin-color-count',
    async transform(_code: string, id: string) {
      if (!id.endsWith(query)) return null

      const filePath = id.replace(query, '').split('?')[0] as string
      const buffer = await fs.promises.readFile(filePath)
      const image = sharp(buffer)
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })

      const pixels = new Set()
      const channels = info.channels

      for (let i = 0; i < data.length; i += channels) {
        // Read only the number of bytes present in the channel (3 or 4)
        const color = data.readUIntLE(i, channels)
        pixels.add(color)
      }

      return {
        code: `export default ${pixels.size}`,
        map: null,
      }
    },
  }
}