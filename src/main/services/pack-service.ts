import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'
import { writeNpk } from '../container/npk-writer'
import { getBinary } from '../container/npk-writer'
import { requireTar } from '../utils/check-tar'

export interface EstimateResult {
  quickSize: number
  deepSize: number
  quickTime: number
  deepTime: number
  fileCount: number
  totalSize: number
}

const SAMPLE_BUDGET = 16 * 1024 * 1024
const SAMPLE_MAX_FILES = 40
const QUICK_LEVEL = 3
const DEEP_LEVEL = 19

function walkDirFiles(dir: string): string[] {
  const files: string[] = []
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else files.push(fullPath)
    }
  }
  walk(dir)
  files.sort()
  return files
}

function zstdCompress(dataPath: string, level: number, threads: number, outPath: string): { ms: number; bytes: number } {
  const zstd = getBinary('zstd')
  const args = ['-f', `-${level}`, `-T${threads || 0}`, '-o', outPath, dataPath]
  const t0 = Date.now()
  const r = spawnSync(zstd, args, {
    stdio: 'pipe',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 300_000,
  })
  const ms = Date.now() - t0
  if (r.status !== 0) throw new Error(`zstd sampling failed: ${r.stderr?.toString()}`)
  const bytes = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0
  fs.rmSync(outPath, { force: true })
  return { ms, bytes }
}

function sampleCompression(files: string[], threads: number): { quickRatio: number; deepRatio: number; quickMs: number; deepMs: number; sampleSize: number } {
  const sampled: { rel: string; src: string; size: number }[] = []
  let budget = SAMPLE_BUDGET
  for (const f of files) {
    const size = fs.statSync(f).size
    if (size <= 0) continue
    if (sampled.length >= SAMPLE_MAX_FILES) break
    sampled.push({ rel: path.basename(f) + '_' + sampled.length, src: f, size })
    budget -= size
    if (budget <= 0) break
  }
  const sampleSize = sampled.reduce((s, x) => s + x.size, 0)

  if (sampled.length === 0 || sampleSize === 0) {
    return { quickRatio: 0.7, deepRatio: 0.5, quickMs: 100, deepMs: 200, sampleSize: 0 }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-estimate-'))
  try {
    // Flat copy of sampled content — tar preserves identical-file dedup which is a bonus, not a flaw.
    const flatDir = path.join(tmpDir, 'flat')
    fs.mkdirSync(flatDir)
    for (const s of sampled) {
      fs.copyFileSync(s.src, path.join(flatDir, s.rel))
    }
    const tarPath = path.join(tmpDir, 'sample.tar')
    const tar = spawnSync('tar', ['cf', tarPath, '-C', flatDir, '.'], { stdio: 'pipe', timeout: 60_000 })
    if (tar.status !== 0) throw new Error(`tar sampling failed: ${tar.stderr?.toString()}`)

    const quick = zstdCompress(tarPath, QUICK_LEVEL, threads, path.join(tmpDir, 'q.zst'))
    const deep = zstdCompress(tarPath, DEEP_LEVEL, threads, path.join(tmpDir, 'd.zst'))

    return {
      quickRatio: quick.bytes / fs.statSync(tarPath).size,
      deepRatio: deep.bytes / fs.statSync(tarPath).size,
      quickMs: quick.ms,
      deepMs: deep.ms,
      sampleSize,
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function packFiles(
  inputPath: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void,
  maxThreads = 0
) {
  if (mode === 'quick') requireTar()
  return writeNpk(inputPath, outputPath, mode, onProgress, maxThreads)
}

export async function estimatePack(
  inputPath: string,
  onProgress?: (stage: string, percent: number, file?: string) => void,
  maxThreads = 0
): Promise<EstimateResult> {
  const files = walkDirFiles(inputPath)
  const totalSize = files.reduce((sum, f) => sum + fs.statSync(f).size, 0)
  const fileCount = files.length

  onProgress?.('Sampling files...', 10)

  try {
    const s = sampleCompression(files, maxThreads)
    if (s.sampleSize === 0 || totalSize === 0) {
      return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, fileCount, totalSize }
    }
    const scale = totalSize / s.sampleSize
    const quickSize = Math.round(totalSize * s.quickRatio)
    const deepSize = Math.round(totalSize * s.deepRatio)
    const quickTime = Math.max(2, Math.round((s.quickMs / 1000) * scale))
    const deepTime = Math.max(10, Math.round((s.deepMs / 1000) * scale))
    onProgress?.('Estimation complete', 100)
    return { quickSize, deepSize, quickTime, deepTime, fileCount, totalSize }
  } catch {
    // Fall back to a reasonable heuristic if the toolchain is unavailable.
    const quickSize = Math.round(totalSize * 0.7)
    const deepSize = Math.round(totalSize * 0.4)
    const quickTime = Math.max(30, Math.round(totalSize / (50 * 1024 * 1024)))
    const deepTime = Math.max(120, Math.round(totalSize / (10 * 1024 * 1024)))
    return { quickSize, deepSize, quickTime, deepTime, fileCount, totalSize }
  }
}

export async function unpackArchive(
  npkPath: string,
  outputDir: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
) {
  const { extractNpk, readNpkManifest } = await import('../container/npk-reader')
  const manifest = readNpkManifest(npkPath)
  if (manifest.mode === 'quick') requireTar()
  return extractNpk(npkPath, outputDir, onProgress)
}

export async function mountArchive(
  npkPath: string
): Promise<string> {
  if (process.platform === 'win32') {
    throw new Error('Instant Mount is not available on Windows. Use Unpack instead.')
  }

  const { readNpkHeader } = await import('../container/npk-reader')
  const header = readNpkHeader(npkPath)

  if (header.mode !== 1) {
    throw new Error('Instant Mount is only supported for Deep mode archives')
  }

  const { getBinary } = await import('../container/npk-writer')
  const dwarfs = getBinary('dwarfs')
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'nanopack-mount-'))

  const { spawnSync } = await import('child_process')
  const dwarfsResult = spawnSync(dwarfs, [npkPath, mountPoint, '-o', 'allow_other=false,ro'], { stdio: 'pipe', timeout: 10000 })
  if (dwarfsResult.status !== 0) throw new Error(`dwarfs mount failed: ${dwarfsResult.stderr.toString()}`)

  return mountPoint
}

export async function verifyArchive(
  npkPath: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
) {
  const { verifyNpk } = await import('../container/npk-reader')
  return verifyNpk(npkPath, onProgress)
}
