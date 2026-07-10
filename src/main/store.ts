import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface StoreData {
  mode: 'quick' | 'deep'
  windowBounds: { width: number; height: number }
}

const DEFAULTS: StoreData = {
  mode: 'quick',
  windowBounds: { width: 1200, height: 800 },
}

function getPath(): string {
  const userDataPath = app?.getPath?.('userData') || path.join(process.cwd(), '.nanopack-data')
  return path.join(userDataPath, 'config.json')
}

function read(): StoreData {
  try {
    const raw = fs.readFileSync(getPath(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(data: StoreData): void {
  const filePath = getPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

const cache: StoreData = { ...DEFAULTS }

export function initStore() {
  const data = read()
  Object.assign(cache, data)
}

export function get<T = unknown>(key: string): T {
  return (cache as any)[key] as T
}

export function set(key: string, value: unknown): void {
  ;(cache as any)[key] = value
  write(cache)
}
