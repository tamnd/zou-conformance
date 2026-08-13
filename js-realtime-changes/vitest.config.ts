import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['*.test.ts'],
    // A test here writes rows and waits for them to come back around,
    // so two of them at once would be two tests watching each other's
    // writes. One at a time, and one file at a time.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
