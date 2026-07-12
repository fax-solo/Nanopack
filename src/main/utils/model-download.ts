import fs from 'fs'
import path from 'path'

const MODEL_URL = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth'
const MODEL_FILENAME = 'realesr-general-x4v3.pth'

export function getModelDir(): string {
  const base = process.resourcesPath || path.join(__dirname, '../../../vendor')
  return path.join(base, process.platform, 'models')
}

export function getModelPath(): string {
  return path.join(getModelDir(), MODEL_FILENAME)
}

export function modelExists(): boolean {
  return fs.existsSync(getModelPath())
}

export function getModelDownloadInfo(): { url: string; dest: string } {
  return {
    url: MODEL_URL,
    dest: getModelPath(),
  }
}
