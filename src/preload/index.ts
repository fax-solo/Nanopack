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

export interface User {
  id: number
  username: string
  display_name: string
  is_admin: number
  is_guest: number
  created_at: string
  last_login: string | null
}

export interface AuthResult {
  success: boolean
  user?: User
  token?: string
  error?: string
}

export interface DashboardStats {
  totalUsers: number
  activeUsersToday: number
  activeUsersThisWeek: number
  activeUsersThisMonth: number
  newUsersThisDay: number
  newUsersThisMonth: number
  totalUsesToday: number
  totalUsesThisMonth: number
  totalUsesThisYear: number
  totalUsesAllTime: number
  totalInputSize: number
  totalOutputSize: number
  usesByService: { service: string; count: number }[]
  recentActivity: { id: number; user_id: number; username: string; service: string; mode: string | null; created_at: string }[]
  usersByDay: { day: string; count: number }[]
  usesByDay: { day: string; count: number }[]
}

const api = {
  getMode: (): Promise<'quick' | 'deep'> => ipcRenderer.invoke('get-mode'),
  setMode: (mode: 'quick' | 'deep'): Promise<'quick' | 'deep'> => ipcRenderer.invoke('set-mode', mode),

  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  openNpkDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openNpk'),
  saveNpkDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:saveNpk'),

  // Auth
  register: (username: string, password: string, displayName?: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:register', username, password, displayName),
  login: (username: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', username, password),
  guestLogin: (): Promise<AuthResult> => ipcRenderer.invoke('auth:guest'),
  validateSession: (token: string): Promise<User | null> => ipcRenderer.invoke('auth:validate', token),
  logout: (token: string): Promise<void> => ipcRenderer.invoke('auth:logout', token),

  // Services
  pack: (inputPath: string, outputPath: string, mode: 'quick' | 'deep', userId?: number): Promise<NpkResult> =>
    ipcRenderer.invoke('pack', inputPath, outputPath, mode, userId),
  unpack: (npkPath: string, outputDir: string, userId?: number): Promise<NpkResult> =>
    ipcRenderer.invoke('unpack', npkPath, outputDir, userId),
  mount: (npkPath: string): Promise<string> => ipcRenderer.invoke('mount', npkPath),
  unmount: (mountPath: string): Promise<void> => ipcRenderer.invoke('unmount', mountPath),
  verify: (npkPath: string): Promise<NpkResult> => ipcRenderer.invoke('verify', npkPath),
  repack: (npkPath: string, sourceDir: string, outputPath: string, mode: 'quick' | 'deep', userId?: number): Promise<NpkResult> =>
    ipcRenderer.invoke('repack', npkPath, sourceDir, outputPath, mode, userId),
  estimate: (inputPath: string): Promise<EstimateResult> =>
    ipcRenderer.invoke('estimate', inputPath),
  upscale: (inputPath: string, outputPath: string, engine: string, preset: string, userId?: number): Promise<NpkResult> =>
    ipcRenderer.invoke('upscale', inputPath, outputPath, engine, preset, userId),
  detectGpu: (): Promise<GpuInfo | null> => ipcRenderer.invoke('detect-gpu'),

  // Dashboard
  getDashboardStats: (): Promise<DashboardStats> => ipcRenderer.invoke('dashboard:stats'),
  getUserStats: (userId: number): Promise<{ totalUses: number; totalInput: number; totalOutput: number; usesByService: { service: string; count: number }[] }> =>
    ipcRenderer.invoke('dashboard:userStats', userId),
  getAllUsers: (): Promise<User[]> => ipcRenderer.invoke('dashboard:allUsers'),

  onProgress: (callback: (data: ProgressData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ProgressData) => callback(data)
    ipcRenderer.on('progress', listener)
    return () => ipcRenderer.removeListener('progress', listener)
  },
}

contextBridge.exposeInMainWorld('nanopack', api)
export type NanoPackApi = typeof api
