import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base './' permite publicar el build en cualquier subcarpeta (GitHub Pages o Vercel).
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800, // three.js ocupa ~600 kB minificado
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        marcador: resolve(import.meta.dirname, 'analysis/marcador.html'),
      },
    },
  },
});
