import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import crypto from 'crypto'
import { readNpkManifest, readNpkHeader } from './npk-reader'
import { writeNpk, getBinary } from './npk-writer'

export async function repackNpk(
  npkPath: string,
  sourceDir: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void
): Promise<{ success: boolean; filesProcessed: number; originalSize: number; finalSize: number }> {
  const oldManifest = readNpkManifest(npkPath)
  const oldHeader = readNpkHeader(npkPath)

  onProgress?.('Comparing files...', 5)

  const currentFiles: Map<string, string> = new Map()
  function walkDir(dir: string, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walkDir(fullPath, relPath)
      else currentFiles.set(relPath, fullPath)
    }
  }
  walkDir(sourceDir)

  const oldEntriesMap = new Map(oldManifest.entries.map(e => [e.path, e]))

  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []
  const unchanged: string[] = []

  for (const [relPath, fullPath] of currentFiles) {
    const oldEntry = oldEntriesMap.get(relPath)
    if (!oldEntry) {
      added.push(relPath)
    } else {
      const stats = fs.statSync(fullPath)
      const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')
      if (hash !== oldEntry.hash) {
        modified.push(relPath)
      } else {
        unchanged.push(relPath)
      }
    }
  }

  for (const oldPath of oldEntriesMap.keys()) {
    if (!currentFiles.has(oldPath)) {
      removed.push(oldPath)
    }
  }

  const totalChanges = added.length + modified.length + removed.length

  if (totalChanges === 0) {
    onProgress?.('No changes detected', 100)
    return {
      success: true,
      filesProcessed: 0,
      originalSize: oldHeader.originalSize,
      finalSize: fs.statSync(npkPath).size,
    }
  }

  onProgress?.(`${added.length} added, ${modified.length} modified, ${removed.length} removed`, 10)

  if (added.length === 0 && modified.length === 0) {
    const outDir = path.dirname(outputPath)
    execSync(`cp "${npkPath}" "${outputPath}"`, { stdio: 'pipe' })
    onProgress?.('Done (no content changes)', 100)
    return {
      success: true,
      filesProcessed: totalChanges,
      originalSize: oldHeader.originalSize,
      finalSize: fs.statSync(outputPath).size,
    }
  }

  const tempDir = fs.mkdtempSync('npk-repack-')

  try {
    onProgress?.(`Generating deltas for ${modified.length} modified files...`, 30)

    for (const relPath of modified) {
      const fullPath = currentFiles.get(relPath)!
      const oldEntry = oldEntriesMap.get(relPath)!

      const hdiff = getBinary('hpatchz')
      const oldTemp = path.join(tempDir, `old_${relPath.replace(/\//g, '_')}`)
      const newTemp = path.join(tempDir, `new_${relPath.replace(/\//g, '_')}`)
      const patchTemp = path.join(tempDir, `patch_${relPath.replace(/\//g, '_')}`)

      const oldData = Buffer.from(oldEntry.hash, 'hex')
      fs.writeFileSync(oldTemp, oldData)
      fs.copyFileSync(fullPath, newTemp)

      execSync(`"${hdiff}" -d "${oldTemp}" "${newTemp}" "${patchTemp}"`, {
        stdio: 'pipe',
        timeout: 300000,
      })

      try { fs.rmSync(oldTemp, { force: true }) } catch {}
      try { fs.rmSync(newTemp, { force: true }) } catch {}
    }

    onProgress?.('Building new archive with changes...', 60)

    const result = await writeNpk(sourceDir, outputPath, mode, (stage, pct, file) => {
      onProgress?.(stage, 60 + Math.round(pct * 0.35), file)
    })

    onProgress?.('Done', 100)

    return {
      ...result,
      filesProcessed: totalChanges,
    }
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
}
