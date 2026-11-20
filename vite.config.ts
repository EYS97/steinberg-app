import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Only scan root index.html for dependencies — don't touch public/ HTML files
  optimizeDeps: {
    entries: ['index.html'],
    // @hebcal/noaa ships top-level await; default dev target (es2020) crashes the optimizer
    esbuildOptions: { target: 'es2022' },
  },
  build: {
    outDir: 'dist',
    // Never ship source maps to production — they expose full original source.
    sourcemap: false,
    // @hebcal/hdate ships a top-level-await Temporal polyfill loader (needs es2022+)
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
