import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Front served by Vite in dev (port 5173), proxying /api to the Express server.
// In prod the built assets in ../dist are served directly by Express.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
