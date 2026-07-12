import fs from 'fs'
import path from 'path'

export interface DownloadTask {
  id: string
  name: string
  url: string
  dest: string
  progress: number
  status: 'downloading' | 'completed' | 'cancelled' | 'error'
  error?: string
}

type ProgressCallback = (task: DownloadTask) => void

const tasks = new Map<string, { task: DownloadTask; controller: AbortController }>()
let onProgress: ProgressCallback | null = null

export function setProgressCallback(cb: ProgressCallback) {
  onProgress = cb
}

function notify(task: DownloadTask) {
  onProgress?.({ ...task })
}

export function getDownloads(): DownloadTask[] {
  return Array.from(tasks.values()).map(e => ({ ...e.task }))
}

export async function startDownload(
  id: string,
  name: string,
  url: string,
  dest: string
): Promise<DownloadTask> {
  const controller = new AbortController()
  const task: DownloadTask = { id, name, url, dest, progress: 0, status: 'downloading' }
  tasks.set(id, { task, controller })
  notify(task)

  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })

    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0
    const reader = response.body!.getReader()
    const writer = fs.createWriteStream(dest)
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      writer.write(Buffer.from(value))
      received += value.length
      if (total) {
        task.progress = Math.round((received / total) * 100)
      } else {
        task.progress = 0
      }
      notify(task)
    }

    writer.end()
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    task.status = 'completed'
    task.progress = 100
    notify(task)
  } catch (e: any) {
    if (e.name === 'AbortError') {
      task.status = 'cancelled'
      try { fs.rmSync(dest, { force: true }) } catch {}
    } else {
      task.status = 'error'
      task.error = e.message
      try { fs.rmSync(dest, { force: true }) } catch {}
    }
    notify(task)
  }

  return { ...task }
}

export function cancelDownload(id: string): boolean {
  const entry = tasks.get(id)
  if (!entry || entry.task.status !== 'downloading') return false
  entry.controller.abort()
  return true
}
