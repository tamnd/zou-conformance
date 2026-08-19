import { defineConfig } from '@playwright/test'

const APP = process.env.DEMO_APP_URL || 'http://127.0.0.1:4174'

export default defineConfig({
  testDir: './tests',
  // Every test signs somebody in, and a browser is one session at a
  // time. Two of them racing through the same form is a flake rather
  // than a finding.
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  // A function is loaded the first time somebody asks for it, and the
  // first ask fetches what it imports off a registry, so the first
  // invoke in a run is slow in a way the rest are not.
  timeout: 120000,
  use: {
    baseURL: APP,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Built rather than served from source, because what a project
      // ships is the build and a development server is not it.
      command: 'npm --prefix app run build && node serve-app.mjs',
      url: APP,
      reuseExistingServer: !process.env.CI,
      timeout: 300000,
    },
  ],
})
