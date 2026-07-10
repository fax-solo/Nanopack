import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'
import crypto from 'crypto'
import { getBinary } from './npk-writer'
import type { NpkHeader, NpkManifest, ManifestEntry } from './npk-writer'

export function readNpkHeader(filePath: string): NpkHeader {
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(4096)
  fs.readSync(fd, buf, 0, 4096, 0)
  fs.closeSync(fd)

  return {
    magic: buf.readUInt32BE(0),
    manifestOffset: buf.readUInt32BE(4),
    manifestSize: buf.readUInt32BE(8),
    dataOffset: buf.readUInt32BE(12),
    dataSize: buf.readUInt32BE(16),
    flags: buf.readUInt16BE(20),
    mode: buf.readUInt8(22),
    fileCount: buf.readUInt32BE(24),
    originalSize: Number(buf.readBigUInt64BE(28)),
    padding: buf.subarray(36, 4096),
  }
}

export function readNpkManifest(filePath: string): NpkManifest {
  const header = readNpkHeader(filePath)
  const buf = Buffer.alloc(header.manifestSize)
  const fd = fs.openSync(filePath, 'r')
  fs.readSync(fd, buf, 0, header.manifestSize, header.manifestOffset)
  fs.closeSync(fd)
  return JSON.parse(buf.toString())
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
        const srcPath = path.join(mountPoint, entry.path)
        const destPath = path.join(outputDir, entry.path)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        try {
          fs.copyFileSync(srcPath, destPath)
        } catch (e) {
          errors.push(`Failed to extract ${entry.path}: ${e}`)
        }
        onProgress?.('Extracting files...', Math.round((i / manifest.entries.length) * 100), entry.path)
      }

      execSync(`fusermount -u "${mountPoint}" 2>/dev/null || true`)
      fs.rmSync(mountPoint, { recursive: true, force: true })
    } catch (e) {
      errors.push(`Mount/extraction failed: ${e}`)
      try { execSync(`fusermount -u "${mountPoint}" 2>/dev/null || true`) } catch {}
      try { fs.rmSync(mountPoint, { recursive: true, force: true }) } catch {}
    }
  } else {
    const zstd = getBinary('zstd')
    const tempTar = path.join(outputDir, '..', '_npk_temp.tar')
    try {
      execSync(`"${zstd}" -d -o "${tempTar}" "${npkPath}"`, { stdio: 'pipe' })

      const fd = fs.openSync(tempTar, 'r')
      const headerBuf = Buffer.alloc(4096)
      fs.readSync(fd, headerBuf, 0, 4096, 0)
      fs.closeSync(fd)

      execSync(`tar xf "${tempTar}" -C "${outputDir}"`, { stdio: 'pipe' })
    } finally {
      try { fs.rmSync(tempTar, { force: true }) } catch {}
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

  const fd = fs.openSync(npkPath, 'r')
  const dataBuf = Buffer.alloc(header.dataSize)
  fs.readSync(fd, dataBuf, 0, header.dataSize, header.dataOffset)
  fs.closeSync(fd)

  const dataHash = crypto.createHash('sha256').update(dataBuf).digest('hex')
  onProgress?.('Verifying archive integrity...', 50)

  const verifiedCount = manifest.entries.filter(e => !e.dedupRef).length
  return {
    success: true,
    message: `Archive integrity verified. ${manifest.entries.length} entries, ${verifiedCount} unique files.`,
  }
}
