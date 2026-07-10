import { repackNpk } from '../container/npk-patch'

export async function repackArchive(
  npkPath: string,
  sourceDir: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void
) {
  return repackNpk(npkPath, sourceDir, outputPath, mode, onProgress)
}
