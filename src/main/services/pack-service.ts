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

const SAMPLE_MAX_FILES = 60
const QUICK_LEVEL = 3
const DEEP_LEVEL = 19

function clampRatio(r: number): number {
  if (r > 1) return 1
  if (r < 0.001) return 0.001
  return r
}

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

interface CompressionEstimate {
  quickSize: number
  deepSize: number
  quickTime: number
  deepTime: number
  sampleSize: number
}

function sampleCompression(files: string[], threads: number): CompressionEstimate {
  // Per-file size-bucketed estimation. We compress a spread of files (small to
  // large) individually, then assign EVERY file the ratio of the sampled file
  // nearest to it in size. Files of similar size tend to share a content type
  // (small = text/config, large = game assets), so this tracks real output far
  // better than applying one global ratio from a path-sorted sample.
  const stats = files
    .map((f) => { const size = fs.statSync(f).size; return { f, size } })
    .filter((s) => s.size > 0)
  stats.sort((a, b) => a.size - b.size)

  if (stats.length === 0) {
    return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, sampleSize: 0 }
  }

  const target = Math.min(SAMPLE_MAX_FILES, stats.length)
  const pickSet = new Set<number>()
  for (let k = 0; k < target; k++) {
    pickSet.add(Math.round((k / target) * (stats.length - 1)))
  }
  pickSet.add(stats.length - 1)
  const picks = [...pickSet].sort((a, b) => a - b)

  const qRatio = new Map<number, number>()
  const dRatio = new Map<number, number>()
  let sampleSize = 0
  let quickMs = 0
  let deepMs = 0

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-estimate-'))
  try {
    const flatDir = path.join(tmpDir, 'flat')
    fs.mkdirSync(flatDir)
    for (const idx of picks) {
      const s = stats[idx]
      const copy = path.join(flatDir, `f_${idx}.bin`)
      fs.copyFileSync(s.f, copy)

      const rq = zstdCompress(copy, QUICK_LEVEL, threads, path.join(tmpDir, `q_${idx}.zst`))
      qRatio.set(idx, clampRatio(rq.bytes / s.size))
      quickMs += rq.ms

      const rd = zstdCompress(copy, DEEP_LEVEL, threads, path.join(tmpDir, `d_${idx}.zst`))
      dRatio.set(idx, clampRatio(rd.bytes / s.size))
      deepMs += rd.ms

      sampleSize += s.size
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  // tar format adds ~512 bytes of header/padding per file to the final archive.
  const tarOverhead = stats.length * 512

  let quickSize = tarOverhead
  let deepSize = tarOverhead
  for (let i = 0; i < stats.length; i++) {
    let bestIdx = picks[0]
    let bestDist = Infinity
    for (const p of picks) {
      const dist = Math.abs(stats[p].size - stats[i].size)
      if (dist < bestDist) { bestDist = dist; bestIdx = p }
    }
    quickSize += stats[i].size * qRatio.get(bestIdx)!
    deepSize += stats[i].size * dRatio.get(bestIdx)!
  }

  const scale = stats.length === picks.length || sampleSize === 0
    ? 1
    : stats.reduce((sum, s) => sum + s.size, 0) / sampleSize

  return {
    quickSize,
    deepSize,
    quickTime: Math.max(2, (quickMs / 1000) * scale),
    deepTime: Math.max(10, (deepMs / 1000) * scale),
    sampleSize,
  }
}

export async function packFiles(
  inputPath: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void,
  maxThreads = 0,
  signal?: AbortSignal
) {
  if (mode === 'quick') requireTar()
  return writeNpk(inputPath, outputPath, mode, onProgress, maxThreads, signal)
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
    // Never report a bigger archive than the source.
    const quickSize = Math.min(totalSize, Math.round(s.quickSize))
    const deepSize = Math.min(quickSize, Math.round(s.deepSize))
    onProgress?.('Estimation complete', 100)
    return { quickSize, deepSize, quickTime: s.quickTime, deepTime: s.deepTime, fileCount, totalSize }
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
  onProgress?: (stage: string, percent: number, file?: string) => void,
  signal?: AbortSignal
) {
  const { extractNpk, readNpkManifest } = await import('../container/npk-reader')
  const manifest = readNpkManifest(npkPath)
  if (manifest.mode === 'quick') requireTar()
  return extractNpk(npkPath, outputDir, onProgress, signal)
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
