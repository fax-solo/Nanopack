import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export interface UpdateState {
  state: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
  version?: string
  downloadedVersion?: string
  progress?: number
  message?: string
}

let currentState: UpdateState = { state: 'idle' }

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] || null
}

function emit(state: UpdateState) {
  currentState = state
  getMainWindow()?.webContents.send('update-status', state)
}

function initUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.setFeedURL({ provider: 'github', owner: 'fax-solo', repo: 'Nanopack' })

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) => emit({ state: 'up-to-date', version: info.version }))
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', progress: Math.round(progress.percent), downloadedVersion: currentState.version })
  )
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', downloadedVersion: info.version }))
  autoUpdater.on('error', (err) => emit({ state: 'error', message: err?.message || String(err) }))
}

export function checkForUpdates(): UpdateState {
  if (!app.isPackaged) {
    emit({ state: 'up-to-date', message: 'Updates are only checked in packaged builds.' })
    return currentState
  }
  initUpdater()
  autoUpdater.checkForUpdates().catch((err) => emit({ state: 'error', message: err?.message || String(err) }))
  return currentState
}

export function downloadUpdate(): UpdateState {
  autoUpdater.downloadUpdate().catch((err) => emit({ state: 'error', message: err?.message || String(err) }))
  return currentState
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true)
}

export function getUpdateState(): UpdateState {
  return currentState
}

export function silentCheckForUpdates(): void {
  if (!app.isPackaged) return
  try {
    initUpdater()
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 5000)
  } catch {}
}