# Changelog

All notable changes to Lavira Media Engine are documented here.

---

## [1.1.0] — 2026-04-19

### Fixed
- **CI workflow** — rewritten from scratch; `--publish never` stops electron-builder
  from trying to push to GitHub itself (was conflicting with the release job and
  causing the build to hang). Added `merge-multiple: true` to artifact download so
  all three platform builds land in a single flat directory before the release step.
- **Windows icon** — `icon.ico` was only 2 sizes (16 + 32 px). Rebuilt with 5 sizes
  (16, 32, 48, 64, 256 px) so the NSIS installer banner and taskbar icon both look sharp.
- **macOS icon** — `icon.icns` was a raw PNG masquerading as an ICNS file. Rebuilt as
  a proper ICNS container with 128, 256, and 512 px variants; DMG drag-to-Applications
  icon now renders correctly.
- **Linux build** — pinned runner to `ubuntu-22.04` (was `ubuntu-latest` → 24.04,
  which breaks `libarchive-tools`). Added missing `libx11-xcb1`, `libxcb-dri3-0`,
  `libdrm2`, `libgbm1` system deps needed for AppImage builds.
- **npm caching** — added `cache: 'npm'` to all three Node setup steps; cuts CI
  install time by ~60 s per job on warm runs.

### Changed
- GitHub Release notes now include a proper download table, setup wizard instructions,
  API key guide, and feature summary so Windows users know exactly what to do after
  downloading the `.exe`.

### Previously in [1.0.0] — 2026-04-18
- Electron desktop wrapper (`electron/main.js`) — starts the Express engine as a child
  process, opens the full Web UI in a native window.
- First-run setup wizard (`electron/setup.html` + `preload.js`) — collects API keys
  and writes `.env` before the engine starts; skipped on subsequent launches.
- System tray integration — app minimises to tray on window close; right-click menu
  has Open, Open in Browser, and Quit.
- Branded app icons for Windows (`.ico`), macOS (`.icns`), and Linux (`.png`) using
  Lavira green (`#2D6A4F`) + amber (`#F4A261`) palette.
- Bundled FFmpeg via `ffmpeg-static` + `ffprobe-static` — no system FFmpeg needed.
- `config.js` updated to resolve paths correctly when running inside an Electron
  packaged build (`process.resourcesPath/app/`).
- GitHub Actions workflow (`build-desktop.yml`) — builds Win/Mac/Linux installers and
  attaches them to the GitHub Release on every `v*.*.*` tag push.
