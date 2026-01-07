import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // '/api/tronscan'으로 시작하는 요청을 만나면 target으로 토스한다
      '/api/tronscan': {
        target: 'https://apilist.tronscanapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tronscan/, ''),
        secure: false,
      },
    },
  },
});