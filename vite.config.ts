import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep bundled images and lazy chunks relative to the hosted module. The
  // same build runs under the GitHub Pages project path and inside APEX.
  base: './',
  server: {
    proxy: {
      '/api/ords': {
        target: 'https://eservices.zu.edu.jo',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/main.js',
        assetFileNames: 'assets/main.[ext]'
      }
    }
  }
})
