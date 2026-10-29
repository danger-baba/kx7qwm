import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, /api is proxied to the FastAPI server (uvicorn on :8000).
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } },
  },
  server: {
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8000' },
  },
})
