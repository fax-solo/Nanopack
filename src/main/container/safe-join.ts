import path from 'path'

export function safeJoin(base: string, entryPath: string): string | null {
  const resolved = path.resolve(base, entryPath)
  const baseResolved = path.resolve(base)
  if (!resolved.startsWith(baseResolved + path.sep)) return null
  return resolved
}
