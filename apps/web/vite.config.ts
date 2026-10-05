import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@duka/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'), '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'Duka System', short_name: 'Duka', description: 'Duka lako, mfukoni mwako. Offline-first shop manager for Kenyan dukas.',
        theme_color: '#121417', background_color: '#121417', display: 'standalone', orientation: 'portrait', start_url: '/', lang: 'sw',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }],
        shortcuts: [{ name: 'Uza', url: '/?tab=sell' }, { name: 'Kitabu', url: '/?tab=kitabu' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html', runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }] },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: { output: { manualChunks: { three: ['three', '@react-three/fiber'], charts: ['recharts'] } } },
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173, proxy: { '/fn': { target: 'http://127.0.0.1:54321/functions/v1', changeOrigin: true, rewrite: p => p.replace(/^\/fn/, '') } } },
});
