import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['*.test.ts'],
    // Every test opens its own sockets on its own topic, so they do
    // not tread on each other, but a socket is a real connection and
    // a file at a time keeps a failure readable.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
