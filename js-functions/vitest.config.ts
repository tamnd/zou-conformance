import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['*.test.ts'],
    // A file at a time. Every question here is a real invocation in a
    // real isolate, and a cold start under a stampede is a timeout
    // rather than an answer.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
