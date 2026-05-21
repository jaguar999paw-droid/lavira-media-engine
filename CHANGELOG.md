# Changelog

All notable changes to Lavira Media Engine are documented here.

---

## [1.6.0] — 2026-05-21

### Fixed — Windows setup bugs (all platforms ship this release)

This release is a **Windows-setup correctness fix**. No server-side code
changed. Users running a previous installer should re-download and re-run
`Install-Lavira.bat` from this release.

#### 🔴 Critical

- **`windows/start.bat` — wrong working directory (CWD bug)**
  `cd /d "%~dp0"` set the working directory to the `windows/` subfolder
  inside the ZIP. `docker-compose.yml`, `Dockerfile`, `src/`, and `public/`
  all live at the project root one level up. Every `docker compose up --build`
  call immediately failed with _"COPY failed: no source files"_ because Docker's
  build context pointed at an empty directory. Fixed: CWD is now resolved from
  `%USERPROFILE%\lavira-media-engine` (set by the installer) or the parent of
  the script's own directory, whichever exists.

- **`windows/Install-Lavira.bat` — malformed self-elevation on paths with spaces**
  The `Start-Process cmd -ArgumentList '/c "%~f0"'` call was split by `cmd.exe`
  at the first space inside the quoted path. On any machine where the bat lived
  in a directory with a space (e.g. `C:\Users\Jane Doe\Downloads\`) the elevated
  process silently exited without running anything. Fixed by doubling the inner
  quotes: `'/c \"\"%~f0\"\"'`.

- **`electron/package.json` — NSIS installer ran without administrator rights**
  `"allowElevation": false` + `"requestedExecutionLevel": "asInvoker"` meant
  the Electron installer exe asked for no elevation. Docker Desktop, WSL2, the
  OpenSSH server, and Windows Firewall rules all require admin rights — they
  silently failed or aborted, leaving the machine half-installed.
  Fixed: `"allowElevation": true` + `"requestedExecutionLevel": "requireAdministrator"`.

#### 🟠 High

- **`windows/setup-remote-access.ps1` — `Download-File` did not follow HTTP redirects**
  `System.Net.WebClient.DownloadFile` does not follow 301/302 redirects.
  The Tailscale CDN URL (`pkgs.tailscale.com/stable/tailscale-setup-latest.exe`)
  is a redirect — WebClient silently downloaded the redirect HTML instead of the
  exe, then tried to execute it → _"not a valid Win32 application"_. The `aka.ms/getwinget`
  winget fallback URL is also a redirect. Fixed: `Download-File` now uses
  `Invoke-WebRequest -UseBasicParsing` which follows redirects natively.

- **`windows/setup-remote-access.ps1` — MCP config written as SSE transport**
  Claude Desktop 0.7+ on Windows no longer auto-discovers SSE endpoints that
  aren't already running when Claude starts. Tools appeared in Settings → Developer
  but never loaded in chat. Fixed: the installer now writes a **stdio transport**
  MCP config entry (`command` + `args` + `env`) which Claude Desktop starts
  on demand. Falls back to SSE only if `node.exe` cannot be found.

#### 🟡 Medium

- **`windows/setup-remote-access.ps1` — Docker / Tailscale paths hardcoded to single location**
  Docker Desktop installs to `%LOCALAPPDATA%\Programs\Docker` on standard-user
  accounts (not `C:\Program Files\Docker`). Tailscale can land in Program Files
  or Program Files (x86). Single-path checks always missed the alternate location,
  producing spurious "could not be verified" warnings and triggering re-installs.
  Fixed: both tools now check multiple candidate paths via `Find-FirstPath` helper.

- **`windows/setup-remote-access.ps1` — Step 6 listed `update.bat` (does not exist)**
  `filesToCopy` included `"update.bat"` which was never added to the ZIP. Produced
  a `Warn` on every install and left users with no update path. Removed. Also fixed:
  Step 6 now copies `src/`, `public/`, and `assets/` directories to `LAVIRA_DIR` —
  they were in the ZIP but never copied to the install target, so the first
  `docker compose up --build` on a clean machine always failed.

- **`.github/workflows/windows-package.yml` — `assets/` missing from ZIP**
  The engine uses `ASSETS_DIR=./assets` for brand logos and card templates.
  The CI staging step did not copy `assets/` from the repo. All card generation
  calls at runtime returned 404 / `ENOENT assets/brand/logo_300.png`. Fixed:
  `assets/` is now included (with a graceful `mkdir -p` guard if empty).

- **`windows/setup-remote-access.ps1` — `ConvertTo-Json -Depth 6` truncated MCP config**
  The stdio MCP entry has a nested `env` sub-object. Depth 6 serialised it as
  `"env": "System.Collections.Hashtable"` (PowerShell's default string coercion).
  Fixed: `-Depth 10`.

### Changed

- **Version sync** — `package.json`, `electron/package.json`, and CHANGELOG are
  now all at `1.6.0`. The previous release shipped `package.json` at `1.5.2`,
  `electron/package.json` at `1.3.0`, and CHANGELOG topping at `1.5.1`, causing
  mismatched version strings in CI artifact names and the installer banner.

---

## [1.5.1] — 2026-04-30

### Added
- **`.github/workflows/windows-package.yml`** — CI now injects pre-filled `keys.env` from GitHub Actions secrets (`ANTHROPIC_API_KEY`, `PEXELS_API_KEY`, `GIPHY_API_KEY`) at build time. The file is written with `printf` (no leading whitespace) before zipping, so the Windows installer runs fully zero-touch — no Notepad prompt, no manual key entry. Keys are **never committed to git** (still gitignored); they live only inside the encrypted secrets store and are redacted in CI logs. Social publishing tokens (Instagram, Facebook, TikTok) are included blank for the user to fill later via Tailscale SSH.

### Changed
- **`windows/SETUP.md`** — Corrected Claude Desktop tool count from 52 → **77** in the installed components table.
- **`package.json`** — Version bumped to `1.5.1`.

### Notes
- To replace any key after install: SSH into the Windows machine via Tailscale → edit `~/lavira-media-engine/.env` → run `docker compose restart`.

---

## [1.5.0] — 2026-04-30

### Fixed
- **`src/engines/compositor.js`** — Removed `fontweight=bold` from all `drawtext` FFmpeg filter strings. FFmpeg 4.4.2 (Ubuntu 22.04) does **not** support `fontweight` as a `drawtext` option; it was triggering `Error reinitializing filters! Failed to inject frame into filter network: Option not found` (exit code 1) on every video overlay call. All four affected `drawtext` calls in the video compositor now use font-size scaling instead of weight hints.
- **`src/engines/logo-loader.js`** — Replaced network-first logo loading with a **local-first priority chain**: (1) in-process SVG buffer, (2) pre-rendered `assets/brand/logo_300.png` (fast resize via sharp), (3) local `assets/brand/logo.svg`, (4) network fetch as last resort. PNG cache is validated on start-up and rebuilt if corrupt (<200 bytes). This means the Lavira logo composites correctly even when `lavirasafaris.com` is unreachable.

### Changed
- **`README.md`** — Corrected MCP tool count from **52 → 77** in all five locations (feature list, architecture diagram, API health check example, MCP Integration section, and tools table header). Expanded tools reference table from 26 → 77 entries covering all current categories (Master Workflow, Video, Image, Audio, Branding, GIPHY, External Media, Sample Media, Jobs, Publishing, Video Script, Bookings, Schedule, Memory, AI, System).
- **`package.json`** — Version bumped to `1.5.0`.

---

## [1.4.0] — 2026-04-29

### Added
- **`src/engines/intelligence-router.js`** — Vision-aware routing layer that reads Claude Vision scene analysis signals (mood, brightness, subject, composition) and maps them to palette selection, hook tone, and CTA style. Posts now adapt their visual language to the source media rather than using static brand defaults.
- **`src/engines/image-vision.js`** — Claude Vision pipeline for analysing incoming images: returns `safeTextZone` (where to place overlay text without obscuring the subject), dominant colour palette, scene mood, and a short content descriptor fed into caption generation.
- **`sync.sh`** — Local ↔ GitHub sync script with `--release` (auto-bump or explicit tag), `--pull-only`, and `--status` modes. Handles stash/rebase/push in one command and triggers the CI release workflow automatically.

### Fixed
- **`windows/setup-remote-access.ps1`** — Installer security hardening: TLS 1.2 enforcement, signature verification for all downloaded binaries, non-interactive flag propagation so silent installs don't hang on UAC prompts.
- **`.github/workflows/windows-package.yml`** — `keys.env` whitespace corruption fixed (heredoc → `printf`); `-ScriptDir` parameter wired correctly end-to-end so the API-key step resolves the right path from inside the ZIP.
- **`src/mcp/server.js`** — Duplicate tool registration guard: a second MCP server instance no longer shadows the first, eliminating the tool-call collision bug that caused silent failures when Claude Desktop reconnected.

### Changed
- **Caption pipeline** — AI caption generation now receives intelligence-router signals as context, producing hooks and CTAs that match the visual mood of each post.
- **Card templates** — `intelligence-router` selects layout family (Minimal Float / Split Panel / Immersive Overlay) based on `safeTextZone` output, so text is never placed over the subject's face or key focal point.
- **`package.json`** — Version bumped to `1.4.0`.

---

## [1.2.1] — 2026-04-24

### Fixed
- **`windows/setup-remote-access.ps1`**: Added `-ScriptDir` parameter to `param()` block.
  `Install-Lavira.bat` was passing `-ScriptDir "%~dp0"` but the PS1 had no matching
  parameter, so PowerShell silently ignored it. `$SCRIPT_DIR` was set from
  `$PSCommandPath` (the PS1's own location — often a temp folder when launched from
  a ZIP), causing `keys.env` lookup to fail and the API-key step to fall through to
  the Notepad prompt or error out entirely. `$SCRIPT_DIR` now resolves as:
  `$ScriptDir` (if passed and valid) → `Split-Path -Parent $PSCommandPath` → `$PWD`.
- **`.github/workflows/windows-package.yml`**: Replaced `cat << EOF` heredoc with
  `printf` for writing `keys.env`. The indented heredoc was injecting 10 leading
  spaces before each `KEY=value` line; the downstream `sed` strip only fired after
  `zip` had already captured the malformed file. `printf '%s\n' ...` is whitespace-safe
  and removes the strip step entirely.

---

## [1.2.0] — 2026-04-24

### Added
- **`powershell-docs/setup-remote-access.ps1`** — one-shot Windows remote-access bootstrap: installs Tailscale (with tag:lavira), Docker Desktop, Claude Desktop, and the Lavira engine stack on a fresh Windows machine. Supports `-TailscaleAuthKey` and `-LaviraVersion` parameters; auto-elevates to Administrator.
- **`powershell-docs/windows-package.yml`** — GitHub Actions workflow that builds `lavira-media-engine-windows-setup.zip` on every `v*.*.*` tag, bundling `docker-compose.yml`, `.env.example`, `start.bat`, `SETUP.md`, `INSTALL.bat`, and `setup-remote-access.ps1` into a single downloadable ZIP attached to the GitHub Release.
- **`HANDOFFFFFF.md`** — strategic architecture analysis and MCP roadmap document.

---

## [1.1.1] — 2026-04-19

### Fixed
- **CI: remove `--prefer-offline`** — on a fresh runner with an empty npm cache this flag
  makes npm refuse all downloads and hard-fail. Replaced with `--no-audit --no-fund` which
  downloads normally but skips security-audit and funding nags (saves ~15 s per job).
- **CI: Node.js 20 → 22** — GitHub Actions is deprecating Node 20 runners. Bumped all three
  build jobs to Node 22 to silence warnings and ensure long-term compatibility.
- **CI: added `set -e`** to all build steps — surfaces the actual error line
  in logs instead of just "exit code 1".

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
