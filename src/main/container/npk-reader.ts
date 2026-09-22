import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getBinary, runProcess, CancelError, MAGIC_QUICK, MAGIC_DEEP } from './npk-writer'
import type { NpkHeader, NpkManifest, ManifestEntry } from './npk-writer'
import { safeJoin } from './safe-join'

const SUPPORTED_MAGICS = [MAGIC_QUICK, MAGIC_DEEP]

export function readNpkHeader(filePath: string): NpkHeader {
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(4096)
  fs.readSync(fd, buf, 0, 4096, 0)
  fs.closeSync(fd)

  const magic = buf.readUInt32BE(0)
  if (!SUPPORTED_MAGICS.includes(magic)) {
    throw new Error(`Not a valid .npk archive (unrecognized magic 0x${magic.toString(16).padStart(8, '0')}).`)
  }

  const dataHashRaw = buf.subarray(48, 112).toString('ascii').replace(/\0+$/, '')

  return {
    magic,
    manifestOffset: buf.readUInt32BE(4),
    manifestSize: Number(buf.readBigUInt64BE(8)),
    dataOffset: Number(buf.readBigUInt64BE(16)),
    dataSize: Number(buf.readBigUInt64BE(24)),
    flags: buf.readUInt16BE(32),
    mode: buf.readUInt8(34),
    fileCount: buf.readUInt32BE(36),
    originalSize: Number(buf.readBigUInt64BE(40)),
    dataHash: dataHashRaw,
    padding: buf.subarray(112, 4096),
  }
}

const SUPPORTED_MANIFEST_VERSIONS = [1, 2]

export function readNpkManifest(filePath: string): NpkManifest {
  const header = readNpkHeader(filePath)
  const stat = fs.statSync(filePath)
  if (header.manifestSize <= 0 || header.manifestSize > stat.size ||
      header.manifestOffset + header.manifestSize > stat.size) {
    throw new Error('Corrupt .npk archive: manifest size/offset out of bounds.')
  }
  const buf = Buffer.alloc(header.manifestSize)
  const fd = fs.openSync(filePath, 'r')
  fs.readSync(fd, buf, 0, header.manifestSize, header.manifestOffset)
  fs.closeSync(fd)
  const manifest: NpkManifest = JSON.parse(buf.toString())
  if (!SUPPORTED_MANIFEST_VERSIONS.includes(manifest.version)) {
    throw new Error(`Unsupported manifest version ${manifest.version}. This tool supports versions ${SUPPORTED_MANIFEST_VERSIONS.join(', ')}.`)
  }
  return manifest
}

function copyEntriesFromStaging(
  entries: ManifestEntry[],
  stagingDir: string,
  outputDir: string,
  onProgress?: (stage: string, percent: number, file?: string) => void,
  signal?: AbortSignal
): string[] {
  const errors: string[] = []
  for (let i = 0; i < entries.length; i++) {
    if (signal?.aborted) throw new CancelError()
    const entry = entries[i]
    const destPath = safeJoin(outputDir, entry.path)
    if (!destPath) {
      errors.push(`Skipped ${entry.path}: path traversal detected`)
      continue
    }
    const srcPath = path.join(stagingDir, entry.path)
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    try {
      fs.copyFileSync(srcPath, destPath)
    } catch (e) {
      errors.push(`Failed to extract ${entry.path}: ${e}`)
    }
    onProgress?.('Extracting files...', Math.round((i / entries.length) * 100), entry.path)
  }
  return errors
}

function copyDataSection(filePath: string, offset: number, size: number, destPath: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = fs.createReadStream(filePath, { start: offset, end: offset + size - 1 })
    const writer = fs.createWriteStream(destPath)
    const onAbort = () => {
      reader.destroy()
      writer.destroy()
      reject(new CancelError())
    }
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    reader.pipe(writer)
    reader.on('end', () => writer.end())
    writer.on('finish', () => { cleanup(); resolve() })
    reader.on('error', (e) => { cleanup(); reject(e) })
    writer.on('error', (e) => { cleanup(); reject(e) })
  })
}

export async function extractNpk(
  npkPath: string,
  outputDir: string,
  onProgress?: (stage: string, percent: number, file?: string) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; filesProcessed: number; errors: string[] }> {
  const manifest = readNpkManifest(npkPath)
  const header = readNpkHeader(npkPath)
  const errors: string[] = []

  fs.mkdirSync(outputDir, { recursive: true })

  if (manifest.mode === 'deep') {
    const dwarfsextract = getBinary('dwarfsextract')
    const stagingDir = fs.mkdtempSync('npk-extract-')
    try {
      const result = await runProcess(dwarfsextract, ['-i', npkPath, '-o', stagingDir], signal)
      if (result.code !== 0) throw new Error(`dwarfsextract failed: ${result.stderr.toString()}`)
      errors.push(...copyEntriesFromStaging(manifest.entries, stagingDir, outputDir, onProgress, signal))
    } finally {
      try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch {}
    }
  } else {
    const zstd = getBinary('zstd')
    const tag = path.basename(outputDir)
    const tempData = path.join(outputDir, '..', `_npk_data_${tag}.zst`)
    const tempTar = path.join(outputDir, '..', `_npk_temp_${tag}.tar`)
    const stagingDir = fs.mkdtempSync('npk-extract-')
    try {
      await copyDataSection(npkPath, header.dataOffset, header.dataSize, tempData, signal)
      const zstdResult = await runProcess(zstd, ['-d', '-o', tempTar, tempData], signal)
      if (zstdResult.code !== 0) throw new Error(`zstd decompress failed: ${zstdResult.stderr.toString()}`)
      const tarResult = await runProcess('tar', ['xf', tempTar, '-C', stagingDir], signal)
      if (tarResult.code !== 0) throw new Error(`tar extract failed: ${tarResult.stderr.toString()}`)
      errors.push(...copyEntriesFromStaging(manifest.entries, stagingDir, outputDir, onProgress, signal))
    } finally {
      try { fs.rmSync(tempTar, { force: true }) } catch {}
      try { fs.rmSync(tempData, { force: true }) } catch {}
      try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch {}
    }
  }

  return {
    success: errors.length === 0,
    filesProcessed: manifest.entries.length,
    errors,
  }
}

export async function verifyNpk(
  npkPath: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
): Promise<{ success: boolean; message: string }> {
  const manifest = readNpkManifest(npkPath)
  const header = readNpkHeader(npkPath)
  const stat = fs.statSync(npkPath)

  const expectedEnd = header.dataOffset + header.dataSize
  if (stat.size < expectedEnd) {
    return {
      success: false,
      message: `Archive truncated: expected ${expectedEnd} bytes, got ${stat.size} bytes.`,
    }
  }
  if (stat.size > expectedEnd) {
    return {
      success: false,
      message: `Archive tampered: ${stat.size - expectedEnd} unexpected trailing byte(s) after data section.`,
    }
  }
  onProgress?.('Verifying archive size...', 25)

  const verifiedCount = await new Promise<number>((resolve, reject) => {
    if (header.dataHash) {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(npkPath, { start: header.dataOffset, end: header.dataOffset + header.dataSize - 1 })
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => {
        onProgress?.('Verifying archive integrity...', 50)
        const computedHash = hash.digest('hex')
        if (computedHash !== header.dataHash) {
          reject(new Error(`Data corruption detected: SHA-256 hash mismatch. Expected ${header.dataHash}, got ${computedHash}.`))
          return
        }
        if (computedHash.length > 0) onProgress?.('Hash verified', 75)
        resolve(manifest.entries.filter(e => !e.dedupRef).length)
      })
      stream.on('error', reject)
    } else {
      resolve(manifest.entries.filter(e => !e.dedupRef).length)
    }
  })

  return {
    success: true,
    message: `Archive integrity verified. ${manifest.entries.length} entries, ${verifiedCount} unique files.`,
  }
}
