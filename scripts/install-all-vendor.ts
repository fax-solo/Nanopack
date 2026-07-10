import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RAW_PLATFORM = process.platform
const PLATFORM = RAW_PLATFORM === 'win32' ? 'win' : RAW_PLATFORM === 'darwin' ? 'mac' : RAW_PLATFORM
const VENDOR = path.join(__dirname, '..', 'vendor', PLATFORM)
const CACHE = path.join(__dirname, '..', 'vendor', '_cache')
const EXT = RAW_PLATFORM === 'win32' ? '.exe' : ''

function log(m: string) { console.log(`  ${m}`) }

// Ensure vendor tools bin is in PATH for lzip etc.
const TOOLS_BIN = path.join(__dirname, '..', 'vendor', 'tools', 'bin')
if (fs.existsSync(TOOLS_BIN)) {
  process.env.PATH = `${TOOLS_BIN}:${process.env.PATH}`
}

function dl(url: string, dest: string) {
  if (fs.existsSync(dest)) { log(`Cached: ${path.basename(dest)}`); return }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  log(`Downloading ${url}...`)
  execSync(`curl -fSL# "${url}" -o "${dest}" 2>&1`, { timeout: 180000, encoding: 'utf-8', maxBuffer: 1048576 })
}

function install(name: string, src: string) {
  const t = path.join(VENDOR, name + EXT)
  if (fs.existsSync(t)) { log(`${name} — present`); return }
  fs.cpSync(src, t); fs.chmodSync(t, 0o755); log(`Installed ${name}`)
}

function extractAndInstall(archive: string, files: string[]) {
  const tmp = fs.mkdtempSync('npk-extract-')
  try {
    if (archive.endsWith('.tar.gz') || archive.endsWith('.tgz'))
      execSync(`tar xzf "${archive}" -C "${tmp}" 2>&1`, { stdio: 'pipe' })
    else if (archive.endsWith('.tar.xz'))
      execSync(`tar xJf "${archive}" -C "${tmp}" 2>&1`, { stdio: 'pipe' })
    else if (archive.endsWith('.tar.lz'))
      execSync(`lzip -d -c "${archive}" | tar xf - -C "${tmp}" 2>&1`, { stdio: 'pipe' })
    else if (archive.endsWith('.zip'))
      execSync(`unzip -o "${archive}" -d "${tmp}" 2>&1`, { stdio: 'pipe' })

    for (const f of files) {
      const found = findBin(tmp, f)
      if (found) install(f, found)
      else log(`WARNING: ${f} not found in archive`)
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

function findBin(dir: string, name: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  for (const e of entries) {
    if (e.isFile()) {
      const fp = path.join(e.parentPath, e.name)
      if (e.name === name || e.name === name + EXT) return fp
    }
  }
  return null
}

async function main() {
  console.log(`\nNanoPack — Full Vendor Installer (${PLATFORM})`)
  console.log(`Target: ${VENDOR}\n`)
  fs.mkdirSync(VENDOR, { recursive: true })
  fs.mkdirSync(CACHE, { recursive: true })

  // ───── 1. DwarFS ──────────────────────────────────────────────
  console.log('1. DwarFS (mkdwarfs + dwarfs)')
  {
    const targets = ['mkdwarfs', 'dwarfs'].map(n => path.join(VENDOR, n + EXT))
    if (targets.every(fs.existsSync)) {
      log('Already installed')
    } else {
      // DwarFS provides a static universal binary
      const url = 'https://github.com/mhx/dwarfs/releases/download/v0.15.4/dwarfs-universal-0.15.4-Linux-x86_64'
      const bin = path.join(CACHE, 'dwarfs-universal')
      dl(url, bin)
      fs.chmodSync(bin, 0o755)
      // Create symlinks: mkdwarfs -> universal (it detects mode by argv[0])
      const mkd = path.join(VENDOR, 'mkdwarfs' + EXT)
      const dwf = path.join(VENDOR, 'dwarfs' + EXT)
      if (!fs.existsSync(dwf)) { fs.cpSync(bin, dwf); fs.chmodSync(dwf, 0o755); log('Installed dwarfs') }
      if (!fs.existsSync(mkd)) {
        // For mkdwarfs, symlink or copy
        fs.cpSync(bin, mkd); fs.chmodSync(mkd, 0o755); log('Installed mkdwarfs (as universal binary)')
      }
    }
  }

  // ───── 2. HDiffPatch ──────────────────────────────────────────
  console.log('2. HDiffPatch (hpatchz)')
  {
    const t = path.join(VENDOR, 'hpatchz' + EXT)
    if (fs.existsSync(t)) { log('Already installed') }
    else {
      const url = 'https://github.com/sisong/HDiffPatch/releases/download/v5.0.1/hdiffpatch_v5.0.1_bin_linux64.zip'
      const arc = path.join(CACHE, 'hdiffpatch_linux64.zip')
      dl(url, arc)
      extractAndInstall(arc, ['hpatchz'])
    }
  }

  // ───── 3. xdelta3 ─────────────────────────────────────────────
  console.log('3. xdelta3')
  {
    const t = path.join(VENDOR, 'xdelta3' + EXT)
    if (fs.existsSync(t)) { log('Already installed') }
    else {
      const url = 'https://github.com/jmacd/xdelta/releases/download/v3.2.0/xdelta3-3.2.0-linux-x86_64.tar.gz'
      const arc = path.join(CACHE, 'xdelta3-3.2.0-linux.tar.gz')
      dl(url, arc)
      extractAndInstall(arc, ['xdelta3'])
    }
  }

  // ───── 4. bsdiff (build from source) ──────────────────────────
  console.log('4. bsdiff')
  {
    const t = path.join(VENDOR, 'bsdiff' + EXT)
    if (fs.existsSync(t)) { log('Already installed') }
    else {
      log('Building from source...')
      const src = path.join(CACHE, 'bsdiff-src')
      if (!fs.existsSync(src)) {
        execSync(`git clone --depth=1 https://github.com/mendsley/bsdiff.git "${src}" 2>&1`, { stdio: 'pipe', timeout: 60000 })
      }
      const buildDir = fs.mkdtempSync('npk-bsdiff-')
      try {
        execSync(`cd "${src}" && chmod +x autogen.sh && ./autogen.sh 2>&1`, { stdio: 'pipe', timeout: 30000 })
        execSync(`cd "${src}" && ./configure 2>&1`, { stdio: 'pipe', timeout: 30000 })
        execSync(`cd "${src}" && make -j$(nproc) 2>&1`, { stdio: 'pipe', timeout: 60000 })
        const built = path.join(src, 'bsdiff')
        if (fs.existsSync(built)) install('bsdiff', built)
        // bsdiff also builds bspatch
        const bspatch = path.join(src, 'bspatch')
        if (fs.existsSync(bspatch)) install('bspatch', bspatch)
        log('bsdiff/bspatch built from source')
      } catch (e: any) { log(`WARNING: bsdiff build failed: ${e.message}`) }
      finally { fs.rmSync(buildDir, { recursive: true, force: true }) }
    }
  }

  // ───── 5. JPEG XL (cjxl/djxl) ────────────────────────────────
  console.log('5. JPEG XL (cjxl/djxl)')
  {
    const targets = ['cjxl', 'djxl'].map(n => path.join(VENDOR, n + EXT))
    if (targets.every(fs.existsSync)) { log('Already installed') }
    else {
      const url = 'https://github.com/libjxl/libjxl/releases/download/v0.12.0/jxl-linux-x86_64-static.tar.lz'
      const arc = path.join(CACHE, 'jxl-linux-static.tar.lz')
      dl(url, arc)
      extractAndInstall(arc, ['cjxl', 'djxl'])
    }
  }

  // ───── 6. Lepton (build from source) ──────────────────────────
  console.log('6. Lepton')
  {
    const t = path.join(VENDOR, 'lepton' + EXT)
    if (fs.existsSync(t)) { log('Already installed') }
    else {
      log('Building from source...')
      const srcDir = path.join(CACHE, 'lepton-src')
      if (!fs.existsSync(srcDir)) {
        execSync(`git clone --depth=1 --branch=1.2 https://github.com/dropbox/lepton.git "${srcDir}" 2>&1`, { stdio: 'pipe', timeout: 60000 })
      }
      try {
        execSync(`cd "${srcDir}" && mkdir -p build && cd build && cmake .. -DCMAKE_POLICY_VERSION_MINIMUM=3.5 && make -j$(nproc) lepton 2>&1`, { stdio: 'pipe', timeout: 180000 })
        const built = path.join(srcDir, 'build', 'lepton')
        if (fs.existsSync(built)) install('lepton', built)
        else {
          // Try alternative build paths
          const alt = findBin(path.join(srcDir, 'build'), 'lepton')
          if (alt) install('lepton', alt)
        }
        log('Lepton built from source')
      } catch (e: any) { log(`WARNING: Lepton build failed: ${e.message}. Install via package manager or manual.`) }
    }
  }

  // ───── 7. Precomp (build from source) ─────────────────────────
  console.log('7. Precomp')
  {
    const t = path.join(VENDOR, 'precomp' + EXT)
    if (fs.existsSync(t)) { log('Already installed') }
    else {
      log('Building from source...')
      const srcDir = path.join(CACHE, 'precomp-src')
      if (!fs.existsSync(srcDir)) {
        execSync(`git clone --depth=1 https://github.com/schnaader/precomp-cpp.git "${srcDir}" 2>&1`, { stdio: 'pipe', timeout: 60000 })
      }
      try {
        execSync(`cd "${srcDir}" && cmake . -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_FLAGS="-Wno-implicit-function-declaration" && make -j$(nproc) 2>&1`, { stdio: 'pipe', timeout: 180000 })
        const built = path.join(srcDir, 'precomp')
        if (fs.existsSync(built)) install('precomp', built)
        else {
          const alt = findBin(srcDir, 'precomp')
          if (alt) install('precomp', alt)
        }
        log('Precomp built from source')
      } catch (e: any) { log(`WARNING: Precomp build failed: ${e.message}. Install manually.`) }
    }
  }

  console.log('\n── Vendor install complete ──')
  console.log('All tools in:', VENDOR)
  console.log('')
  // List what we have
  const files = fs.readdirSync(VENDOR).filter(f => !fs.statSync(path.join(VENDOR, f)).isDirectory())
  console.log(`Binaries (${files.length}): ${files.join(', ')}`)
}

main().catch(e => { console.error(`\nError: ${e.message}`); process.exit(1) })
