/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages は https://ユーザー名.github.io/apartment-app/ に置かれるため、
// base を必ずリポジトリ名にする（これが無いと画面が真っ白になる）
export default defineConfig({
  base: '/apartment-app/',
  plugins: [
    react(),
    VitePWA({
      // 「更新しますか？」の確認は必ず無視されるので、黙って新しくする
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'アパート管理',
        short_name: 'アパート管理',
        description: '入居者・家賃・修繕の記録を残すアプリ',
        lang: 'ja',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#00417A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // アプリ本体はすべて先読みしておく（電波が無くても開けるようにするため）
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
