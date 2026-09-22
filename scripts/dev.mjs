import { spawn, execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = (name) => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)
const markerFile = path.join(root, 'dist', 'renderer', '.vite-url')

function runSync(name, args) {
  execFileSync(bin(name), args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
}

try { fs.rmSync(markerFile, { force: true }) } catch {}

runSync('tsc', ['-p', 'tsconfig.main.json'])
runSync('tsc', ['-p', 'tsconfig.preload.json'])

const vite = spawn(bin('vite'), [], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

let electron = null
let cleaned = false

function cleanup(code) {
  if (cleaned) return
  cleaned = true
  try { fs.rmSync(markerFile, { force: true }) } catch {}
  if (electron && electron.exitCode === null) electron.kill()
  if (vite.exitCode === null) vite.kill()
  process.exitCode = code
}

const timeout = setTimeout(() => {
  if (!electron) {
    console.error('dev: timed out waiting for Vite dev server to start')
    cleanup(1)
  }
}, 30000)

function waitForDevServer(attempt = 0) {
  if (electron) return
  let url = ''
  try { url = fs.readFileSync(markerFile, 'utf8').trim() } catch {}
  if (/^https?:\/\//.test(url)) {
    clearTimeout(timeout)
    const electronBin = path.join(root, 'node_modules', 'electron', 'dist',
      process.platform === 'win32' ? 'electron.exe' : 'electron')
    electron = spawn(electronBin, ['.'], { cwd: root, stdio: 'inherit' })
    electron.on('exit', (code) => { cleanup(code ?? 0) })
    return
  }
  if (attempt > 150) {
    console.error('dev: Vite dev server did not publish a URL')
    cleanup(1)
    return
  }
  setTimeout(() => waitForDevServer(attempt + 1), 200)
}

vite.on('exit', (code) => {
  clearTimeout(timeout)
  cleanup(code ?? 0)
})
vite.on('error', (err) => {
  console.error('dev: failed to start Vite:', err.message)
  cleanup(1)
})

waitForDevServer()

process.on('SIGINT', () => cleanup(130))
process.on('SIGTERM', () => cleanup(143))
