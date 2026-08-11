import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['*.test.ts'],
    // One database, one bucket, and objects named per test. Serial
    // because the resume test aborts an upload halfway and a parallel
    // file would be signing in underneath it.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
