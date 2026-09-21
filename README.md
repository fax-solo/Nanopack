# NanoPack

**Precision archiving** — a modern local desktop archiver with best-in-class compression, AI-powered video upscaling, and a native Electron UI.

[![License](https://img.shields.io/badge/license-MIT-blue)](#)

---

## Features

- **Pack** — Compress folders into `.npk` archives using two modes:
  - *Quick* — fast compression with solid savings
  - *Deep* — maximum compression (slower, best for archival)
- **Unpack** — Extract archives (cross-platform) or mount them as virtual filesystems (Linux/macOS only)
- **Repack** — Update an existing archive with new source data
- **Verify** — Check archive integrity (streamed hash + corruption detection)
- **AI Upscale** — Upscale video using Real-ESRGAN or Anime4K engines
- **Size estimate** — Live compression preview before packing (sampled zstd compression)
- **100% local** — no accounts, no login, no server; everything runs on your machine

---

## Download

Pre-built Windows binaries are available on the [Releases](https://github.com/your-org/nanopack/releases) page.

**System requirements:**
- **Linux** (x86_64) — recommended
- **Windows** 10 build 1803 or later (for `tar.exe`)
- **macOS** — planned
- **FUSE** (for Instant Mount on Linux/macOS — `libfuse3` on Linux, FUSE-T or macFUSE on macOS)
- **vulkan-tools** (optional, for non-NVIDIA GPU detection on Linux)
- **Vulkan-compatible GPU** (recommended for upscaling)

### Feature availability by platform

| Feature        | Windows | Linux | macOS |
|----------------|---------|-------|-------|
| Pack (Quick)   | ✓       | ✓     | ✓     |
| Pack (Deep)    | ✓       | ✓     | ✓     |
| Unpack (Quick) | ✓       | ✓     | ✓     |
| Unpack (Deep)  | ✓       | ✓     | ✓     |
| Instant Mount  | ✗       | ✓     | ✓     |
| Repack         | ✓       | ✓     | ✓     |
| Verify         | ✓       | ✓     | ✓     |
| AI Upscale     | ✓       | ✓     | ✓     |

---

## For Users

After launching NanoPack, the app opens straight to the workspace:

1. **Select a service** — Pack, Unpack, Repack, or Upscale from the sidebar
2. **Choose a mode** — Quick (fast) or Deep (maximum compression) at the bottom of the sidebar
3. **Run** — pick your files and hit the button

No sign-in required. Everything is stored locally on your computer.

---

## For Developers

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **clang + LLVM** (for C/C++ vendor libraries)
- **FUSE 3** headers (`libfuse3-dev` on Debian/Ubuntu, `fuse3-devel` on Fedora)
- **vulkan-tools** (optional, for non-NVIDIA GPU detection on Linux — `vulkaninfo` binary)
- **Vulkan SDK** (optional, for GPU detection)

### Setup

```bash
git clone https://github.com/your-org/nanopack.git
cd nanopack
npm install
```

### Development

```bash
npm run dev        # Launch in dev mode (Vite HMR + Electron)
npm run build:all  # Type-check and build all targets
npm test           # Run the test suite (roundtrip, repack, safe-join)
```

### Project structure

```
src/
├── main/             # Electron main process
│   ├── container/    # NPK format (read/write/patch) + tests
│   ├── services/     # Pack, unpack, repack, upscale, verify logic
│   └── index.ts      # IPC handlers, app lifecycle
├── preload/          # Electron preload (contextBridge API)
├── renderer/         # Svelte 5 frontend
│   └── components/   # PackView, UnpackView, RepackView, UpscaleView, etc.
vendor/               # C/Rust libraries (lepton, bsdiff, etc.)
tests/                # Test runner
```

### Configuration

User settings (theme, output directory, thread count) are stored in a local JSON config next to the app data directory:
- **Linux**: `~/.config/nanopack/config.json`
- **Windows**: `%APPDATA%\nanopack\config.json`

### Building for production

```bash
npm run build:all
npx electron-builder build --linux   # or --win, --mac
```

Outputs go to `release/`.

### License

MIT