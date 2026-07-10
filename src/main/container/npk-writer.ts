import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'
import crypto from 'crypto'

const MAGIC_QUICK = 0x4E504B01
const MAGIC_DEEP = 0x4E504B02
const HEADER_SIZE = 4096

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

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
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
    version: 1,
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
    const hash = sha256File(filePath)
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
      execSync(`"${dwarfs}" ${args.join(' ')}`, { stdio: 'pipe' })
    } else {
      dataPath = path.join(tempDir, 'data.zst')
      const zstd = getBinary('zstd')
      const tempFileList = path.join(tempDir, 'files.txt')
      const relFiles = files.map(f => path.relative(sourceDir, f))
      fs.writeFileSync(tempFileList, relFiles.join('\n'))
      execSync(`"${zstd}" -3 --rm -o "${dataPath}" -- "${tempFileList}"`, { stdio: 'pipe' })

      const tempTar = path.join(tempDir, 'data.tar')
      execSync(`tar cf "${tempTar}" -C "${sourceDir}" .`, { stdio: 'pipe' })
      execSync(`"${zstd}" -3 -o "${dataPath}" "${tempTar}"`, { stdio: 'pipe' })
    }

    const dataStat = fs.statSync(dataPath)
    dataSize = dataStat.size
    manifest.totalCompressedSize = dataSize
  } finally {
    // tempDir cleanup happens after writing
  }

  onProgress?.('Writing archive...', 95)

  const manifestFinal = Buffer.from(JSON.stringify(manifest))

  const header: NpkHeader = {
    magic: mode === 'deep' ? MAGIC_DEEP : MAGIC_QUICK,
    manifestOffset: HEADER_SIZE,
    manifestSize: manifestFinal.length,
    dataOffset: HEADER_SIZE + manifestFinal.length,
    dataSize,
    flags: 0,
    mode: mode === 'deep' ? 1 : 0,
    fileCount: files.length,
    originalSize,
    padding: Buffer.alloc(HEADER_SIZE - 44),
  }

  const headerBuf = Buffer.alloc(HEADER_SIZE)
  headerBuf.writeUInt32BE(header.magic, 0)
  headerBuf.writeUInt32BE(HEADER_SIZE, 4)  // manifestOffset
  headerBuf.writeUInt32BE(manifestFinal.length, 8)
  headerBuf.writeUInt32BE(HEADER_SIZE + manifestFinal.length, 12)
  headerBuf.writeUInt32BE(dataSize, 16)
  headerBuf.writeUInt16BE(header.flags, 20)
  headerBuf.writeUInt8(header.mode, 22)
  headerBuf.writeUInt32BE(header.fileCount, 24)
  headerBuf.writeBigUInt64BE(BigInt(originalSize), 28)

  const dataBuf = fs.readFileSync(dataPath)

  const outFile = fs.createWriteStream(outputPath)
  outFile.write(headerBuf)
  outFile.write(manifestFinal)
  outFile.write(dataBuf)
  outFile.end()

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
