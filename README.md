# Lavira Media Engine

> AI-powered safari content engine — turns a destination name into a fully branded, ready-to-publish social post, orchestrated end-to-end through Claude via MCP.

[![Release](https://img.shields.io/github/v/release/jaguar999paw-droid/lavira-media-engine)](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Lavira takes a destination and produces a complete, branded social media post — stock photo or video, logo overlay, AI-written caption, hashtags — ready to publish to Instagram, Facebook, TikTok, or WhatsApp Status. Every capability is exposed as an MCP tool, so the entire content pipeline (search, edit, brand, caption, schedule, publish) is driven conversationally from Claude Desktop rather than a bespoke UI.

Every post also runs through the **Signature Variance Engine**: template, layout, palette, logo position, hook, CTA, and caption angle are drawn from curated brand-safe pools with a no-repeat-last-5 rule, so successive posts stay on-brand without looking identical.

---

## Architecture: federated MCP servers

Split into six focused sub-servers under `src/mcp/servers/`, each owning one slice of the pipeline (keeps blast radius small per change, easier tool surface for Claude to reason about). A single-process monolith (`src/mcp/server.js`) implementing the same tools also still exists for simpler deployments.

| Server | Responsibility | Tools |
|---|---|---|
| **lavira-media** | Sourcing/processing images & video — crop, watermark, encode, per-platform export | 17 |
| **lavira-search** | Ranking and selecting external stock media (Pexels/GIPHY) for a content brief | 8 |
| **lavira-publish** | Posting finished content to Instagram/Facebook/TikTok/WhatsApp, scheduling, bookings | 13 |
| **lavira-brand** | Brand identity, AI captions, destination/package data, memory | 13 |
| **lavira-design** | Cards, overlays, compositor, intelligence-router — the branding/layout layer | 12 |
| **lavira-ops** | Admin settings, cache management, health checks, cleanup | 11 |

See **[CONTEXT.md](CONTEXT.md)** for current registration/runtime status and the active plan.

---

## Quick setup (Linux/macOS)

```bash
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
cp .env.example .env && nano .env   # add ANTHROPIC_API_KEY, PEXELS_API_KEY, etc.
npm install
npm start
# Web UI: http://localhost:4005
```

**Claude Desktop wiring** — add the desired server(s) to `claude_desktop_config.json` (`~/.config/Claude/claude_desktop_config.json` on Linux):

```json
{
  "mcpServers": {
    "lavira-media": { "command": "node", "args": ["/absolute/path/to/lavira-media-engine/src/mcp/servers/media-server.js"] }
  }
}
```

Repeat per server (or point a single `lavira-media-engine` entry at `src/mcp/server.js` for the monolith instead). Restart Claude Desktop after editing.

For Windows, see the packaged installer in [Releases](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest) and `windows/SETUP.md`.

---

## Project state & history

- **[CONTEXT.md](CONTEXT.md)** — the living source of truth for this project: current state, what's registered/running, known issues, and the active plan for the next agent. Start here.
- Historical per-session handoff docs have been consolidated into `CONTEXT.md` and removed to avoid drift between multiple stale documents.

---

*Built for [Lavira Safaris](https://lavirasafaris.com) · Node.js · Docker · FFmpeg · Sharp · Anthropic Claude · Pexels*
