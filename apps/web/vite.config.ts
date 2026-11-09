import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import themeConfig from '../../packages/content/data/config/theme.json' with { type: 'json' };
// @ts-expect-error - plain ESM helper without type declarations
import { cacheDir } from '../../scripts/cacheDir.mjs';

// Caches live outside OneDrive (docs/onedrive.md). `/api` is proxied to the Save_API dev server.
export default defineConfig({
  cacheDir: cacheDir('vite-web') as string,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // save, then activate on confirm (42.4)
      strategies: 'generateSW',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Human Resource',
        short_name: 'Human Resource',
        description: 'Run a tiny pub, then an entire city.',
        theme_color: themeConfig.pwa.themeColor,
        background_color: themeConfig.pwa.backgroundColor,
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,glb,gltf,json}'], // precache everything, incl. the Rapier chunk (42.2)
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
});
