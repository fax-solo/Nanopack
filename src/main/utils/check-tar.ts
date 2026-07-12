import { spawnSync } from 'child_process'

export function checkTarAvailable(): boolean {
  try {
    const r = spawnSync('tar', ['--version'], { stdio: 'pipe' })
    return r.status === 0
  } catch {
    return false
  }
}

export function requireTar(): void {
  if (!checkTarAvailable()) {
    throw new Error(
      '`tar` was not found. NanoPack requires Windows 10 1803 or later, or a `tar.exe` available on PATH.'
    )
  }
}
