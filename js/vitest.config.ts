import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // describe, test, expect and the hooks without importing them, so
    // the suite reads the way upstream wrote it under jest.
    globals: true,
    include: ['*.test.ts'],
    // One file, and every block in it shares one client and one
    // database. Parallel would have the RLS block signing in and out
    // underneath the auth block.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
