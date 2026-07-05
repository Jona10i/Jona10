import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Dev proxy: /api/* → FastAPI at localhost:8000
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom'],
          // Charting (heaviest dependency)
          'vendor-recharts': ['recharts'],
          // Icons
          'vendor-lucide': ['lucide-react'],
          // State
          'vendor-zustand': ['zustand'],
        },
      },
    },
    // Raise the warning threshold — chunks are now split so this is informational only
    chunkSizeWarningLimit: 600,
  },
})
