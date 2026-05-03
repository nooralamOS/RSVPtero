import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // pdfjs-dist ships its own worker as a separate ESM chunk;
    // excluding it prevents Vite from trying to pre-bundle it and
    // breaking the worker URL resolution at runtime.
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
});
