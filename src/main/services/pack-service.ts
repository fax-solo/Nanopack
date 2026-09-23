import fs from 'fs'
import path from 'path'
import os from 'os'
import { writeNpk, runProcess, CancelError } from '../container/npk-writer'
import { getBinary, getFileType } from '../container/npk-writer'
import { requireTar } from '../utils/check-tar'

export interface EstimateResult {
  quickSize: number
  deepSize: number
  quickTime: number
  deepTime: number
  fileCount: number
  totalSize: number
}

const SAMPLE_MAX_FILES = 24
const SAMPLE_MAX_TOTAL_BYTES = 96 * 1024 * 1024
const SAMPLE_PREFIX_BYTES = 16 * 1024 * 1024
const SAVINGS_DERATE = 0.9

type ScanEntry = { f: string; size: number; type: ReturnType<typeof getFileType> }

function clampRatio(r: number): number {
  if (r > 1) return 1
  if (r < 0.001) return 0.001
  return r
}

// Async directory scan + stat pass. Fully async so the Electron main process
// never blocks — a synchronous walk of a huge tree would freeze the window.
async function scanEntries(
  dir: string,
  onProgress?: (stage: string, percent: number) => void,
  signal?: AbortSignal
): Promise<ScanEntry[]> {
  const out: ScanEntry[] = []
  const stack = [dir]
  while (stack.length > 0) {
    if (signal?.aborted) throw new CancelError()
    const current = stack.pop()!
    const entries = await fs.promises.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (signal?.aborted) throw new CancelError()
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        const st = await fs.promises.stat(fullPath)
        out.push({ f: fullPath, size: st.size, type: getFileType(fullPath) })
        if (out.length % 1000 === 0) {
          onProgress?.(`Scanning files… ${out.length} found`, Math.min(25, 5 + out.length / 600))
        }
      }
    }
  }
  out.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0))
  return out
}

interface CompressionEstimate {
  quickSize: number
  deepSize: number
  quickTime: number
  deepTime: number
  sampleSize: number
}

// Copy only the first `maxBytes` of a file. Large binaries are essentially
// incompressible regardless of how much of them we read, so a bounded prefix
// keeps estimation fast without skewing the measured ratio.
function copyPrefixSync(src: string, dst: string, maxBytes: number): number {
  const rfd = fs.openSync(src, 'r')
  const size = fs.fstatSync(rfd).size
  const bytes = Math.min(size, maxBytes)
  const buf = Buffer.allocUnsafe(bytes)
  fs.readSync(rfd, buf, 0, bytes, 0)
  fs.closeSync(rfd)
  fs.writeFileSync(dst, buf)
  return bytes
}

// Estimates by compressing a representative SUBSET with the exact toolchain the
// pack step will use (tar + zstd -3 for quick, mkdwarfs -l 6 for deep), then
// scaling the measured ratios up to the full data set.
//
// Photos/videos/raw are already-compressed formats, so they're counted as ~0%
// savings instead of wasting the sample budget on bytes that never shrink.
// Everything here is async (runProcess, no spawnSync) so the main process —
// and therefore the window — stays responsive throughout, and every step
// honors the abort signal so the user can cancel.
async function sampleCompression(
  entries: ScanEntry[],
  threads: number,
  onProgress?: (stage: string, percent: number) => void,
  signal?: AbortSignal
): Promise<CompressionEstimate> {
  const stats = entries.filter((s) => s.size > 0)

  if (stats.length === 0) {
    return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, sampleSize: 0 }
  }

  const totalSize = stats.reduce((sum, s) => sum + s.size, 0)
  const mediaBytes = stats.reduce((sum, s) => sum + (s.type !== 'file' ? s.size : 0), 0)
  const compressible = stats.filter((s) => s.type === 'file').sort((a, b) => a.size - b.size)
  const compressibleBytes = totalSize - mediaBytes

  // Per-file tar/DwarFS header + block-rounding overhead. Keeps archives full
  // of many tiny files from being underestimated.
  const overhead = stats.length * 512

  if (compressible.length === 0) {
    return {
      quickSize: Math.min(totalSize, mediaBytes + overhead),
      deepSize: Math.min(totalSize, mediaBytes + overhead),
      quickTime: 2,
      deepTime: 10,
      sampleSize: 0,
    }
  }

  // Evenly-spread picks across the size range, always including the largest —
  // a single huge incompressible file must not slip through.
  let picks: number[] = []
  const target = Math.min(SAMPLE_MAX_FILES, compressible.length)
  for (let k = 0; k < target; k++) picks.push(Math.round((k / target) * (compressible.length - 1)))
  picks.push(compressible.length - 1)
  picks = [...new Set(picks)].sort((a, b) => a - b)

  if (signal?.aborted) throw new CancelError()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-estimate-'))
  try {
    const sampleDir = path.join(tmpDir, 'sample')
    fs.mkdirSync(sampleDir)
    let sampleBytes = 0
    for (const idx of picks) {
      if (signal?.aborted) throw new CancelError()
      const s = compressible[idx]
      const bytes = Math.min(s.size, SAMPLE_PREFIX_BYTES)
      if (sampleBytes + bytes > SAMPLE_MAX_TOTAL_BYTES) continue
      copyPrefixSync(s.f, path.join(sampleDir, `f_${idx}`), bytes)
      sampleBytes += bytes
    }
    if (sampleBytes === 0) {
      const s = compressible[compressible.length - 1]
      sampleBytes = copyPrefixSync(s.f, path.join(sampleDir, 'f_big'), Math.min(s.size, SAMPLE_PREFIX_BYTES))
    }

    if (signal?.aborted) throw new CancelError()
    onProgress?.('Packing sample archive…', 40)
    const sampleTar = path.join(tmpDir, 'sample.tar')
    const tarMs0 = Date.now()
    const tarRes = await runProcess('tar', ['cf', sampleTar, '-C', sampleDir, '.'], signal)
    const tarMs = Date.now() - tarMs0
    if (tarRes.code !== 0) throw new Error(`tar sampling failed: ${tarRes.stderr.toString()}`)
    const sampleTarSize = fs.statSync(sampleTar).size
    const zstd = getBinary('zstd')

    // Quick: exactly what pack does — tar, then zstd -3.
    onProgress?.('Measuring quick compression…', 45)
    const qOut = path.join(tmpDir, 'q.zst')
    const tq = Date.now()
    const qRes = await runProcess(zstd, ['-3', '-f', `-T${threads || 0}`, '-o', qOut, sampleTar], signal)
    const quickMs = Date.now() - tq
    if (qRes.code !== 0) throw new Error(`zstd sampling failed: ${qRes.stderr.toString()}`)
    const qRatio = clampRatio(fs.statSync(qOut).size / sampleTarSize)
    onProgress?.('Measuring quick compression…', 55)

    // Deep: exactly what pack does — mkdwarfs -l 6. Falls back to a bounded
    // zstd -12 pass if the DwarFS toolchain is unavailable.
    onProgress?.('Measuring deep compression…', 60)
    let dRatio: number
    let deepMs: number
    const dwarfs = getBinary('mkdwarfs')
    try {
      const dOut = path.join(tmpDir, 'd.dwarfs')
      const args = ['-i', sampleDir, '-o', dOut, '-l', '6']
      if (threads > 0) args.push('-p', String(threads))
      const td = Date.now()
      const dRes = await runProcess(dwarfs, args, signal)
      deepMs = Date.now() - td
      if (dRes.code !== 0) throw new Error(`mkdwarfs sampling failed: ${dRes.stderr.toString()}`)
      dRatio = clampRatio(fs.statSync(dOut).size / sampleBytes)
    } catch (deepErr) {
      // A cancel is not a toolchain failure — don't fall back, propagate it.
      if (deepErr instanceof CancelError) throw deepErr
      const dOut = path.join(tmpDir, 'd.zst')
      const td = Date.now()
      const dRes = await runProcess(zstd, ['-12', '-f', `-T${threads || 0}`, '-o', dOut, sampleTar], signal)
      deepMs = Date.now() - td
      if (dRes.code !== 0) throw deepErr
      dRatio = clampRatio(fs.statSync(dOut).size / sampleTarSize)
    }
    onProgress?.('Measuring deep compression…', 85)

    // Never advertise more than SAVINGS_DERATE of the measured savings, so the
    // prediction errs conservative instead of optimistic.
    const qKeep = clampRatio(1 - (1 - qRatio) * SAVINGS_DERATE)
    const dKeep = clampRatio(1 - (1 - dRatio) * SAVINGS_DERATE)

    const quickSize = Math.min(totalSize, mediaBytes + compressibleBytes * qKeep + overhead)
    const deepSize = Math.min(quickSize, mediaBytes + compressibleBytes * dKeep + overhead)

    // Scale measured wall-time by how much of the tree we actually compressed.
    const scale = compressibleBytes / sampleBytes
    const quickTime = Math.max(3, ((tarMs + quickMs) / 1000) * scale)
    const deepTime = Math.max(10, (deepMs / 1000) * scale)

    return { quickSize, deepSize, quickTime, deepTime, sampleSize: sampleBytes }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
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
  maxThreads = 0,
  signal?: AbortSignal
): Promise<EstimateResult> {
  onProgress?.('Scanning folder…', 5)
  const entries = await scanEntries(inputPath, onProgress, signal)
  const fileCount = entries.length
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0)
  onProgress?.('Analyzing file sizes…', 30)

  try {
    const s = await sampleCompression(entries, maxThreads, onProgress, signal)
    if (totalSize === 0) {
      onProgress?.('Estimation complete', 100)
      return { quickSize: 0, deepSize: 0, quickTime: 0, deepTime: 0, fileCount, totalSize }
    }
    // Never report a bigger archive than the source.
    const quickSize = Math.min(totalSize, Math.round(s.quickSize))
    const deepSize = Math.min(quickSize, Math.round(s.deepSize))
    onProgress?.('Estimation complete', 100)
    return { quickSize, deepSize, quickTime: s.quickTime, deepTime: s.deepTime, fileCount, totalSize }
  } catch (err) {
    // A cancel must propagate — the UI turns the count back to an idle state.
    if (err instanceof CancelError) throw err
    // Fall back to a reasonable heuristic if the toolchain is unavailable.
    const quickSize = Math.round(totalSize * 0.7)
    const deepSize = Math.round(totalSize * 0.4)
    const quickTime = Math.max(30, Math.round(totalSize / (50 * 1024 * 1024)))
    const deepTime = Math.max(120, Math.round(totalSize / (10 * 1024 * 1024)))
    onProgress?.('Estimation complete', 100)
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
