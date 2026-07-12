import { safeJoin } from '../safe-join'
import path from 'path'

const base = '/tmp/test-output'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`)
}

assertEqual(safeJoin(base, '../../evil.txt'), null, 'should reject ../ traversal')
assertEqual(safeJoin(base, '/etc/passwd'), null, 'should reject absolute path')
assertEqual(safeJoin(base, 'normal/file.txt'), path.resolve(base, 'normal/file.txt'), 'should accept normal path')
assertEqual(safeJoin(base, 'deeply/nested/../../../evil.txt'), null, 'should reject traversal via embedded ..')
assert(safeJoin('/tmp', 'file.txt') !== null, 'should accept simple file in root')

const result = safeJoin(base, 'subdir/file.txt')
assert(result !== null, 'should resolve subdir/file.txt')
if (result) {
  assert(result.startsWith(path.resolve(base)), 'should be inside base directory')
  assert(!result.includes('..'), 'should not contain ..')
}

console.log('All safe-join tests passed.')
