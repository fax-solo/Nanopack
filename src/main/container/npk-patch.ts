import fs from 'fs'
import path from 'path'
import { readNpkManifest, readNpkHeader } from './npk-reader'
import { streamHashFile } from './stream-hash'
import { writeNpk } from './npk-writer'

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
      // Streaming SHA-256 for large-file memory safety (avoids loading entire file into a Buffer)
      const hash = await streamHashFile(fullPath)
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
    fs.copyFileSync(npkPath, outputPath)
    onProgress?.('Done (no content changes)', 100)
    return {
      success: true,
      filesProcessed: totalChanges,
      originalSize: oldHeader.originalSize,
      finalSize: fs.statSync(outputPath).size,
    }
  }

  onProgress?.('Building new archive with changes...', 30)

  const result = await writeNpk(sourceDir, outputPath, mode, (stage, pct, file) => {
    onProgress?.(stage, 30 + Math.round(pct * 0.65), file)
  })

  onProgress?.('Done', 100)

  return {
    ...result,
    filesProcessed: totalChanges,
  }
}
