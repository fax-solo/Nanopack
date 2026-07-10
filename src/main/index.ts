import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'

let isQuitting = false
import path from 'path'
import { packFiles, estimatePack, unpackArchive, mountArchive, verifyArchive } from './services/pack-service'
import { repackArchive } from './services/repack-service'
import { upscaleVideo, detectGpu } from './services/upscale-service'
import { initStore, get as storeGet, set as storeSet, getAll as storeGetAll } from './store'
import { initDatabase } from './database/schema'
import { registerUser, loginUser, createGuestUser, validateSession, logoutSession, getAllUsers, getUserById } from './auth/auth-service'
import { logUsage, logEvent, getDashboardStats, getUserStats } from './auth/usage-service'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function sendProgress(stage: string, percent: number, processed: number = 0, total: number = 0, currentFile?: string) {
  mainWindow?.webContents.send('progress', { stage, percent, processed, total, currentFile })
}

function createTray() {
  const iconSize = process.platform === 'win32' ? 32 : 22
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../resources/icon.png'))
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
  initStore()
  initDatabase()
  createWindow()
  createTray()
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

// ── Auth ───────────────────────────────────────────────────────────
ipcMain.handle('auth:register', (_event, username: string, password: string, displayName?: string) => {
  return registerUser(username, password, displayName)
})
ipcMain.handle('auth:login', (_event, username: string, password: string) => {
  return loginUser(username, password)
})
ipcMain.handle('auth:guest', () => {
  try { return createGuestUser() }
  catch (e: any) { return { success: false, error: e.message } }
})
ipcMain.handle('auth:validate', (_event, token: string) => validateSession(token))
ipcMain.handle('auth:logout', (_event, token: string) => logoutSession(token))

// ── Services ───────────────────────────────────────────────────────
ipcMain.handle('pack', async (_event, inputPath: string, outputPath: string, mode: 'quick' | 'deep', userId?: number) => {
  try {
    const start = Date.now()
    const result = await packFiles(inputPath, outputPath, mode, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    })
    if (userId && result.success) {
      logUsage(userId, 'pack', mode, result.originalSize, result.finalSize, result.filesProcessed, Date.now() - start)
    }
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('estimate', async (_event, inputPath: string) => {
  try { return await estimatePack(inputPath, (stage, percent) => { sendProgress(stage, percent) }) }
  catch { return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, fileCount: 0, totalSize: 0 } }
})

ipcMain.handle('unpack', async (_event, npkPath: string, outputDir: string, userId?: number) => {
  try {
    const start = Date.now()
    const result = await unpackArchive(npkPath, outputDir, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    })
    if (userId) logUsage(userId, 'unpack', null, 0, 0, result.filesProcessed, Date.now() - start)
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
  const { execSync } = await import('child_process')
  try { execSync(`fusermount -u "${mountPath}" 2>/dev/null || true`) } catch {}
})

ipcMain.handle('verify', async (_event, npkPath: string) => {
  try { return await verifyArchive(npkPath, (stage, percent) => { sendProgress(stage, percent) }) }
  catch (e: any) { return { success: false, message: e.message } }
})

ipcMain.handle('repack', async (_event, npkPath: string, sourceDir: string, outputPath: string, mode: 'quick' | 'deep', userId?: number) => {
  try {
    const start = Date.now()
    const result = await repackArchive(npkPath, sourceDir, outputPath, mode, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    })
    if (userId && result.success) logUsage(userId, 'repack', mode, result.originalSize, result.finalSize, result.filesProcessed, Date.now() - start)
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('upscale', async (_event, inputPath: string, outputPath: string, engine: string, preset: string, userId?: number) => {
  try {
    const start = Date.now()
    const result = await upscaleVideo(inputPath, outputPath, engine, preset, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent), 100, file)
    })
    if (userId) logUsage(userId, 'upscale', engine, 0, 0, 1, Date.now() - start)
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('detect-gpu', async () => {
  try { return await detectGpu() }
  catch { return null }
})

// ── Dashboard ──────────────────────────────────────────────────────
ipcMain.handle('dashboard:stats', () => getDashboardStats())
ipcMain.handle('dashboard:userStats', (_event, userId: number) => getUserStats(userId))
ipcMain.handle('dashboard:allUsers', () => getAllUsers())
