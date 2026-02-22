import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: '/wave-function-collapse-js/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [
    vue(),
    wasm(),
    topLevelAwait()
  ],
  worker: {
    // Not needed with vite-plugin-top-level-await >= 1.3.0
    // format: "es",
    plugins: () => [
      wasm(),
      topLevelAwait()
    ]
  }
})
