import { defineConfig } from '@playwright/test'

const APP = process.env.DEMO_APP_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  // Every test here opens two browsers and signs somebody in on each,
  // and the app puts the whole project in one channel per table. Two
  // tests doing that at once would be reading each other's rows, which
  // is a flake rather than a finding.
  workers: 1,
  // A frame that never arrives is the failure this whole file is
  // about, so a wait for one is given room and then given up on.
  timeout: 60000,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: APP,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Built rather than served from source, because what a project
      // ships is the build and next's dev server is not it.
      command: 'npm --prefix app run build && npm --prefix app run start -- --port 3000',
      url: APP,
      reuseExistingServer: !process.env.CI,
      timeout: 300000,
    },
  ],
})
