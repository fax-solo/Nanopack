import { contextBridge, ipcRenderer } from 'electron'

export interface NpkResult {
  success: boolean
  path?: string
  originalSize?: number
  finalSize?: number
  filesProcessed?: number
  errors?: string[]
  message?: string
}

export interface EstimateResult {
  quickSize: number
  deepSize: number
  quickTime: number
  deepTime: number
  fileCount: number
  totalSize: number
}

export interface ProgressData {
  stage: string
  percent: number
  processed: number
  total: number
  currentFile?: string
}

export interface GpuInfo {
  name: string
  vramGB: number
  vulkanSupported: boolean
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown'
}

export interface DownloadTask {
  id: string
  name: string
  url: string
  dest: string
  progress: number
  status: 'downloading' | 'completed' | 'cancelled' | 'error'
  error?: string
}

export interface AppSettings {
  mode: 'quick' | 'deep'
  windowBounds: { width: number; height: number }
  theme: 'dark' | 'light' | 'system'
  defaultOutputDir: string
  confirmBeforeRun: boolean
  maxThreads: number
}

const api = {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:getAll'),
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value),

  getMode: (): Promise<'quick' | 'deep'> => ipcRenderer.invoke('get-mode'),
  setMode: (mode: 'quick' | 'deep'): Promise<'quick' | 'deep'> => ipcRenderer.invoke('set-mode', mode),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('get-platform'),

  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  openNpkDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openNpk'),
  saveNpkDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:saveNpk'),
  saveVideoDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:saveFile', [
    { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'mov'] },
  ]),
  revealPath: (p: string): Promise<boolean> => ipcRenderer.invoke('reveal-path', p),
  openPath: (p: string): Promise<boolean> => ipcRenderer.invoke('open-path', p),

  // Services
  pack: (inputPath: string, outputPath: string, mode: 'quick' | 'deep'): Promise<NpkResult> =>
    ipcRenderer.invoke('pack', inputPath, outputPath, mode),
  unpack: (npkPath: string, outputDir: string): Promise<NpkResult> =>
    ipcRenderer.invoke('unpack', npkPath, outputDir),
  mount: (npkPath: string): Promise<string> => ipcRenderer.invoke('mount', npkPath),
  unmount: (mountPath: string): Promise<void> => ipcRenderer.invoke('unmount', mountPath),
  verify: (npkPath: string): Promise<NpkResult> => ipcRenderer.invoke('verify', npkPath),
  repack: (npkPath: string, sourceDir: string, outputPath: string, mode: 'quick' | 'deep'): Promise<NpkResult> =>
    ipcRenderer.invoke('repack', npkPath, sourceDir, outputPath, mode),
  estimate: (inputPath: string): Promise<EstimateResult> =>
    ipcRenderer.invoke('estimate', inputPath),
  upscale: (inputPath: string, outputPath: string, engine: string, preset: string): Promise<NpkResult> =>
    ipcRenderer.invoke('upscale', inputPath, outputPath, engine, preset),
  detectGpu: (): Promise<GpuInfo | null> => ipcRenderer.invoke('detect-gpu'),

  startDownload: (id: string, name: string, url: string, dest: string): Promise<DownloadTask> =>
    ipcRenderer.invoke('download:start', id, name, url, dest),
  cancelDownload: (id: string): Promise<boolean> => ipcRenderer.invoke('download:cancel', id),
  getDownloads: (): Promise<DownloadTask[]> => ipcRenderer.invoke('download:list'),

  ensureModel: (): Promise<{ needed: boolean; task?: DownloadTask }> => ipcRenderer.invoke('ensure-model'),

  onDownloadProgress: (callback: (task: DownloadTask) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: DownloadTask) => callback(task)
    ipcRenderer.on('download-progress', listener)
    return () => ipcRenderer.removeListener('download-progress', listener)
  },

  onProgress: (callback: (data: ProgressData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ProgressData) => callback(data)
    ipcRenderer.on('progress', listener)
    return () => ipcRenderer.removeListener('progress', listener)
  },
}

contextBridge.exposeInMainWorld('nanopack', api)
export type NanoPackApi = typeof api
