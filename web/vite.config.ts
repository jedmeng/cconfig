import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const rawBase = process.env.CCONFIG_BASE_PATH?.trim() || '/'
const base =
  rawBase === '/'
    ? '/'
    : rawBase.endsWith('/')
      ? rawBase
      : `${rawBase}/`

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        headers: {
        },
      },
    },
  },
})
