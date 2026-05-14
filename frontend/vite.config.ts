import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/tasks': 'http://localhost:3000',
      '/push': 'http://localhost:3000',
    },
  },
});
