import fs from 'fs'
import path from 'path'
import { spawnSync, spawn } from 'child_process'
import crypto from 'crypto'
import { getBinary } from './npk-writer'
import type { NpkHeader, NpkManifest, ManifestEntry } from './npk-writer'
import { safeJoin } from './safe-join'

export function readNpkHeader(filePath: string): NpkHeader {
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(4096)
  fs.readSync(fd, buf, 0, 4096, 0)
  fs.closeSync(fd)

  const dataHashRaw = buf.subarray(48, 112).toString('ascii').replace(/\0+$/, '')

  return {
    magic: buf.readUInt32BE(0),
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

export async function extractNpk(
  npkPath: string,
  outputDir: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
): Promise<{ success: boolean; filesProcessed: number; errors: string[] }> {
  const manifest = readNpkManifest(npkPath)
  const header = readNpkHeader(npkPath)
  const errors: string[] = []

  fs.mkdirSync(outputDir, { recursive: true })

  if (manifest.mode === 'deep') {
    const dwarfs = getBinary('dwarfs')
    const mountPoint = fs.mkdtempSync('npk-mount-')

    try {
      const proc = spawn(dwarfs, [npkPath, mountPoint, '-o', 'allow_other=false,ro'])
      await new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`dwarfs mount exited with code ${code}`))
        })
        proc.on('error', reject)
        setTimeout(() => resolve(), 2000)
      })

      for (let i = 0; i < manifest.entries.length; i++) {
        const entry = manifest.entries[i]
        const destPath = safeJoin(outputDir, entry.path)
        if (!destPath) {
          errors.push(`Skipped ${entry.path}: path traversal detected`)
          continue
        }
        const srcPath = path.join(mountPoint, entry.path)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        try {
          fs.copyFileSync(srcPath, destPath)
        } catch (e) {
          errors.push(`Failed to extract ${entry.path}: ${e}`)
        }
        onProgress?.('Extracting files...', Math.round((i / manifest.entries.length) * 100), entry.path)
      }

      spawnSync('fusermount', ['-u', mountPoint], { stdio: 'pipe' })
      fs.rmSync(mountPoint, { recursive: true, force: true })
    } catch (e) {
      errors.push(`Mount/extraction failed: ${e}`)
      try { spawnSync('fusermount', ['-u', mountPoint], { stdio: 'pipe' }) } catch {}
      try { fs.rmSync(mountPoint, { recursive: true, force: true }) } catch {}
    }
  } else {
    const zstd = getBinary('zstd')
    const tempTar = path.join(outputDir, '..', '_npk_temp.tar')
    const extractDir = fs.mkdtempSync('npk-extract-')
    try {
      const zstdResult = spawnSync(zstd, ['-d', '-o', tempTar, npkPath], { stdio: 'pipe' })
      if (zstdResult.status !== 0) throw new Error(`zstd decompress failed: ${zstdResult.stderr.toString()}`)
      const tarResult = spawnSync('tar', ['xf', tempTar, '-C', extractDir], { stdio: 'pipe' })
      if (tarResult.status !== 0) throw new Error(`tar extract failed: ${tarResult.stderr.toString()}`)

      for (let i = 0; i < manifest.entries.length; i++) {
        const entry = manifest.entries[i]
        const destPath = safeJoin(outputDir, entry.path)
        if (!destPath) {
          errors.push(`Skipped ${entry.path}: path traversal detected`)
          continue
        }
        const srcPath = path.join(extractDir, entry.path)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        try {
          fs.copyFileSync(srcPath, destPath)
        } catch (e) {
          errors.push(`Failed to extract ${entry.path}: ${e}`)
        }
        onProgress?.('Extracting files...', Math.round((i / manifest.entries.length) * 100), entry.path)
      }
    } finally {
      try { fs.rmSync(tempTar, { force: true }) } catch {}
      try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
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
  onProgress?.('Verifying archive size...', 25)

  const fd = fs.openSync(npkPath, 'r')
  const dataBuf = Buffer.alloc(header.dataSize)
  fs.readSync(fd, dataBuf, 0, header.dataSize, header.dataOffset)
  fs.closeSync(fd)

  const computedHash = crypto.createHash('sha256').update(dataBuf).digest('hex')
  onProgress?.('Verifying archive integrity...', 50)

  if (header.dataHash) {
    if (computedHash !== header.dataHash) {
      return {
        success: false,
        message: `Data corruption detected: SHA-256 hash mismatch. Expected ${header.dataHash}, got ${computedHash}.`,
      }
    }
    onProgress?.('Hash verified', 75)
  }

  const verifiedCount = manifest.entries.filter(e => !e.dedupRef).length
  return {
    success: true,
    message: `Archive integrity verified. ${manifest.entries.length} entries, ${verifiedCount} unique files.`,
  }
}
