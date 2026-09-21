import path from 'path'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}
function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`)
}

export async function run() {
  const { safeJoin } = await import('../safe-join')
  const base = '/tmp/test-output'

  assertEqual(safeJoin(base, '../../evil.txt'), null, 'reject ../ traversal')
  assertEqual(safeJoin(base, '/etc/passwd'), null, 'reject absolute path')
  assertEqual(safeJoin(base, 'normal/file.txt'), path.resolve(base, 'normal/file.txt'), 'accept normal path')
  assertEqual(safeJoin(base, 'deeply/nested/../../../evil.txt'), null, 'reject embedded ..')
  assert(safeJoin('/tmp', 'file.txt') !== null, 'accept simple file in root')

  const result = safeJoin(base, 'subdir/file.txt')
  assert(result !== null, 'resolve subdir/file.txt')
  if (result) {
    assert(result.startsWith(path.resolve(base)), 'stay inside base directory')
    assert(!result.includes('..'), 'contain no ..')
  }

  console.log('  ✓ safe-join ok (path traversal protection)')
}