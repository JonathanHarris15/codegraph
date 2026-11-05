// codegraph: tooling
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Real git in real folders, and a real window for the UI test: slower
    // than the default patience allows, especially on a cold disk.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
