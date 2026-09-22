import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'
import fs from 'fs'

function devServerMarker(): Plugin {
  return {
    name: 'nanopack-dev-server-marker',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port ?? 5173}`
        const outDir = path.resolve(__dirname, 'dist/renderer')
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, '.vite-url'), url)
      })
    },
  }
}

export default defineConfig({
  plugins: [svelte(), devServerMarker()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
