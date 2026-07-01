# 🦁 Lavira Media Engine

> AI-powered social media content engine for **Lavira Safaris** — turns a
> destination name into a branded, ready-to-post image, video, or story in
> one call, controllable conversationally via MCP or through a web dashboard.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://docker.com)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Lavira Media Engine automates the full content pipeline for safari marketing:

- **Sources media** — fetches stock photos/video from Pexels and GIFs from GIPHY, or accepts uploads
- **Understands the image** — Claude Vision analyses scene mood, dominant palette, and safe text zones before anything is composited
- **Routes creative decisions** — an intelligence router maps those vision signals to layout, hook tone, and CTA style, so every post fits its source media instead of using one fixed template
- **Composites branded output** — logo, destination name, hook text, and contact info layered onto the image at Instagram/Facebook/TikTok resolution, across 10 card template families
- **Writes the copy** — Claude generates captions, hooks, hashtags, and CTAs (with a template-based fallback that needs no API key)
- **Processes audio/video** — normalises loudness, trims to platform-exact durations, exports per-platform variants
- **Publishes for real** — Instagram, Facebook, TikTok (v2 Content Posting API), Twitter/X (OAuth1a), and WhatsApp all have live publishers, not stubs
- **Keeps a rotation** — least-recently-used destination tracking so the same place doesn't get featured twice in a row
- **Runs a daily scheduler** — auto-generates a promo at 06:00 EAT for review/approval
- **Receives webhooks** — Meta/TikTok/WhatsApp delivery and engagement events land on `/api/webhooks`

---

## Overview

Two things run side by side against the same content pipeline and the same
SQLite job history:

1. **An MCP server** — for AI agents (Claude Desktop, or any MCP-compatible client) to drive the pipeline conversationally
2. **A web interface** — Express + a single-page dashboard for a human to do the same thing by clicking

Both talk to the same underlying engines, so a post started by Claude and one started from the browser behave identically and show up in the same job history.

---

## AI architecture (MCP server)

`src/mcp/server.js` exposes **78 tools** covering intake, generation,
publishing, scheduling, and diagnostics — grouped roughly as:

| Group | Examples |
|---|---|
| Intake | `process_video`, `process_image`, `process_audio`, `search_giphy`, `use_giphy` |
| Generation | `generate_branded_media`, `generate_all_cards`, `generate_card_template`, `create_post_workflow`, `smart_generate` |
| Intelligence | `analyze_content_theme`, `generate_overlay_plan`, `fetch_optimal_media` |
| Publishing | `post_to_instagram`, `post_to_facebook`, `post_to_tiktok`, `post_to_twitter`, `publish_job` (all support `dry_run`) |
| Scheduling | `get_daily_schedule`, `trigger_daily_promo`, `get_destinations_to_feature`, `get_destination_rotation_status` |
| Ops/diagnostics | `get_engine_health`, `get_api_status`, `cache_stats`, `list_output_files`, `list_posts` |

Underneath, tool calls delegate to a set of focused engine modules
(`src/engines/`) rather than the tool layer doing the work itself:

- **`intelligence-router.js`** + **`image-vision.js`** — the decision layer; every generation call passes through vision analysis first
- **`promo.js`** / **`compositor.js`** / **`card-templates.js`** — the actual image compositing (Sharp-based, 10 SVG template families)
- **`external-media.js`** / **`giphy.js`** — stock media sourcing
- **`audio.js`** / **`video.js`** / **`video-enhanced.js`** — FFmpeg-backed processing
- **`ai-captions.js`** — Claude-generated copy, with a non-AI fallback in `captions.js`

Job state, destination rotation, and content-duplicate checks are backed by
SQLite (`src/orchestrator/memory.js`), so the engine knows what it posted
recently regardless of whether the call came from Claude or the browser.

**Note on the `src/mcp/servers/` folder:** it holds a set of per-domain server
files (ops, brand, media, design, publish, search) from an earlier federated-
architecture design. At runtime today, only the monolithic `src/mcp/server.js`
process is actually started — those files aren't required by it. Worth
knowing if you're navigating the source tree.

---

## Web interface

`src/server.js` (Express) serves both a dashboard and a REST API from one process:

- **Dashboard** — `public/index.html`, a single-page UI for browsing destinations, triggering generation, reviewing the daily schedule, and publishing jobs without touching an AI client
- **REST API** — `/api/intake/*` (upload, GIPHY, auto-generate), `/api/job/*` (status, bundle, publish), `/api/schedule/*` (today's promo, approve), `/api/publishing/status`, `/api/bookings`, `/api/webhooks`, `/api/admin/settings`, `/api/cache/*`
- **Static output serving** — generated media is served directly from `/outputs`, `/outputs/mcp`, `/outputs/ui`, and `/posts`

The web interface and the MCP server are two entry points into the same
engine layer — there's no functionality exclusive to one or the other.

---

## Tech stack

Node.js · Express · Sharp (image compositing) · FFmpeg (audio/video) ·
better-sqlite3 (job history) · Claude (vision + captions) · Pexels & GIPHY
(media sourcing) · Docker (deployment) · Electron (desktop packaging)

---

## Project layout

```
lavira-media-engine/
├── src/
│   ├── server.js          # Web dashboard + REST API
│   ├── mcp/server.js      # MCP server — 78 tools
│   ├── engines/           # Compositing, vision, audio/video, media sourcing
│   ├── orchestrator/      # Brand config, job memory, settings
│   ├── content/           # Caption generation (AI + template fallback)
│   ├── publishing/        # Instagram, Facebook, TikTok, Twitter, WhatsApp
│   ├── routes/            # Intake, output, bookings, webhooks
│   └── scheduler/         # Daily auto-promo
├── public/                 # Web dashboard (single-page)
├── docs/                   # Project documentation
├── scripts/                 # Maintenance scripts
└── electron/                # Desktop app packaging
```

---

## Documentation

See [`CHANGELOG.md`](CHANGELOG.md) for release history and
[`docs/`](docs/) for architecture notes and workflow write-ups.

---

## License

MIT — see [LICENSE](LICENSE).
