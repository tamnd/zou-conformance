import { defineConfig } from '@playwright/test'

const APP = process.env.DEMO_APP_URL || 'http://localhost:4173'
const STUB = Number(process.env.DEMO_STUB_PORT || 54399)

export default defineConfig({
  testDir: './tests',
  // Every test signs somebody in, and a browser is one session at a
  // time. Two of them racing through the same sign in form is a flake
  // rather than a finding.
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: APP,
    // A console error in this app is a request that failed, so the
    // trace is worth having on the run that failed.
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node stub-github.mjs`,
      url: `http://127.0.0.1:${STUB}/api/v3/user`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Built rather than served from source, because what a project
      // ships is the build and vite's dev server is not it.
      command: 'npm --prefix app run build && npm --prefix app run preview -- --port 4173 --strictPort',
      url: APP,
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
    },
  ],
})
