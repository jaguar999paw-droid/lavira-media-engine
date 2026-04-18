# 🦁 Lavira Media Engine

> **AI-powered safari marketing content engine** — generates branded Instagram posts, videos, and audio for safari companies, fully controllable via an MCP server that plugs directly into Claude Desktop or any MCP-compatible AI agent.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://docker.com)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Lavira Media Engine automates the full content pipeline for safari marketing:

- **Fetches real stock media** from Pexels (photos + videos) and GIPHY
- **Composites branded images** — overlays logo, destination, hook text, contact info — at Instagram/Facebook/TikTok resolution
- **Generates AI captions** with hooks, hashtags, and CTAs via Claude (Anthropic)
- **Processes audio** — normalises to broadcast standard (-16 LUFS), exports OGG/MP3
- **Publishes directly** to Instagram, Facebook, and TikTok (with tokens)
- **Runs a scheduler** — auto-generates daily promos at 06:00 EAT
- **Exposes 52 MCP tools** so Claude Desktop (or any AI agent) can control the entire pipeline conversationally

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
│  │     /outputs/*   │     │  52 tools exposed        │  │
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
# Expected: {"status":"ok","tools":52}
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

The MCP server is the primary interface for AI agents. It exposes **52 tools** covering the full content pipeline.

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

### Available MCP Tools (26)

| Category | Tool | What it does |
|----------|------|-------------|
| **Workflows** | `create_post_workflow` | End-to-end: fetch media → brand → caption → package |
| | `generate_auto_promo` | Zero-input: picks destination, fetches stock image, brands it |
| | `generate_promo_package` | AI caption + hook + CTA + hashtags for any destination |
| | `generate_marketing_payload` | Full marketing content package |
| **Media** | `fetch_optimal_media` | Fetch best-matching Pexels photo/video for a destination |
| | `search_stock_images` | Search Pexels by keyword |
| | `search_external_media` | Search Pexels + Unsplash with intelligent ranking |
| | `process_image` | Crop, rotate, color-correct an uploaded photo |
| | `process_video` | Auto-crop + watermark a video |
| | `process_audio` | Normalise audio to broadcast standard |
| **Branding** | `apply_overlay` | Add logo + contact bar to any image |
| | `make_ready_to_post` | Full branded overlay with hook, destination, promo type |
| | `generate_branded_media` | Analyze + brand in one call |
| | `generate_card_template` | One of 10 SVG card designs |
| | `generate_all_cards` | All 10 card variants at once |
| **GIPHY** | `search_giphy` | Search GIPHY for safari GIFs |
| | `use_giphy` | Download GIF + generate branded promo |
| **Jobs** | `list_recent_jobs` | History of generated content |
| | `get_job_status` | Poll a specific job |
| | `approve_job` | Mark job approved, log it |
| | `reject_job` | Flag job for redo |
| **Publishing** | `post_to_instagram` | Publish to Instagram (token required) |
| | `post_to_facebook` | Publish to Facebook Page |
| | `post_to_tiktok` | Publish to TikTok |
| | `publish_job` | Publish to multiple platforms at once |
| | `schedule_post` | Schedule for a specific time |
| **System** | `get_brand_info` | Full brand dictionary |
| | `get_api_status` | Which integrations are active |
| | `get_safari_packages` | All safari packages with pricing |
| | `get_destinations_to_feature` | LRU-ranked destination recommendations |
| | `get_daily_schedule` | Today's auto-generated schedule |
| | `trigger_daily_promo` | Run daily promo now |
| | `get_admin_settings` | Read persisted settings |
| | `update_admin_settings` | Update settings |
| **Cache** | `cache_stats` | External media cache info |
| | `cache_clear` | Clear all cached media |
| | `cache_prune` | Remove stale cache entries |

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
├── package.json
├── .env.example                    # Copy to .env
└── .gitignore
```

---

## Contributing

PRs welcome. Keep secrets in `.env`, never in source. Run `bash start.sh` before testing.

---

*Built for [Lavira Safaris](https://lavirasafaris.com) · Powered by Node.js, FFmpeg, Sharp, Anthropic Claude, and Pexels*
