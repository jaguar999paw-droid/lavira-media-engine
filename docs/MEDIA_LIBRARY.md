# Media Library — Unified Output Directory

## Problem
Media from `create_post_workflow`, card generation, and the web interface was
scattered across `outputs/` (flat, 223+ files, mixed with JSON job metadata),
`outputs/mcp/`, `outputs/ui/`, and `posts/{instagram,facebook,tiktok,whatsapp}/`.
No single place to see "what got made, newest first."

## Solution
`media-library/` — a flat directory of **symlinks** into the real files.
No copying, no duplicated disk usage, no risk of drift from source.

- Location: `/home/kamau/lavira-media-engine/media-library/`
- Naming: `YYYY-MM-DD_HHMMSS__originalfilename.ext` (mtime-based)
- Sources scanned: `outputs/` (recursive) + `posts/` (recursive)
- File types: jpg, jpeg, png, gif, mp4, mov, mp3, wav (JSON job metadata excluded)

## Sort mechanism
Filename prefix = source file mtime. No index/DB required.

```bash
ls -1r media-library/ | head       # newest first
ls -1  media-library/ | tail       # oldest first
```

## Sync
Script: `scripts/sync-media-library.sh`
- Clears stale symlinks, rebuilds from current source files
- Idempotent — safe to run anytime
- Automated via cron: `*/15 * * * *`, logs to `scripts/sync.log`

Manual run: `./scripts/sync-media-library.sh`

## Architecture note
Verified 2026-07-01: only one process runs — `src/mcp/server.js` (single
Node/Express process, pid confirmed via `ps aux`). The `src/mcp/servers/`
files (ops-server.js, brand-server.js, design-server.js, media-server.js,
publish-server.js, search-server.js) are **not required/spawned** by the
running server — it implements all tool logic directly via `src/engines/*`
and `src/orchestrator/*` modules. So despite the "federated 6-server"
naming in the source tree, at runtime this is a single MCP server process,
not 6 separate spawned MCP servers.
