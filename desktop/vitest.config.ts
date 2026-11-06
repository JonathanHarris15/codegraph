// codegraph: tooling
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Real git in real folders, and a real window for the UI test: slower
    // than the default patience allows, especially on a cold disk.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The UI tests each drive a real window. Too many at once starve each other,
    // and different tests fail on each run, so test files take turns.
    fileParallelism: false,
  },
})
