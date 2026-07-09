import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Front servi par Vite en dev (port 5173), proxy /api vers le serveur Express.
// Le port d'API est lu depuis .env (racine) pour rester aligné avec le serveur.
// En prod les assets buildés dans ../dist sont servis directement par Express.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '8790'
  return {
    root: 'client',
    plugins: [react()],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
