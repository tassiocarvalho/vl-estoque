import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: o sistema pode ser "instalado" no PC/celular e continua abrindo sem internet.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'V&L Estoque',
        short_name: 'V&L Estoque',
        description: 'Gestão de estoque — V&L Mercadinho e Panificadora',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#18664f',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Consultas à API: tenta a rede e, sem internet, usa a última resposta salva.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET' && !url.pathname.startsWith('/api/integration'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 3 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // As telas secundárias já são carregadas sob demanda; o pacote principal (~180 KB gzip) é esperado.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    host: true,
    // Em desenvolvimento o Vite repassa /api para o back-end: front e API ficam na mesma origem.
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
});
