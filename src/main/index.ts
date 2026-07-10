import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { packFiles, estimatePack, unpackArchive, mountArchive, verifyArchive } from './services/pack-service'
import { repackArchive } from './services/repack-service'
import { upscaleVideo, detectGpu } from './services/upscale-service'
import { initStore, get as storeGet, set as storeSet } from './store'
import { initDatabase } from './database/schema'
import { registerUser, loginUser, createGuestUser, validateSession, logoutSession, getAllUsers, getUserById } from './auth/auth-service'
import { logUsage, logEvent, getDashboardStats, getUserStats } from './auth/usage-service'

let mainWindow: BrowserWindow | null = null

function sendProgress(stage: string, percent: number, processed: number = 0, total: number = 0, currentFile?: string) {
  mainWindow?.webContents.send('progress', { stage, percent, processed, total, currentFile })
}

function createWindow() {
  const { width, height } = storeGet<{ width: number; height: number }>('windowBounds')

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
      sandbox: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.on('resize', () => {
    const { width, height } = mainWindow!.getBounds()
    storeSet('windowBounds', { width, height })
  })
}

app.whenReady().then(() => {
  initStore()
  initDatabase()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── Mode ──────────────────────────────────────────────────────────
ipcMain.handle('get-mode', () => {
  return storeGet('mode')
})

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
  return createGuestUser()
})

ipcMain.handle('auth:validate', (_event, token: string) => {
  return validateSession(token)
})

ipcMain.handle('auth:logout', (_event, token: string) => {
  logoutSession(token)
})

// ── Services ───────────────────────────────────────────────────────
ipcMain.handle('pack', async (_event, inputPath: string, outputPath: string, mode: 'quick' | 'deep', userId?: number) => {
  try {
    const start = Date.now()
    const result = await packFiles(inputPath, outputPath, mode, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent * 0.01), 100, file)
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
  try {
    return await estimatePack(inputPath, (stage, percent) => { sendProgress(stage, percent) })
  } catch (e: any) {
    return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, fileCount: 0, totalSize: 0 }
  }
})

ipcMain.handle('unpack', async (_event, npkPath: string, outputDir: string, userId?: number) => {
  try {
    const start = Date.now()
    const result = await unpackArchive(npkPath, outputDir, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent * 0.01), 100, file)
    })
    if (userId) {
      logUsage(userId, 'unpack', null, 0, 0, result.filesProcessed, Date.now() - start)
    }
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
      sendProgress(stage, percent, Math.round(percent * 0.01), 100, file)
    })
    if (userId && result.success) {
      logUsage(userId, 'repack', mode, result.originalSize, result.finalSize, result.filesProcessed, Date.now() - start)
    }
    return result
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('upscale', async (_event, inputPath: string, outputPath: string, engine: string, preset: string, userId?: number) => {
  try {
    const start = Date.now()
    const result = await upscaleVideo(inputPath, outputPath, engine, preset, (stage, percent, file) => {
      sendProgress(stage, percent, Math.round(percent * 0.01), 100, file)
    })
    if (userId) {
      logUsage(userId, 'upscale', engine, 0, 0, 1, Date.now() - start)
    }
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
ipcMain.handle('dashboard:stats', () => {
  return getDashboardStats()
})

ipcMain.handle('dashboard:userStats', (_event, userId: number) => {
  return getUserStats(userId)
})

ipcMain.handle('dashboard:allUsers', () => {
  return getAllUsers()
})
