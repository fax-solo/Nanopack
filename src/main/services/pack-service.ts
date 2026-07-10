import fs from 'fs'
import path from 'path'
import { writeNpk } from '../container/npk-writer'

export interface EstimateResult {
  quickSize: number
  deepSize: number
  quickTime: number
  deepTime: number
  fileCount: number
  totalSize: number
}

export async function packFiles(
  inputPath: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void
) {
  return writeNpk(inputPath, outputPath, mode, onProgress)
}

export async function estimatePack(
  inputPath: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
): Promise<EstimateResult> {
  const files: string[] = []
  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walkDir(fullPath)
      else files.push(fullPath)
    }
  }
  walkDir(inputPath)
  files.sort()

  const totalSize = files.reduce((sum, f) => sum + fs.statSync(f).size, 0)
  const fileCount = files.length

  function sampleFiles(count: number): string[] {
    if (files.length <= count) return files
    const sampled: string[] = []
    const step = files.length / count
    for (let i = 0; i < count; i++) {
      sampled.push(files[Math.floor(i * step)])
    }
    return sampled
  }

  const sample = sampleFiles(Math.min(files.length, 50))
  const sampleSize = sample.reduce((sum, f) => sum + fs.statSync(f).size, 0)

  const quickRatio = 0.65 + Math.random() * 0.15
  const deepRatio = 0.35 + Math.random() * 0.15

  const totalRatioQuick = sampleSize > 0 ? sample.reduce((sum, f) => {
    const ext = f.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'mp4', 'mkv', 'avi', 'zip', 'gz'].includes(ext || '')) {
      return sum + 1.0
    }
    return sum + 0.5
  }, 0) / sample.length : 0.7

  const totalRatioDeep = sampleSize > 0 ? sample.reduce((sum, f) => {
    const ext = f.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'mp4', 'mkv', 'avi', 'zip', 'gz'].includes(ext || '')) {
      return sum + 0.9
    }
    return sum + 0.25
  }, 0) / sample.length : 0.5

  const adjustedQuickRatio = 0.3 + (1 - totalRatioQuick) * 0.8
  const adjustedDeepRatio = 0.1 + (1 - totalRatioDeep) * 0.9

  const quickSize = Math.round(totalSize * adjustedQuickRatio)
  const deepSize = Math.round(totalSize * adjustedDeepRatio)

  const quickTime = Math.round(Math.max(30, totalSize / (50 * 1024 * 1024)))
  const deepTime = Math.round(Math.max(120, totalSize / (10 * 1024 * 1024)))

  onProgress?.('Estimation complete', 100)

  return {
    quickSize,
    deepSize,
    quickTime,
    deepTime,
    fileCount,
    totalSize,
  }
}

export async function unpackArchive(
  npkPath: string,
  outputDir: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
) {
  const { extractNpk } = await import('../container/npk-reader')
  return extractNpk(npkPath, outputDir, onProgress)
}

export async function mountArchive(
  npkPath: string
): Promise<string> {
  const { readNpkHeader } = await import('../container/npk-reader')
  const header = readNpkHeader(npkPath)

  if (header.mode !== 1) {
    throw new Error('Instant Mount is only supported for Deep mode archives')
  }

  const { getBinary } = await import('../container/npk-writer')
  const dwarfs = getBinary('dwarfs')
  const mountPoint = `/tmp/nanopack-mount-${path.basename(npkPath).replace(/\.npk$/, '')}`
  fs.mkdirSync(mountPoint, { recursive: true })

  const { execSync } = await import('child_process')
  execSync(`"${dwarfs}" "${npkPath}" "${mountPoint}" -o allow_other=false,ro`, { stdio: 'pipe', timeout: 10000 })

  return mountPoint
}

export async function verifyArchive(
  npkPath: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
) {
  const { verifyNpk } = await import('../container/npk-reader')
  return verifyNpk(npkPath, onProgress)
}
