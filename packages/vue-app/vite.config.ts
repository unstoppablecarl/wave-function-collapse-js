import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { imagetools } from 'vite-imagetools'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import { ColorCountPlugin } from './src/lib/util/ViteImageColorCountPlugin.ts'

export default defineConfig({
  base: '/wave-function-collapse-js/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [
    vue(),
    wasm(),
    topLevelAwait(),
    ColorCountPlugin(),
    imagetools(),
  ],
  worker: {
    format: 'es',
    plugins: () => [
      wasm(),
      topLevelAwait(),
    ],
  },
  server: {
    fs: {
      allow: [
        '../..',
      ],
    },
  },
  resolve: {
    alias: {
      '@unstoppablecarl/wfc-js': resolve(__dirname, '../wfc-js/src/index.ts'),
      '@unstoppablecarl/wfc-rust': resolve(__dirname, '../wfc-rust/pkg'),

    },
  },
  optimizeDeps: {
    exclude: [
      '@unstoppablecarl/wfc-rust'
    ]
  }
})