import fs from 'fs'
import path from 'path'
import os from 'os'
import { runProcess, CancelError, getBinary } from '../container/npk-writer'
import { writeNpk } from '../container/npk-writer'
import { requireTar } from '../utils/check-tar'

export type SlimPresetId = 'speed' | 'balance' | 'max'

export interface SlimResult {
  success: boolean
  cancelled?: boolean
  message?: string
  path?: string
  originalSize: number
  finalSize: number
  filesProcessed: number
  audioReencoded: number
  videoReencoded: number
  mediaBefore: number
  mediaAfter: number
  encodedKeepFailed: number
}

export interface SlimToolchainStatus {
  available: boolean
  source: 'bundled' | 'system' | 'missing'
  version?: string
  which?: string
}

interface Preset {
  audioBitrate: string
  videoCrf: string
  videoPreset: string
}

const PRESETS: Record<SlimPresetId, Preset> = {
  speed: { audioBitrate: '96k', videoCrf: '30', videoPreset: 'veryfast' },
  balance: { audioBitrate: '128k', videoCrf: '28', videoPreset: 'medium' },
  max: { audioBitrate: '80k', videoCrf: '32', videoPreset: 'slow' },
}

const AUDIO_EXTS = new Set(['.wav', '.aiff', '.aif', '.flac', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.wma', '.opus', '.ac3', '.dts'])
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.mts', '.mpg', '.mpeg', '.vob', '.bik', '.ogv'])

// Media needs to actually shrink before we swap it in — a re-encode that isn't
// at least 2% smaller is discarded and the original is kept, so we never pay
// quality for nothing.
const MIN_GAIN = 0.98

function mediaKind(rel: string): 'audio' | 'video' | null {
  const ext = path.extname(rel).toLowerCase()
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return null
}

// Resolution order: NP_SLIM_FFMPEG env (tests) → bundled vendor → system PATH.
// Every candidate is executed (`ffmpeg -version`) so a present-but-broken binary
// — e.g. a dynamically-linked ffmpeg with missing shared libs — is skipped in
// favor of the next working one instead of failing at encode time.
async function resolveFfmpeg(): Promise<{ bin: string; source: 'bundled' | 'system' } | null> {
  const candidates: { bin: string; source: 'bundled' | 'system' }[] = []
  const envBin = process.env.NP_SLIM_FFMPEG
  if (envBin) candidates.push({ bin: envBin, source: 'system' })
  candidates.push({ bin: getBinary('ffmpeg'), source: 'bundled' })
  const exe = 'ffmpeg' + (process.platform === 'win32' ? '.exe' : '')
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    const full = path.join(dir, exe)
    try { if (fs.existsSync(full)) candidates.push({ bin: full, source: 'system' }) } catch {}
  }
  for (const c of candidates) {
    try {
      const r = await runProcess(c.bin, ['-version'])
      if (r.code === 0) return c
    } catch {}
  }
  return null
}

export async function checkSlimToolchain(): Promise<SlimToolchainStatus> {
  const found = await resolveFfmpeg()
  if (!found) return { available: false, source: 'missing' }
  let version: string | undefined
  try {
    const r = await runProcess(found.bin, ['-version'])
    if (r.code === 0) version = r.stdout.toString('utf8').split('\n')[0].slice(0, 80) || undefined
  } catch {}
  return { available: true, source: found.source, version, which: found.bin }
}

// Async walk returning relative file paths, yielding to the event loop so the
// main process never blocks (same rationale as the estimate scan).
async function scanFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const stack = ['']
  while (stack.length > 0) {
    const rel = stack.pop()!
    const abs = rel ? path.join(dir, rel) : dir
    const entries = await fs.promises.readdir(abs, { withFileTypes: true })
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const childAbs = path.join(abs, entry.name)
      if (entry.isDirectory()) stack.push(childRel)
      else if (entry.isFile()) out.push(childRel)
    }
  }
  out.sort()
  return out
}

async function statSize(abs: string): Promise<number> {
  try { return (await fs.promises.stat(abs)).size } catch { return 0 }
}

// Hardlink into the workspace when the source shares the workspace filesystem
// (instant, zero space); fall back to a non-blocking copy otherwise.
async function linkOrCopy(src: string, dst: string): Promise<void> {
  try {
    fs.linkSync(src, dst)
    return
  } catch {}
  await fs.promises.copyFile(src, dst)
}

async function encodeAudio(ffmpeg: string, src: string, out: string, preset: Preset, threads: number, signal?: AbortSignal) {
  const args = ['-y', '-v', 'error', '-i', src, '-vn', '-c:a', 'libopus', '-b:a', preset.audioBitrate, '-vbr', 'on']
  if (threads > 0) args.push('-threads', String(threads))
  args.push('-f', 'ogg', out)
  return runProcess(ffmpeg, args, signal)
}

async function encodeVideo(ffmpeg: string, src: string, out: string, preset: Preset, threads: number, signal?: AbortSignal) {
  const args = [
    '-y', '-v', 'error', '-i', src,
    '-map', '0:v?', '-map', '0:a?',
    '-c:v', 'libx265', '-crf', preset.videoCrf, '-preset', preset.videoPreset,
    '-c:a', 'libopus', '-b:a', '96k',
  ]
  if (threads > 0) args.push('-threads', String(threads))
  args.push('-f', 'matroska', out)
  return runProcess(ffmpeg, args, signal)
}

// FitGirl-style media repack: lossily re-encode audio → Opus and video → HEVC,
// only ever replacing a file when the re-encode is meaningfully smaller, then
// pack the result with the normal NanoPack toolchain. Async throughout so the
// window stays responsive and Cancel aborts the running encoder.
export async function slimPack(
  sourceDir: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  presetId: SlimPresetId = 'balance',
  onProgress?: (stage: string, percent: number, file?: string) => void,
  maxThreads = 0,
  signal?: AbortSignal
): Promise<SlimResult> {
  const preset = PRESETS[presetId] || PRESETS.balance
  const ffmpeg = await resolveFfmpeg()
  if (!ffmpeg) {
    return {
      success: false,
      message: 'ffmpeg was not found. Install it with `npm run install-vendor` (bundles a static build), or make it available on PATH.',
      originalSize: 0, finalSize: 0, filesProcessed: 0,
      audioReencoded: 0, videoReencoded: 0, mediaBefore: 0, mediaAfter: 0, encodedKeepFailed: 0,
    }
  }
  if (mode === 'quick') requireTar()

  if (signal?.aborted) throw new CancelError()
  onProgress?.('Scanning files…', 2)
  const files = await scanFiles(sourceDir)
  if (files.length === 0) {
    return {
      success: false,
      message: 'The selected folder is empty.',
      originalSize: 0, finalSize: 0, filesProcessed: 0,
      audioReencoded: 0, videoReencoded: 0, mediaBefore: 0, mediaAfter: 0, encodedKeepFailed: 0,
    }
  }

  const sizes: Record<string, number> = {}
  for (const rel of files) sizes[rel] = await statSize(path.join(sourceDir, rel))
  const originalSize = Object.values(sizes).reduce((a, b) => a + b, 0)

  const mediaFiles = files.map((rel) => ({ rel, kind: mediaKind(rel) })).filter((f) => f.kind !== null)
  const audioToEncode = mediaFiles.filter((f) => f.kind === 'audio')
  const videoToEncode = mediaFiles.filter((f) => f.kind === 'video')
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-slim-'))

  const result: SlimResult = {
    success: false,
    originalSize,
    finalSize: 0,
    filesProcessed: files.length,
    audioReencoded: 0,
    videoReencoded: 0,
    mediaBefore: Object.keys(sizes).reduce((sum, rel) => sum + (mediaKind(rel) ? sizes[rel] : 0), 0),
    mediaAfter: Object.keys(sizes).reduce((sum, rel) => sum + (mediaKind(rel) ? sizes[rel] : 0), 0),
    encodedKeepFailed: 0,
  }

  try {
    // Stage 1: populate the workspace. Media gets re-encoded; everything else
    // is hardlinked/copied as-is.
    const nonMedia = files.filter((rel) => !mediaKind(rel))
    for (let i = 0; i < nonMedia.length; i++) {
      if (signal?.aborted) throw new CancelError()
      const rel = nonMedia[i]
      const dst = path.join(workspace, rel)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      await linkOrCopy(path.join(sourceDir, rel), dst)
      if ((i + 1) % 200 === 0 || i === nonMedia.length - 1) {
        onProgress?.('Preparing files…', 3 + (i + 1) / Math.max(1, nonMedia.length) * 8, rel)
      }
    }

    for (let i = 0; i < audioToEncode.length; i++) {
      const { rel } = audioToEncode[i]
      if (signal?.aborted) throw new CancelError()
      const src = path.join(sourceDir, rel)
      const dst = path.join(workspace, rel)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      const tmp = dst + '.enc'
      const enc = await encodeAudio(ffmpeg.bin, src, tmp, preset, maxThreads, signal)
      const encodedSize = (await statSize(tmp))
      if (enc.code === 0 && encodedSize > 0 && sizes[rel] > 0 && encodedSize < sizes[rel] * MIN_GAIN) {
        fs.renameSync(tmp, dst)
        result.audioReencoded++
        result.mediaAfter += encodedSize - sizes[rel]
      } else {
        try { fs.rmSync(tmp, { force: true }) } catch {}
        if (enc.code !== 0) { result.encodedKeepFailed++; }
        await linkOrCopy(src, dst)
      }
      onProgress?.('Re-encoding audio…', 12 + (i + 1) / Math.max(1, audioToEncode.length) * 34, rel)
    }

    for (let i = 0; i < videoToEncode.length; i++) {
      const { rel } = videoToEncode[i]
      if (signal?.aborted) throw new CancelError()
      const src = path.join(sourceDir, rel)
      const dst = path.join(workspace, rel)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      const tmp = dst + '.enc'
      const enc = await encodeVideo(ffmpeg.bin, src, tmp, preset, maxThreads, signal)
      const encodedSize = (await statSize(tmp))
      if (enc.code === 0 && encodedSize > 0 && sizes[rel] > 0 && encodedSize < sizes[rel] * MIN_GAIN) {
        fs.renameSync(tmp, dst)
        result.videoReencoded++
        result.mediaAfter += encodedSize - sizes[rel]
      } else {
        try { fs.rmSync(tmp, { force: true }) } catch {}
        if (enc.code !== 0) result.encodedKeepFailed++
        await linkOrCopy(src, dst)
      }
      onProgress?.('Re-encoding video…', 46 + (i + 1) / Math.max(1, videoToEncode.length) * 34, rel)
    }

    // Stage 2: pack the workspace with the regular NanoPack toolchain.
    // writeNpk throws on failure, so a resolved result here means success.
    onProgress?.('Packing archive…', 82)
    await writeNpk(workspace, outputPath, mode, (stage, percent, file) => {
      onProgress?.(stage || 'Packing archive…', 82 + percent * 0.18, file)
    }, maxThreads, signal)
    result.success = true
    result.finalSize = await statSize(outputPath)
    result.path = outputPath

    const savedBytes = originalSize - result.finalSize
    const mediaSaved = result.mediaBefore - result.mediaAfter
    const parts: string[] = []
    if (result.audioReencoded > 0) parts.push(`${result.audioReencoded} audio`)
    if (result.videoReencoded > 0) parts.push(`${result.videoReencoded} video`)
    result.message = parts.length > 0
      ? `Re-encoded ${parts.join(' + ')} (media −${formatBytes(mediaSaved)}). Archive −${formatBytes(savedBytes)}.`
      : `No media needed re-encoding — media already compressed or too small to gain.`
    return result
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
}

function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(v >= 100 || u === 0 ? 0 : 1)} ${units[u]}`
}