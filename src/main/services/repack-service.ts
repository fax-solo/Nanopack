import { repackNpk } from '../container/npk-patch'
import { requireTar } from '../utils/check-tar'

export async function repackArchive(
  npkPath: string,
  sourceDir: string,
  outputPath: string,
  mode: 'quick' | 'deep',
  onProgress?: (stage: string, percent: number, file?: string) => void,
  maxThreads = 0,
  signal?: AbortSignal
) {
  if (mode === 'quick') requireTar()
  return repackNpk(npkPath, sourceDir, outputPath, mode, onProgress, maxThreads, signal)
}
