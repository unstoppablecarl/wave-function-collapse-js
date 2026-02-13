import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: '/wave-function-collapse-js/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [vue()],
})
