import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import UnoCSS from 'unocss/vite'

const repoName = 'FundLite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/',
  plugins: [
    vue(),
    // Vue DevTools 仅在开发环境使用
    ...(process.env.NODE_ENV !== 'production' ? [vueDevTools()] : []),
    UnoCSS(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon.svg', 'pwa-icon-maskable.svg'],
      manifest: {
        id: `/${repoName}/`,
        name: 'FundLite 基金自选',
        short_name: 'FundLite',
        description: '一个适合手机使用的轻量基金自选与估值查看工具。',
        theme_color: '#0f766e',
        background_color: '#f4f7f1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: `/${repoName}/`,
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webmanifest}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
