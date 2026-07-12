import fs from 'fs'
import path from 'path'
import { spawnSync, spawn } from 'child_process'
import crypto from 'crypto'
import { streamHashFile } from './stream-hash'

const MAGIC_QUICK = 0x4E504B01
const MAGIC_DEEP = 0x4E504B02
const HEADER_SIZE = 4096

/* NPK header byte layout (v2, 112 bytes + 3984 padding = 4096):
   Offset  Size  Field         Type
       0     4   magic         UInt32BE
       4     4   manifestOff   UInt32BE (always HEADER_SIZE)
       8     8   manifestSize  BigUInt64BE
      16     8   dataOffset    BigUInt64BE
      24     8   dataSize      BigUInt64BE
      32     2   flags         UInt16BE
      34     1   mode          UInt8
      35     1   (alignment)
      36     4   fileCount     UInt32BE
      40     8   originalSize  BigUInt64BE
      48    64   dataHash      ASCII hex (SHA-256)
     112  3984   padding
*/
export interface NpkHeader {
  magic: number
  manifestOffset: number
  manifestSize: number
  dataOffset: number
  dataSize: number
  flags: number
  mode: number
  fileCount: number
  originalSize: number
  dataHash: string
  padding: Buffer
}

export interface ManifestEntry {
  path: string
  size: number
  hash: string
  mtime: number
  type: 'file' | 'photo' | 'video' | 'raw'
  metadata?: Record<string, unknown>
  dedupRef?: string
  deltaRef?: string
}

export interface NpkManifest {
  version: number
  mode: 'quick' | 'deep'
  createdAt: number
  entries: ManifestEntry[]
  totalOriginalSize: number
  totalCompressedSize: number
  dedupMap: Record<string, string>
}

function getVendorPath(): string {
  return path.join(process.resourcesPath || path.join(__dirname, '../../../vendor'), process.platform)
}

function getBinary(name: string): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(getVendorPath(), `${name}${ext}`)
}

// Streaming SHA-256 for large-file memory safety (avoids loading entire file into a Buffer)
function sha256File(filePath: string): Promise<string> {
  return streamHashFile(filePath)
}

function getFileType(filePath: string): 'file' | 'photo' | 'video' | 'raw' {
  const ext = path.extname(filePath).toLowerCase()
  const photoExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.heif']
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.mts']
  const rawExts = ['.raw', '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2']

  if (rawExts.includes(ext)) return 'raw'
  if (videoExts.includes(ext)) return 'video'
  if (photoExts.includes(ext)) return 'photo'
  return 'file'
}

export async function writeNpk(
  sourceDir: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void
): Promise<{ success: boolean; filesProcessed: number; originalSize: number; finalSize: number }> {
  const files: string[] = []
  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walkDir(fullPath)
      else files.push(fullPath)
    }
  }
  walkDir(sourceDir)
  files.sort()

  const total = files.length
  const manifest: NpkManifest = {
    version: 2,
    mode,
    createdAt: Date.now(),
    entries: [],
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    dedupMap: {},
  }

  const dedupCache: Record<string, string> = {}
  let originalSize = 0

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const stats = fs.statSync(filePath)
    const hash = await sha256File(filePath)
    const relPath = path.relative(sourceDir, filePath)
    originalSize += stats.size

    const entry: ManifestEntry = {
      path: relPath,
      size: stats.size,
      hash,
      mtime: stats.mtimeMs,
      type: getFileType(filePath),
    }

    if (dedupCache[hash]) {
      entry.dedupRef = dedupCache[hash]
    } else {
      dedupCache[hash] = relPath
    }

    manifest.entries.push(entry)
    onProgress?.('Scanning files...', Math.round((i / total) * 100), relPath)
  }

  manifest.totalOriginalSize = originalSize
  manifest.dedupMap = dedupCache

  const manifestJson = JSON.stringify(manifest)
  const manifestBuf = Buffer.from(manifestJson)

  onProgress?.('Compressing data...', 90)

  const tempDir = fs.mkdtempSync('npk-')
  let dataPath: string
  let dataSize: number

  try {
    if (mode === 'deep') {
      dataPath = path.join(tempDir, 'data.dwarfs')
      const dwarfs = getBinary('mkdwarfs')
      const args = [
        '-i', sourceDir,
        '-o', dataPath,
        '-l', '6',
      ]
      const dwarfsResult = spawnSync(dwarfs, args, { stdio: 'pipe' })
      if (dwarfsResult.status !== 0) throw new Error(`mkdwarfs failed: ${dwarfsResult.stderr.toString()}`)
    } else {
      dataPath = path.join(tempDir, 'data.zst')
      const zstd = getBinary('zstd')
      const tempTar = path.join(tempDir, 'data.tar')
      const tarResult = spawnSync('tar', ['cf', tempTar, '-C', sourceDir, '.'], { stdio: 'pipe' })
      if (tarResult.status !== 0) throw new Error(`tar failed: ${tarResult.stderr.toString()}`)
      const zstdResult = spawnSync(zstd, ['-3', '-f', '-o', dataPath, tempTar], { stdio: 'pipe' })
      if (zstdResult.status !== 0) throw new Error(`zstd compress failed: ${zstdResult.stderr.toString()}`)
      try { fs.rmSync(tempTar, { force: true }) } catch {}
    }

    const dataStat = fs.statSync(dataPath)
    dataSize = dataStat.size
    manifest.totalCompressedSize = dataSize
  } finally {
    // tempDir cleanup happens after writing
  }

  onProgress?.('Writing archive...', 95)

  const manifestFinal = Buffer.from(JSON.stringify(manifest))

  const dataOffset = HEADER_SIZE + manifestFinal.length
  const header: NpkHeader = {
    magic: mode === 'deep' ? MAGIC_DEEP : MAGIC_QUICK,
    manifestOffset: HEADER_SIZE,
    manifestSize: manifestFinal.length,
    dataOffset,
    dataSize,
    flags: 0,
    mode: mode === 'deep' ? 1 : 0,
    fileCount: files.length,
    originalSize,
    dataHash: '',
    padding: Buffer.alloc(HEADER_SIZE - 112),
  }

  const headerBuf = Buffer.alloc(HEADER_SIZE)
  headerBuf.writeUInt32BE(header.magic, 0)
  headerBuf.writeUInt32BE(HEADER_SIZE, 4)
  headerBuf.writeBigUInt64BE(BigInt(manifestFinal.length), 8)
  headerBuf.writeBigUInt64BE(BigInt(dataOffset), 16)
  headerBuf.writeBigUInt64BE(BigInt(dataSize), 24)
  headerBuf.writeUInt16BE(header.flags, 32)
  headerBuf.writeUInt8(header.mode, 34)
  headerBuf.writeUInt32BE(header.fileCount, 36)
  headerBuf.writeBigUInt64BE(BigInt(originalSize), 40)

  // Streaming SHA-256 hash of compressed data (memory-safe for large archives)
  const dataHash = await streamHashFile(dataPath)

  headerBuf.write(dataHash, 48, 64, 'ascii')

  const outFile = fs.createWriteStream(outputPath)
  outFile.write(headerBuf)
  outFile.write(manifestFinal)

  // Stream-copy compressed data into output (no full-file Buffer)
  const dataStream = fs.createReadStream(dataPath)
  await new Promise<void>((resolve, reject) => {
    dataStream.pipe(outFile, { end: false })
    dataStream.on('end', () => { outFile.end(); resolve() })
    dataStream.on('error', reject)
    outFile.on('error', reject)
  })

  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {}

  onProgress?.('Done', 100)

  const finalStat = fs.statSync(outputPath)
  return {
    success: true,
    filesProcessed: files.length,
    originalSize,
    finalSize: finalStat.size,
  }
}

export { getBinary, sha256File, getFileType }
