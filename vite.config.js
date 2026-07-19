import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://scholrun-api.onrender.com',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'https://scholrun-api.onrender.com',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
