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
let initialized = false
let checkInFlight = false

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] || null
}

function emit(state: UpdateState) {
  currentState = state
  getMainWindow()?.webContents.send('update-status', state)
}

function fail(err: unknown) {
  checkInFlight = false
  emit({ state: 'error', message: (err as Error)?.message || String(err) })
}

function ensureInit() {
  if (initialized) return
  initialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  // Use the explicit feed URL even in dev so Check always works
  // (not just when packaged with an embedded app-update.yml).
  autoUpdater.forceDevUpdateConfig = true
  autoUpdater.setFeedURL({ provider: 'github', owner: 'fax-solo', repo: 'Nanopack' })

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => { checkInFlight = false; emit({ state: 'available', version: info.version }) })
  autoUpdater.on('update-not-available', (info) => { checkInFlight = false; emit({ state: 'up-to-date', version: info.version }) })
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', progress: Math.round(progress.percent), downloadedVersion: currentState.version })
  )
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', downloadedVersion: info.version }))
  autoUpdater.on('error', fail)
}

export function checkForUpdates(): UpdateState {
  try {
    ensureInit()
  } catch (err) {
    fail(err)
    return currentState
  }
  if (checkInFlight) {
    // An automatic or earlier check is already running; drive the UI from it.
    emit({ state: 'checking' })
    return currentState
  }
  checkInFlight = true
  emit({ state: 'checking' })
  autoUpdater
    .checkForUpdates()
    .then(() => { checkInFlight = false })
    .catch(fail)
  return currentState
}

export function downloadUpdate(): UpdateState {
  try {
    ensureInit()
  } catch (err) {
    fail(err)
    return currentState
  }
  autoUpdater.downloadUpdate().catch(fail)
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
  setTimeout(() => {
    try {
      ensureInit()
      if (checkInFlight) return
      checkInFlight = true
      autoUpdater.checkForUpdates().then(() => { checkInFlight = false }).catch(() => { checkInFlight = false })
    } catch {}
  }, 5000)
}