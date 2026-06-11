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
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
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
