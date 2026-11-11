import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  resolve: {
    alias: {
      '#fsd': fileURLToPath(new URL('./src', import.meta.url)),

      '#shared': fileURLToPath(new URL('./guest/shared', import.meta.url)),
      '@contracts': fileURLToPath(new URL('./shared/contracts', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'server/**/*.test.ts']
  }
})
