// codegraph: tooling
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // The window's main process, and the codegraph MCP, which runs on its
    // own under node: `node out/main/mcp.js`.
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'src/main/index.ts'),
          mcp: resolve(__dirname, 'src/mcp/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve(__dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/ui'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/ui/index.html') } },
  },
})
