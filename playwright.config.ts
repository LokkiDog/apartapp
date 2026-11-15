import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './.artifacts/playwright/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: './.artifacts/playwright/report', open: 'never' }]
  ],
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:2000',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } }
  ]
})
