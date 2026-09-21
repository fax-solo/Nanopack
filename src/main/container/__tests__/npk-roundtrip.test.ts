import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { writeNpk } from '../npk-writer'
import { extractNpk, verifyNpk, readNpkHeader, readNpkManifest } from '../npk-reader'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}
function eq(a: unknown, b: unknown, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`)
}

function makeFixture(root: string) {
  const sub = path.join(root, 'nested', 'deeper')
  fs.mkdirSync(sub, { recursive: true })
  fs.writeFileSync(path.join(root, 'alpha.txt'), 'hello world '.repeat(100))
  fs.writeFileSync(path.join(sub, 'beta.txt'), 'nested content\n')
  fs.writeFileSync(path.join(sub, 'gamma.bin'), crypto.randomBytes(64 * 1024))
  fs.writeFileSync(path.join(root, 'empty.dat'), '')
  // File with unusual name and content that exercises binary paths
  fs.mkdirSync(path.join(root, 'with space'), { recursive: true })
  fs.writeFileSync(path.join(root, 'with space', 'data ff.bin'), Buffer.from([0, 1, 2, 255, 254, 128]))
}

function walk(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  function rec(dir: string, prefix = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      const full = path.join(dir, e.name)
      if (e.isDirectory()) rec(full, rel)
      else out.set(rel, fs.readFileSync(full))
    }
  }
  rec(root)
  return out
}

export async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-test-'))
  const src = path.join(tmp, 'source')
  fs.mkdirSync(src, { recursive: true })
  makeFixture(src)
  const expected = walk(src)

  for (const mode of ['quick', 'deep'] as const) {
    const npk = path.join(tmp, `${mode}.npk`)
    const dest = path.join(tmp, `${mode}-out`)
    fs.mkdirSync(dest, { recursive: true })

    const write = await writeNpk(src, npk, mode)
    assert(write.success, `${mode} write failed`)
    eq(write.filesProcessed, expected.size, `${mode} filesProcessed`)

    const header = readNpkHeader(npk)
    assert(header.magic === (mode === 'deep' ? 0x4e504b02 : 0x4e504b01), `${mode} magic`)
    assert(header.mode === (mode === 'deep' ? 1 : 0), `${mode} header mode`)
    assert(header.fileCount === expected.size, `${mode} fileCount`)
    assert(header.dataOffset >= 4096, `${mode} dataOffset must follow header+manifest`)

    const ex = await extractNpk(npk, dest)
    assert(ex.success, `${mode} extract failed: ${ex.errors}`)

    const actual = walk(dest)
    eq(actual.size, expected.size, `${mode} extracted file count`)
    for (const [rel, buf] of expected) {
      assert(actual.has(rel), `${mode} missing ${rel}`)
      if (actual.get(rel)!.toString('hex') !== buf.toString('hex')) {
        throw new Error(`${mode} content mismatch for ${rel}`)
      }
    }

    const verified = await verifyNpk(npk)
    assert(verified.success, `${mode} verify failed: ${verified.message}`)

    // Corruption must be detected
    fs.appendFileSync(npk, 'corruption')
    const bad = await verifyNpk(npk)
    assert(!bad.success, `${mode} corrupted archive passed verification`)

    console.log(`  ✓ ${mode} roundtrip ok (${write.filesProcessed} files, ${write.originalSize} → ${write.finalSize} bytes)`)
  }

  fs.rmSync(tmp, { recursive: true, force: true })
}

export async function runRepack() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-repack-test-'))
  const src = path.join(tmp, 'source')
  const src2 = path.join(tmp, 'source-updated')
  fs.mkdirSync(src, { recursive: true })

  fs.writeFileSync(path.join(src, 'keep.txt'), 'keep me')
  fs.writeFileSync(path.join(src, 'remove-me.txt'), 'delete me')
  fs.mkdirSync(path.join(src, 'sub'), { recursive: true })
  fs.writeFileSync(path.join(src, 'sub', 'old.bin'), crypto.randomBytes(4096))

  const npk = path.join(tmp, 'orig.npk')
  const write = await writeNpk(src, npk, 'quick')
  assert(write.success, 'initial pack failed')

  // Simulate user's updated source: keep + modify, drop removed, add new
  fs.mkdirSync(src2, { recursive: true })
  fs.writeFileSync(path.join(src2, 'keep.txt'), 'keep me')
  fs.mkdirSync(path.join(src2, 'sub'), { recursive: true })
  fs.writeFileSync(path.join(src2, 'sub', 'new.txt'), 'added in v2')
  fs.writeFileSync(path.join(src2, 'sub', 'old.bin'), 'changed bytes '.repeat(10))

  // reduced to just 'quick'-mode logic, runs for both modes
  for (const mode of ['quick', 'deep'] as const) {
    const out = path.join(tmp, `repacked-${mode}.npk`)
    const { repackNpk } = await import('../npk-patch')
    const r = await repackNpk(npk, src2, out, mode)
    assert(r.success, `${mode} repack failed: ${JSON.stringify(r)}`)

    const dest = path.join(tmp, `final-${mode}`)
    fs.mkdirSync(dest, { recursive: true })
    const ex = await extractNpk(out, dest)
    assert(ex.success, `${mode} repacked extract failed: ${ex.errors}`)

    const final = walk(dest)
    assert(final.has('keep.txt'), `${mode}: keep.txt must survive repack`)
    assert(final.has('sub/new.txt'), `${mode}: added file missing`)
    assert(final.has('sub/old.bin'), `${mode}: modified file missing`)
    assert(!final.has('remove-me.txt'), `${mode}: removed file must NOT be in repacked archive`)
    assert(final.get('sub/old.bin')!.toString() === 'changed bytes '.repeat(10), `${mode}: modified content wrong`)
    assert(final.size === 3, `${mode}: expected 3 files, got ${final.size}`)

    const v = await verifyNpk(out)
    assert(v.success, `${mode} repacked archive failed verify`)

    console.log(`  ✓ ${mode} repack ok (remove/add/modify reflected in archive)`)
  }

  fs.rmSync(tmp, { recursive: true, force: true })
}