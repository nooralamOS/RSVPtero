import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/wasm/*',
          dest: 'wasm',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/pdfjs-dist/standard_fonts/*',
          dest: 'standard_fonts',
          rename: { stripBase: true },
        },
        // Serve local PDFs at /books/* (dev + build)
        {
          src: 'books/*.pdf',
          dest: 'books',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
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
