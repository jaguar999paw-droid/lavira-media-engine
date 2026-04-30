# 🦁 Lavira Media Engine — v1.5.0

> **AI-powered safari marketing content engine** — generates branded Instagram posts, videos, and audio for safari companies, fully controllable via an MCP server that plugs directly into Claude Desktop or any MCP-compatible AI agent.

[![Build & Release](https://github.com/jaguar999paw-droid/lavira-media-engine/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/jaguar999paw-droid/lavira-media-engine/actions/workflows/build-desktop.yml) [![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://docker.com)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Lavira Media Engine automates the full content pipeline for safari marketing:

- **Fetches real stock media** from Pexels (photos + videos) and GIPHY
- **Composites branded images** — overlays logo, destination, hook text, contact info — at Instagram/Facebook/TikTok resolution
- **Analyses media with Claude Vision** — detects safe text zones, scene mood, and dominant palette before compositing (`image-vision.js`)
- **Routes creative decisions intelligently** — `intelligence-router.js` maps vision signals to layout family, hook tone, and CTA style so every post fits its source media
- **Generates AI captions** with hooks, hashtags, and CTAs via Claude (Anthropic)
- **Processes audio** — normalises to broadcast standard (-16 LUFS), exports OGG/MP3
- **Publishes directly** to Instagram, Facebook, and TikTok (with tokens)
- **Runs a scheduler** — auto-generates daily promos at 06:00 EAT
- **Exposes 77 MCP tools** so Claude Desktop (or any AI agent) can control the entire pipeline conversationally
- **`sync.sh`** — one-command local ↔ GitHub sync with `--release` flag to tag and trigger CI automatically

---

## What's new in v1.5.0

| Area | Change |
|------|--------|
| 🎬 **Video processing** | Fixed `fontweight=bold` FFmpeg 4.x crash — `Option not found` error on `drawtext` filter eliminated |
| 🦁 **Logo loader** | Local-first priority chain: PNG cache → local SVG → network. Compositing never fails due to DNS/network issues |
| 📊 **MCP tool count** | Corrected from 52 → **77 tools** across all docs, README, architecture diagram |
| 🧠 **Intelligence Router** | Vision signals now drive palette, layout, hook tone, and CTA style per post |
| 👁 **Claude Vision pipeline** | Safe-text-zone detection + scene mood analysis before every composite |
| 🪟 **Windows installer** | TLS 1.2 enforcement, binary signature checks, `-ScriptDir` param fix, `keys.env` whitespace fix |
| 🔧 **MCP server** | Duplicate tool registration guard — no more silent failures on reconnect |
| 📦 **sync.sh** | One-command push + release tagging + tailnet snapshot |

See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Machine / Server                │
│                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │  lavira-engine   │     │       lavira-mcp         │  │
│  │  :4005           │     │       :4006              │  │
│  │                  │     │                          │  │
│  │  Express HTTP    │     │  MCP Server              │  │
│  │  ├─ Web UI (/)   │     │  ├─ SSE  → /sse          │  │
│  │  ├─ REST API     │     │  ├─ RPC  → /rpc          │  │
│  │  │  /api/*       │     │  └─ Health → /health     │  │
│  │  └─ Static files │     │                          │  │
│  │     /outputs/*   │     │  77 tools exposed        │  │
│  └────────┬─────────┘     └──────────┬───────────────┘  │
│           │                          │                   │
│           └──────── lavira-net ───────┘                  │
│                  (Docker bridge)                         │
│                  shared SQLite volume                    │
└─────────────────────────────────────────────────────────┘
         ↑                        ↑
   Browser / curl           Claude Desktop
   (Web UI + REST)          (MCP client)
```

### Key Files

```
lavira-media-engine/
├── src/
│   ├── server.js               # Express — Web UI + REST API (:4005)
│   ├── config.js               # All config from env (zero hardcodes)
│   ├── mcp/server.js           # MCP server — stdio or HTTP+SSE (:4006)
│   ├── engines/intelligence-router.js  # Vision signal → palette/hook/tone decisions
│   ├── engines/image-vision.js  # Claude Vision image analysis pipeline
│   ├── engines/
│   │   ├── promo.js            # Core branded image generation
│   │   ├── compositor.js       # Multi-layer Sharp compositing
│   │   ├── card-templates.js   # 10 SVG card templates
│   │   ├── external-media.js   # Pexels photo + video search
│   │   ├── giphy.js            # GIPHY GIF fetch
│   │   ├── audio.js            # FFmpeg audio processing
│   │   └── video.js            # FFmpeg video processing
│   ├── orchestrator/
│   │   ├── brand.js            # Brand dictionary (edit for your brand)
│   │   ├── memory.js           # SQLite job history
│   │   └── settings.js         # Admin settings (persisted)
│   ├── content/
│   │   ├── ai-captions.js      # Claude caption generation
│   │   └── captions.js         # Template captions (no API needed)
│   ├── routes/
│   │   ├── intake.js           # /api/intake/* — upload, giphy, auto
│   │   └── output.js           # /api/job/*, /api/files/*
│   ├── publishing/
│   │   ├── instagram.js        # Instagram Graph API
│   │   └── index.js            # Multi-platform publisher
│   └── scheduler/index.js      # node-cron daily promo at 06:00
├── public/index.html           # Single-file Web UI (no build step)
├── docker-compose.yml          # Two-service stack
├── Dockerfile                  # Node 20 + FFmpeg + Sharp
├── start.sh                    # ✅ Canonical startup script
├── mcp-stdio.sh                # Wrapper for Claude Desktop stdio mode
├── .env.example                # Copy → .env and fill in keys
└── .gitignore
```

### Port Map

| Port | Container | Purpose |
|------|-----------|---------|
| `4005` | `lavira-media-engine` | Web UI + REST API |
| `4006` | `lavira-mcp` | MCP server (SSE + RPC) |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | 24+ | Required for recommended setup |
| Docker Compose | v2 (bundled) | `docker compose` (not `docker-compose`) |
| Node.js | 20+ | Only needed for local/dev mode |
| FFmpeg | any | Only needed for local/dev mode |

---

## Setup — Docker (Recommended, all platforms)

### Linux / macOS

```bash
# 1. Clone
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine

# 2. Configure
cp .env.example .env
nano .env          # fill in your API keys (see Environment Variables below)

# 3. Start
bash start.sh

# 4. Open
# Web UI:  http://localhost:4005
# MCP SSE: http://localhost:4006/sse
```

### Windows — Quick Setup ⭐ Recommended

> **Fastest path for Windows users.** One zip, one double-click.

**[⬇ Download `lavira-media-engine-windows-setup.zip`](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest)**

1. Install **[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)** — free, ~500 MB — then restart your PC
2. Extract the zip anywhere, e.g. `C:\LaviraMedia\`
3. Double-click **`start.bat`**

The script checks for Docker, creates your `.env`, starts the engine, and opens **http://localhost:4005** in your browser.

> **API keys:** The public ZIP does **not** contain keys. You have two options:
> 1. **Zero-touch** — place a `keys.env` file (same folder as `Install-Lavira.bat`) before running. The installer reads it silently.
> 2. **Interactive** — run without `keys.env`; the installer opens Notepad once for you to paste your Anthropic key.
>
> Get a free key at https://console.anthropic.com/settings/keys
>
> See `SETUP.md` inside the zip for the full guide including Claude Desktop MCP setup.

---

### Windows (PowerShell)

```powershell
# 1. Clone
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine

# 2. Configure
Copy-Item .env.example .env
notepad .env        # fill in your API keys

# 3. Start (Docker Desktop must be running)
docker compose down --remove-orphans
docker compose up -d

# 4. Open browser → http://localhost:4005
```

### Windows (WSL2) — Recommended for Windows users

```bash
# Inside WSL2 terminal:
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
cp .env.example .env && nano .env
bash start.sh
# Browser: http://localhost:4005
```

> **Note for Windows users:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) with WSL2 backend enabled. Do not use the legacy Hyper-V backend.

### Verify it's running

```bash
curl http://localhost:4005/api/health
# Expected: {"status":"ok","engine":"Lavira Media Engine v3.0",...}

curl http://localhost:4006/health
# Expected: {"status":"ok","tools":77}
```

---

## Setup — Local Dev (no Docker)

Use this if you want to hack on the code without rebuilding containers.

### Linux / macOS

```bash
# Install Node.js 20 (if needed)
# macOS:  brew install node
# Ubuntu: sudo apt install nodejs npm
# Or use nvm: https://github.com/nvm-sh/nvm

# Install FFmpeg
# macOS:  brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg

git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
npm install
cp .env.example .env && nano .env

# Terminal 1 — Web UI + API
node src/server.js

# Terminal 2 — MCP server (HTTP mode)
node src/mcp/server.js --http 4006
```

### Windows (native, no WSL)

```powershell
# Install Node.js from https://nodejs.org (LTS)
# Install FFmpeg from https://ffmpeg.org/download.html
# Add FFmpeg to PATH (System Environment Variables)

git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
npm install
Copy-Item .env.example .env
notepad .env

# PowerShell — Terminal 1
node src/server.js

# PowerShell — Terminal 2
node src/mcp/server.js --http 4006
```

### macOS (Homebrew)

```bash
brew install node ffmpeg git
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
npm install
cp .env.example .env && open -e .env   # opens in TextEdit
node src/server.js &
node src/mcp/server.js --http 4006 &
```

---

## Environment Variables

Copy `.env.example` → `.env` and fill in your values. The engine runs in degraded mode without optional keys (captions fall back to templates, media search is disabled, etc.)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default: 4005) | Web UI + API port |
| `UPLOADS_DIR` | No | Path for uploaded files |
| `OUTPUTS_DIR` | No | Path for generated files |
| `ASSETS_DIR` | No | Path for brand assets (logo, fonts) |
| `DB_PATH` | No | SQLite database path |
| `ANTHROPIC_API_KEY` | **Recommended** | Claude AI — captions + video scripts. Get at [console.anthropic.com](https://console.anthropic.com) |
| `PEXELS_API_KEY` | **Recommended** | Stock photos + videos. Get free at [pexels.com/api](https://www.pexels.com/api/) |
| `GIPHY_API_KEY` | Optional | GIF search + download. Get at [developers.giphy.com](https://developers.giphy.com) |
| `INSTAGRAM_ACCESS_TOKEN` | Optional | Publishing to Instagram. Requires Meta Developer App |
| `INSTAGRAM_USER_ID` | Optional | Your Instagram Business account ID |
| `FACEBOOK_ACCESS_TOKEN` | Optional | Publishing to Facebook Page |
| `FACEBOOK_PAGE_ID` | Optional | Your Facebook Page ID |
| `TIKTOK_ACCESS_TOKEN` | Optional | Publishing to TikTok |

---

## MCP Integration

The MCP server is the primary interface for AI agents. It exposes **77 tools** covering the full content pipeline.

### Connect Claude Desktop

**Option A — stdio (local install, no Docker)**

Edit `~/.config/Claude/claude_desktop_config.json` (Linux/macOS) or  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "lavira-media-engine": {
      "command": "bash",
      "args": ["/absolute/path/to/lavira-media-engine/mcp-stdio.sh"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key-here",
        "PEXELS_API_KEY": "your-key-here",
        "GIPHY_API_KEY": "your-key-here"
      }
    }
  }
}
```

> On Windows use `"command": "bash"` with Git Bash or WSL, or `"command": "node"` with `"args": ["C:\\path\\to\\src\\mcp\\server.js"]`

**Option B — HTTP/SSE (Docker or remote server)**

```json
{
  "mcpServers": {
    "lavira-media-engine": {
      "url": "http://localhost:4006/sse"
    }
  }
}
```

After editing, **restart Claude Desktop**. You should see the Lavira tools listed in the tools panel.

### Connect any other MCP client

```
SSE endpoint:  http://localhost:4006/sse
RPC endpoint:  http://localhost:4006/rpc
Health check:  http://localhost:4006/health
```

### Available MCP Tools (77)

| Category | Tool | What it does |
|----------|------|-------------|
| **Master Workflow** | `smart_generate` | Natural-language master orchestrator — parse prompt and run full pipeline |
| | `create_post_workflow` | End-to-end: fetch media → brand → caption → package |
| | `generate_auto_promo` | Zero-input: picks destination, fetches stock image, brands it |
| | `generate_promo_package` | AI caption + hook + CTA + hashtags for any destination |
| | `generate_marketing_payload` | Full marketing content package |
| **Video** | `process_video` | Auto-crop + watermark a video for one platform |
| | `video_probe` | Inspect video: duration, resolution, fps, codec, audio |
| | `video_clip` | Trim a video segment by start + duration |
| | `video_encode_platform` | Encode video to exact platform spec (9 platforms) |
| | `video_add_watermark` | Burn Lavira brand watermark directly into video |
| | `video_to_reel` | Animate a static image into a Ken Burns zoom reel |
| | `full_video_post_pipeline` | Search Pexels → download → probe → clip → encode in one call |
| | `video_search_stock` | Search Pexels for portrait safari stock videos |
| **Image** | `process_image` | Crop, rotate, color-correct an uploaded photo |
| | `image_metadata` | Extract full metadata: dimensions, format, file size, megapixels |
| | `image_smart_crop` | Entropy-based smart crop to target ratio |
| | `image_compare` | Side-by-side A/B comparison of two images |
| | `image_ocr_prepare` | Pre-process image for OCR: greyscale + normalise + sharpen |
| | `image_analyze_colors` | Analyse dominant color, brightness, mood |
| | `image_export_platform` | Resize and optimise for a specific social platform |
| | `image_build_collage` | Build a 2×2 grid collage from 2–4 images |
| **Audio** | `process_audio` | Normalise audio to broadcast standard, export timed clips |
| | `mix_audio_with_media` | Attach music to image or video; images become 9:16 MP4 |
| **Branding** | `apply_overlay` | Add logo + contact bar to any image |
| | `make_ready_to_post` | Full branded overlay with hook, destination, promo type |
| | `build_post_package` | Apply overlays to all job outputs, return with caption |
| | `generate_branded_media` | Analyze + brand in one call with intelligent theming |
| | `generate_card_template` | One of 10 SVG card designs (hero, package, testimonial…) |
| | `generate_all_cards` | All 10 card variants for a destination at once |
| | `generate_overlay_plan` | Analyse safe-text zones and return optimal positioning plan |
| | `analyze_content_theme` | Map animal/scene to creative theme (lion=power, etc.) |
| **GIPHY** | `search_giphy` | Search GIPHY for safari GIFs |
| | `use_giphy` | Download GIF as MP4 + generate branded promo |
| **External Media** | `search_stock_images` | Search Pexels by keyword (images) |
| | `search_external_media` | Search Pexels + Unsplash with intelligent ranking |
| | `fetch_optimal_media` | Fetch best-matching media for a destination/theme |
| | `cache_stats` | External media cache info |
| | `cache_clear` | Clear all cached media |
| | `cache_prune` | Remove stale cache entries (>30 days) |
| **Sample Media** | `list_sample_media` | List bundled sample media by destination/type/theme |
| | `get_sample_media` | Get sample files for a destination (test without upload) |
| | `process_sample_as_test` | Run full pipeline on a sample — demo mode |
| | `batch_process_samples` | Process all samples in a destination folder |
| **Jobs** | `list_recent_jobs` | History of generated content with status |
| | `get_job_status` | Poll a specific job |
| | `approve_job` | Mark job approved, log it |
| | `reject_job` | Flag job for redo |
| | `get_share_package` | Caption, hook, hashtags, per-platform download links |
| | `list_output_files` | List all files in outputs directory |
| | `delete_output_file` | Delete a specific output file |
| | `save_to_posts` | Copy output to posts/ subfolder |
| | `list_posts` | List files in posts/ directory |
| | `cleanup_old_outputs` | Delete output files older than N days |
| **Publishing** | `post_to_instagram` | Publish to Instagram Reels, Feed, or Stories |
| | `post_to_facebook` | Publish to Facebook Page |
| | `post_to_tiktok` | Publish to TikTok |
| | `publish_job` | Publish to multiple platforms at once |
| | `schedule_post` | Schedule job for a specific time |
| **Video Script** | `generate_video_script` | Structured multi-part script with timing, hook, B-roll, music mood |
| **Bookings** | `record_booking` | Manually record a confirmed safari booking |
| | `trigger_post_booking_flow` | Auto-generate social content for a booking |
| | `list_booking_events` | Recent bookings with guest details and travel dates |
| **Schedule** | `get_daily_schedule` | Today's auto-generated promo schedule |
| | `trigger_daily_promo` | Run daily promo now (normally 06:00 EAT) |
| **Memory** | `get_user_memory` | Read Lavira user memory + productivity profile |
| | `update_user_memory` | Append or replace a memory section |
| | `get_destination_rotation_status` | Per-destination posting frequency and LRU priority |
| | `check_content_duplicate` | Check if a caption is too similar to a recent post |
| **AI** | `ask_claude` | Send custom prompt to Claude AI |
| **System** | `get_brand_info` | Full brand dictionary: name, contacts, destinations, packages |
| | `get_api_status` | Which API integrations are active |
| | `get_safari_packages` | All safari packages with pricing |
| | `get_destinations_to_feature` | LRU-ranked destination recommendations |
| | `get_admin_settings` | Read persisted settings |
| | `update_admin_settings` | Update settings |
| | `get_engine_health` | FFmpeg status, disk space, active jobs, all API statuses |
| | `list_upload_files` | List files in uploads directory |

### Example Conversations with Claude

Once connected, you can say:

```
"Generate an Instagram post for Amboseli today"
"Create a branded post about Masai Mara with an elephant photo"
"What destination should I feature today?"
"Generate all 10 card templates for Diani Beach"
"Search for a safari GIF and make it ready to post"
"Show me the last 5 jobs"
"Post job abc123 to Instagram"
```

---

## Web UI

Open `http://localhost:4005` in your browser after starting.

The UI lets you:
- **Upload** photos, videos, or audio
- **Auto-generate** branded posts with one click
- **Browse** generated outputs and download per-platform files
- **Approve / reject** jobs
- **Search GIPHY** and turn GIFs into branded promos
- **Configure** admin settings and social tokens

---

## Avoid Port Conflicts (Important)

The engine uses ports 4005 and 4006. If you see "connecting..." on the UI or MCP connection failures:

```bash
# Check what's on the ports
sudo lsof -i :4005 -i :4006

# Kill non-Docker processes on those ports
kill $(lsof -ti :4005 :4006)

# Or just run the startup script — it handles this automatically
bash start.sh
```

**Never run `node src/server.js` and Docker at the same time** — they will conflict on port 4005.

---

## Customising for Your Brand

Edit `src/orchestrator/brand.js` — this is the brand dictionary:

```js
const BRAND = {
  name:     'Your Company Name',
  website:  'https://yourwebsite.com',
  phone:    '+1 234 567 8900',
  email:    'info@yourcompany.com',
  destinations: ['Location A', 'Location B', ...],
  // ...
};
```

All overlays, captions, and card templates pull from this file. No other files need editing for a rebrand.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| UI stuck on "connecting..." | Engine container not running | `bash start.sh` |
| UI stuck on "connecting..." | Port conflict (bare-metal node vs Docker) | `kill $(lsof -ti :4005)` then `bash start.sh` |
| MCP tools not showing in Claude | Wrong config path or typo | Check `claude_desktop_config.json`, restart Claude |
| `SQLITE_BUSY` error | Two writers on same DB | Always use `bash start.sh` — it starts MCP in read-only mode |
| `sharp` install error | Missing native deps | Use Docker — it handles native deps cleanly |
| FFmpeg not found (local mode) | FFmpeg not installed / not in PATH | Install FFmpeg for your OS (see Setup section) |
| 401 on `/mcp` endpoint | ssh-shell-mcp auth token | Unrelated to Lavira — this is a different MCP server |

---

## Project Structure (full)

```
lavira-media-engine/
├── src/
│   ├── config.js
│   ├── server.js                   # Web UI + REST API
│   ├── mcp/server.js               # MCP server
│   ├── engines/
│   │   ├── audio.js
│   │   ├── card-templates.js       # 10 SVG card designs
│   │   ├── compositor.js
│   │   ├── dynamic-templates.js
│   │   ├── external-media.js       # Pexels integration
│   │   ├── giphy.js
│   │   ├── image.js
│   │   ├── media-augmentation.js
│   │   ├── media-cache.js
│   │   ├── media-library.js
│   │   ├── media-mixer.js
│   │   ├── promo.js
│   │   ├── video.js
│   │   ├── video-script.js
│   │   ├── card-templates.js   # 3 layout families (Minimal Float, Split Panel, Immersive Overlay)
│   │   ├── image-vision.js     # Claude Vision — safeTextZone + scene analysis
│   │   ├── post-defaults.js    # Smart defaults resolver (mood/season/LRU)
│   │   └── context-pools.js    # Curated copy vocabulary (hooks, CTAs, angles)
│   ├── orchestrator/
│   │   ├── brand.js                # ← Edit this for your brand
│   │   ├── memory.js               # SQLite job history
│   │   └── settings.js
│   ├── content/
│   │   ├── ai-captions.js
│   │   └── captions.js
│   ├── routes/
│   │   ├── intake.js
│   │   └── output.js
│   ├── publishing/
│   │   ├── index.js
│   │   └── instagram.js
│   └── scheduler/index.js
├── public/index.html               # Web UI (no build step)
├── assets/                         # Brand assets (logo, fonts)
├── samples/                        # Sample media for testing
├── docker-compose.yml
├── Dockerfile
├── start.sh                        # ← Always use this to start
├── start-clean.sh                  # Full rebuild + restart
├── mcp-stdio.sh                    # Claude Desktop stdio wrapper
├── sync.sh                         # ← Local ↔ GitHub sync + release tagging
├── package.json
├── .env.example                    # Copy to .env
└── .gitignore
```

---


---

## Desktop App (Windows / macOS / Linux)

> **No terminal, no Docker, no Node.js needed.** The desktop app bundles everything.

Download the installer for your platform from the [**Releases page**](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest):

| Platform | File | What to do |
|---|---|---|
| **Windows 10/11** | `Lavira-Media-Setup-*.exe` | Double-click → Next → Finish → open from Desktop |
| **macOS 12+** | `Lavira-Media-Setup-*.dmg` | Open DMG → drag to Applications → launch |
| **Linux** | `Lavira-Media-Setup-*.AppImage` | `chmod +x *.AppImage` → double-click |
| **Linux (deb)** | `Lavira-Media-Setup-*.deb` | `sudo dpkg -i *.deb` → find in app menu |

### What the desktop app does differently from Docker

The Electron wrapper starts the Express engine as a child process inside the same app bundle. You get the exact same Web UI at `localhost:4005` and MCP server at `localhost:4006` — but instead of a terminal and Docker, you just double-click an icon.

```
┌─────────────────────────────────────────────────────┐
│  Lavira Media (Electron window)                     │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  Web UI — http://localhost:4005             │   │
│  │  (the full studio, rendered in-app)         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  System tray icon → right-click:                    │
│    Open Lavira | Open in Browser | Quit             │
└─────────────────────────────────────────────────────┘
       ↑
  MCP Server still on :4006 — connect Claude Desktop
  the same way as the Docker setup
```

### First launch — Setup Wizard

On first run, a setup wizard asks for your API keys before starting the engine:

| Key | Required? | Get it at |
|---|---|---|
| **Anthropic API key** | ✅ | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **Pexels API key** | Optional (free) | [pexels.com/api](https://www.pexels.com/api/) |
| **GIPHY API key** | Optional (free) | [developers.giphy.com](https://developers.giphy.com/) |

Keys are saved to a `.env` file in the app's data directory. You can update them anytime via the Settings panel in the Web UI.

### Building from source

```bash
# 1. Clone and install root deps
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
npm install

# 2. Install Electron build deps
cd electron && npm install && cd ..

# 3. Run in dev mode (opens a window, uses your local .env)
cd electron && npm start

# 4. Build installer for your current platform
cd electron
npm run build:win    # Windows → electron/dist/*.exe
npm run build:mac    # macOS  → electron/dist/*.dmg
npm run build:linux  # Linux  → electron/dist/*.AppImage + *.deb
```

## Contributing

PRs welcome. Keep secrets in `.env`, never in source. Run `bash start.sh` before testing.

---

*Built for [Lavira Safaris](https://lavirasafaris.com) · Powered by Node.js, FFmpeg, Sharp, Anthropic Claude, and Pexels*
