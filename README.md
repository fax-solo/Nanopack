# NanoPack

**Precision archiving** — a modern desktop archiver with best-in-class compression, AI-powered video upscaling, and a native Electron UI.

[![License](https://img.shields.io/badge/license-MIT-blue)](#)

---

## Features

- **Pack** — Compress folders into `.npk` archives using two modes:
  - *Quick* — fast compression with solid savings
  - *Deep* — maximum compression (slower, best for archival)
- **Unpack** — Extract archives or mount them as virtual filesystems (FUSE-based)
- **Repack** — Update an existing archive with new source data
- **Verify** — Check archive integrity
- **AI Upscale** — Upscale video using Real-ESRGAN or Waifu2x engines
- **Admin Dashboard** — Usage analytics, active user tracking, per-service statistics

---

## Download

Pre-built binaries are available on the [Releases](https://github.com/your-org/nanopack/releases) page for Linux (AppImage, deb, rpm).

**System requirements:**
- Linux (x86_64)
- FUSE (for mount support)
- Vulkan-compatible GPU (recommended for upscaling)

---

## For Users

After launching NanoPack:

1. **Log in** — use `admin` / `admin` to access the admin dashboard, or register a new account / continue as guest
2. **Select a service** — Pack, Unpack, Repack, or Upscale from the sidebar
3. **Choose a mode** — Quick (fast) or Deep (maximum compression) at the bottom of the sidebar
4. **Run** — pick your files and hit the button

### Admin Dashboard

Log in with an admin account to view:

- Active users (today, this week, this month)
- New users (today, this month)
- Total operations (today, month, year, all-time)
- Input/output data volumes
- Usage breakdown by service
- Recent activity feed
- All registered users

---

## For Developers

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Rust** (for native node modules via `napi-rs`)
- **clang + LLVM** (for C/C++ vendor libraries)
- **FUSE 3** headers (`libfuse3-dev` on Debian/Ubuntu, `fuse3-devel` on Fedora)
- **Vulkan SDK** (optional, for GPU detection)

### Setup

```bash
git clone https://github.com/your-org/nanopack.git
cd nanopack
npm install
```

> Some native modules (`better-sqlite3`, `esbuild`) need their install scripts to run. Approve them with:
> ```bash
> npm install-scripts approve better-sqlite3
> npm install-scripts approve esbuild
> ```

### Development

```bash
npm run dev      # Launch in dev mode (Vite HMR + Electron)
npm run build:all  # Type-check and build all targets
npm run lint     # Lint source
```

### Project structure

```
src/
├── main/             # Electron main process
│   ├── auth/         # Auth (register, login, sessions, guest)
│   ├── database/     # SQLite schema & connection
│   ├── services/     # Pack, unpack, repack, upscale, verify logic
│   └── index.ts      # IPC handlers, app lifecycle
├── preload/          # Electron preload (contextBridge API)
├── renderer/         # Svelte 5 frontend
│   ├── components/   # AuthView, AdminView, PackView, etc.
│   └── App.svelte    # Root component with auth guard
vendor/               # C/Rust libraries (lepton, bsdiff, etc.)
```

### Database

NanoPack uses SQLite via `better-sqlite3`. The database is created automatically at:
- **Linux**: `~/.config/nanopack/nanopack.db` (or the `XDG` equivalents)
- **Dev fallback**: `.nanopack-data/nanopack.db` in the project root

Default admin credentials: `admin` / `admin`

### Building for production

```bash
npm run build:all
npx electron-builder build --linux
```

Outputs go to `release/`.

### License

MIT
