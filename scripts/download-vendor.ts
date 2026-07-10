import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RAW_PLATFORM = process.platform
const PLATFORM = RAW_PLATFORM === 'win32' ? 'win' : RAW_PLATFORM === 'darwin' ? 'mac' : RAW_PLATFORM
const VENDOR_DIR = path.join(__dirname, '..', 'vendor', PLATFORM)
const CACHE_DIR = path.join(__dirname, '..', 'vendor', '_cache')
const EXT = RAW_PLATFORM === 'win32' ? '.exe' : ''

function log(m: string) { console.log(`  ${m}`) }

function download(url: string, dest: string) {
  if (fs.existsSync(dest)) { log(`Cached: ${path.basename(dest)}`); return }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  log(`Downloading ${url}...`)
  execSync(`curl -fSL# "${url}" -o "${dest}" 2>&1`, { timeout: 180000, encoding: 'utf-8', maxBuffer: 1048576 })
}

function install(name: string, src: string) {
  const t = path.join(VENDOR_DIR, name + EXT)
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

function trySystemBin(name: string): string | null {
  try {
    const cmd = RAW_PLATFORM === 'win32'
      ? `where "${name}" 2>nul`
      : `which "${name}" 2>/dev/null || command -v "${name}" 2>/dev/null`
    const r = execSync(cmd, { encoding: 'utf-8' }).trim()
    return r || null
  } catch { return null }
}

async function main() {
  console.log(`\nNanoPack — Vendor Downloader (${PLATFORM})`)
  console.log(`Target: ${VENDOR_DIR}\n`)
  fs.mkdirSync(VENDOR_DIR, { recursive: true })
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  // ── zstd: try system first, then build from source ────────────
  const zstdBin = trySystemBin('zstd')
  if (zstdBin) {
    install('zstd', zstdBin)
    log('zstd — using system binary')
  } else {
    const t = path.join(VENDOR_DIR, 'zstd' + EXT)
    if (!fs.existsSync(t)) {
      if (RAW_PLATFORM === 'win32') {
        log('zstd — downloading Windows binary...')
        const src = path.join(CACHE_DIR, 'zstd-win64.zip')
        download('https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-v1.5.6-win64.zip', src)
        extractAndInstall(src, ['zstd.exe'])
      } else {
        log('zstd — building from source...')
        const src = path.join(CACHE_DIR, 'zstd-1.5.6.tar.gz')
        download('https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-1.5.6.tar.gz', src)
        const bd = fs.mkdtempSync('npk-build-')
        try {
          execSync(`tar xzf "${src}" -C "${bd}" 2>&1`, { stdio: 'pipe' })
          execSync(`make -j$(nproc) zstd -C "${bd}/zstd-1.5.6/programs" 2>&1`, { stdio: 'pipe', timeout: 120000 })
          const built = path.join(bd, 'zstd-1.5.6/programs/zstd')
          if (fs.existsSync(built)) { install('zstd', built); log('zstd — built from source') }
          else log('WARNING: zstd build failed')
        } finally { fs.rmSync(bd, { recursive: true, force: true }) }
      }
    }
  }

  // ── FFmpeg ────────────────────────────────────────────────────
  const ffmpegBin = trySystemBin('ffmpeg')
  if (ffmpegBin) {
    install('ffmpeg', ffmpegBin)
    const ffprobeBin = trySystemBin('ffprobe')
    if (ffprobeBin) install('ffprobe', ffprobeBin)
    log('ffmpeg/ffprobe — using system binaries')
  } else {
    ;['ffmpeg', 'ffprobe'].forEach(f => {
      if (fs.existsSync(path.join(VENDOR_DIR, f + EXT))) { log(`${f} — present`); return }
    })
    if (!fs.existsSync(path.join(VENDOR_DIR, 'ffmpeg' + EXT))) {
      if (RAW_PLATFORM === 'win32') {
        const src = path.join(CACHE_DIR, 'ffmpeg-win64.zip')
        download('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', src)
        extractAndInstall(src, ['ffmpeg.exe', 'ffprobe.exe'])
      } else {
        const src = path.join(CACHE_DIR, 'ffmpeg-release-amd64-static.tar.xz')
        download('https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz', src)
        extractAndInstall(src, ['ffmpeg', 'ffprobe'])
      }
    }
  }

  // ── OxiPNG ────────────────────────────────────────────────────
  const t = path.join(VENDOR_DIR, 'oxipng' + EXT)
  if (!fs.existsSync(t)) {
    if (RAW_PLATFORM === 'win32') {
      const src = path.join(CACHE_DIR, 'oxipng-win64.zip')
      download('https://github.com/oxipng/oxipng/releases/download/v10.1.1/oxipng-10.1.1-x86_64-pc-windows-msvc.zip', src)
      extractAndInstall(src, ['oxipng.exe'])
    } else {
      const src = path.join(CACHE_DIR, 'oxipng-x86_64-linux.tar.gz')
      download('https://github.com/oxipng/oxipng/releases/download/v10.1.1/oxipng-10.1.1-x86_64-unknown-linux-musl.tar.gz', src)
      extractAndInstall(src, ['oxipng'])
    }
  } else { log('oxipng — present') }

  // ── Video2X (Linux AppImage, Windows .exe) ────────────────────
  const v2x = path.join(VENDOR_DIR, 'video2x' + EXT)
  if (fs.existsSync(v2x)) { log('video2x — present') }
  else {
    const v2xUrl = PLATFORM === 'win32'
      ? 'https://github.com/k4yt3x/video2x/releases/download/6.4.0/video2x-windows-amd64.zip'
      : 'https://github.com/k4yt3x/video2x/releases/download/6.4.0/Video2X-x86_64.AppImage'
    const srcName = path.basename(v2xUrl)
    const src = path.join(CACHE_DIR, srcName)
    download(v2xUrl, src)
    if (v2xUrl.endsWith('.AppImage')) {
      fs.cpSync(src, v2x); fs.chmodSync(v2x, 0o755)
      log('Installed video2x (AppImage)')
    } else {
      extractAndInstall(src, ['video2x'])
    }
  }

  // ── Real-ESRGAN model ─────────────────────────────────────────
  const modelDir = path.join(VENDOR_DIR, 'models')
  fs.mkdirSync(modelDir, { recursive: true })
  const modelPath = path.join(modelDir, 'realesr-general-x4v3.pth')
  if (fs.existsSync(modelPath)) { log('Real-ESRGAN model — present') }
  else {
    download('https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth', modelPath)
    log('Real-ESRGAN model — downloaded')
  }

  console.log('\n✓ Vendor download complete.')
  console.log('\nManual installs still needed (place in ' + VENDOR_DIR + '):')
  console.log('  dwarfs/mkdwarfs — https://github.com/mhx/dwarfs')
  console.log('  hpatchz         — https://github.com/sisong/HDiffPatch')
  console.log('  xdelta3         — https://github.com/jmacd/xdelta (or apt: xdelta3)')
  console.log('  bsdiff          — https://github.com/mendsley/bsdiff')
  console.log('  cjxl/djxl       — https://github.com/libjxl/libjxl')
  console.log('  lepton          — https://github.com/dropbox/lepton')
  console.log('  precomp         — https://github.com/schnaader/precomp')
}

main().catch(e => { console.error(`\nError: ${e.message}`); process.exit(1) })
