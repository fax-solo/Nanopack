import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } from 'electron'
import fs from 'fs'

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nanopack.app')
}

let isQuitting = false
import path from 'path'
import { packFiles, estimatePack, unpackArchive, mountArchive, verifyArchive } from './services/pack-service'
import { repackArchive } from './services/repack-service'
import { upscaleVideo, detectGpu } from './services/upscale-service'
import { startDownload, cancelDownload, setProgressCallback, getDownloads } from './services/download-service'
import { modelExists, getModelDownloadInfo } from './utils/model-download'
import { initStore, get as storeGet, set as storeSet, getAll as storeGetAll } from './store'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function sendProgress(stage: string, percent: number, processed: number = 0, total: number = 0, currentFile?: string) {
  mainWindow?.webContents.send('progress', { stage, percent, processed, total, currentFile })
}

function createTray() {
  const iconSize = process.platform === 'win32' ? 32 : 22
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('icon is empty')
  } catch {
    icon = nativeImage.createEmpty()
  }
  tray = new Tray(icon.resize({ width: iconSize, height: iconSize }))
  tray.setToolTip('NanoPack')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NanoPack', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function createWindow() {
  const { width, height } = storeGet('windowBounds')

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    title: 'NanoPack',
    backgroundColor: '#12151A',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"],
      },
    })
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('resize', () => {
    const { width, height } = mainWindow!.getBounds()
    storeSet('windowBounds', { width, height })
  })
}

app.whenReady().then(() => {
  try {
    initStore()
    createWindow()
    createTray()

    setProgressCallback((task) => {
      mainWindow?.webContents.send('download-progress', task)
    })
  } catch (err) {
    console.error('Failed to initialize app:', err)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else mainWindow?.show()
})

// ── Settings ────────────────────────────────────────────────────────
ipcMain.handle('settings:getAll', () => storeGetAll())
ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
  storeSet(key as any, value)
})

// ── Mode ──────────────────────────────────────────────────────────
ipcMain.handle('get-mode', () => storeGet('mode'))
ipcMain.handle('set-mode', (_event, mode: 'quick' | 'deep') => {
  storeSet('mode', mode)
  return mode
})

// ── Dialogs ────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'] })
  return result.canceled ? null : result.filePaths[0]
})
ipcMain.handle('dialog:openNpk', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'], filters: [{ name: 'NanoPack Archive', extensions: ['npk'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})
ipcMain.handle('dialog:saveNpk', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'NanoPack Archive', extensions: ['npk'] }],
  })
  return result.canceled ? null : result.filePath
})
ipcMain.handle('dialog:saveFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters,
  })
  return result.canceled ? null : result.filePath
})
ipcMain.handle('reveal-path', async (_event, p: string) => {
  try {
    if (!p) return false
    if (!fs.existsSync(p)) return false
    shell.showItemInFolder(p)
    return true
  } catch { return false }
})
ipcMain.handle('open-path', async (_event, p: string) => {
  try {
    if (!p) return false
    if (!fs.existsSync(p)) return false
    await shell.openPath(p)
    return true
  } catch { return false }
})

// ── Services ───────────────────────────────────────────────────────
ipcMain.handle('pack', async (_event, inputPath: string, outputPath: string, mode: 'quick' | 'deep') => {
  try {
    const threads = storeGet('maxThreads')
    const result = await packFiles(inputPath, outputPath, mode, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    }, threads)
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('estimate', async (_event, inputPath: string) => {
  try { return await estimatePack(inputPath, (stage, percent) => { sendProgress(stage, percent) }, storeGet('maxThreads')) }
  catch { return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, fileCount: 0, totalSize: 0 } }
})

ipcMain.handle('unpack', async (_event, npkPath: string, outputDir: string) => {
  try {
    const result = await unpackArchive(npkPath, outputDir, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    })
    return { success: result.success, filesProcessed: result.filesProcessed, path: outputDir, errors: result.errors }
  } catch (e: any) {
    return { success: false, message: e.message, errors: [e.message] }
  }
})

ipcMain.handle('mount', async (_event, npkPath: string) => {
  try { return await mountArchive(npkPath) }
  catch (e: any) { throw new Error(e.message) }
})

ipcMain.handle('unmount', async (_event, mountPath: string) => {
  if (process.platform === 'win32') return
  const { spawnSync } = await import('child_process')
  try { spawnSync('fusermount', ['-u', mountPath], { stdio: 'pipe' }) } catch {}
})

ipcMain.handle('get-platform', () => process.platform)

ipcMain.handle('download:start', async (_event, id: string, name: string, url: string, dest: string) => {
  return startDownload(id, name, url, dest)
})

ipcMain.handle('download:cancel', async (_event, id: string) => {
  return cancelDownload(id)
})

ipcMain.handle('download:list', async () => {
  return getDownloads()
})

ipcMain.handle('ensure-model', async () => {
  if (modelExists()) return { needed: false }
  const { url, dest } = getModelDownloadInfo()
  const task = await startDownload('realesrgan-model', 'Real-ESRGAN model', url, dest)
  return { needed: true, task }
})

ipcMain.handle('verify', async (_event, npkPath: string) => {
  try { return await verifyArchive(npkPath, (stage, percent) => { sendProgress(stage, percent) }) }
  catch (e: any) { return { success: false, message: e.message } }
})

ipcMain.handle('repack', async (_event, npkPath: string, sourceDir: string, outputPath: string, mode: 'quick' | 'deep') => {
  try {
    const threads = storeGet('maxThreads')
    const result = await repackArchive(npkPath, sourceDir, outputPath, mode, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    }, threads)
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('upscale', async (_event, inputPath: string, outputPath: string, engine: string, preset: string) => {
  try {
    const result = await upscaleVideo(inputPath, outputPath, engine, preset, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    })
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('detect-gpu', async () => {
  try { return await detectGpu() }
  catch { return null }
})
