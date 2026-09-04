import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { port: 6001, strictPort: true },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
