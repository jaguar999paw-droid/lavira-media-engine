# CONTEXT.md — Lavira Media Engine, Consolidated State
> Generated: 2026-07-06 by Claude, from a full read of every `.md` doc in the workspace + a live verification pass (git log, running processes, Claude Desktop config, filesystem). This file is the single up-to-date picture; the individual handoff docs below are kept for history/detail but are not all mutually consistent — where they conflict, this file states what's actually true on disk right now.

---

## 1. What this system is

A Node.js MCP server (`v1.6.0`) that turns a destination name or a raw prompt into a fully branded, ready-to-publish safari social media post for **Lavira Safaris** (Nairobi, Kenya) — sourcing stock/owned media, applying brand overlays, writing AI captions, and (optionally) publishing to Instagram/Facebook/TikTok/WhatsApp — all driven conversationally through Claude via MCP.

Core loop: `Prompt → Claude → MCP tool calls → Pexels/GIPHY/FFmpeg/Sharp/Claude → branded output file → outputs/ (or posts/ + publish)`

---
## 1.1 THIS WAS A PROMPT WHOSE ATTENTION WAS CUT MID_TASK>>"Handle the most appropriate long-term fix for the issues you encountered while using the tools and document first inside a section in CONTEXT.md[the only AI-reasoning and memory documentation doc] for lavira activities. TEst more tools and toolsets + rate the effectiveness of  their functionality and when a tool call goes wrong. update this to claude memory > "notify me before choosing caveats to get the job done[]epecially when the nature of the promp/intent is to test." Use lavira media engine MCP servers and specify for me how to be specifying to you the choice of  MCP servers to use while working on lavira projects."
## 2. ⚠️ Verified current state vs. what the docs claim (read this first)

Several docs (`NEXT_AGENT_HANDOFF.md`, `INFRA-SHIFT.md`, `README.md`) describe a "federated 6-server MCP cluster" as live and registered. A live check today shows a different reality:

| Claim in docs | Verified truth on disk (2026-07-06) |
|---|---|
| "All 6 servers registered in `claude_desktop_config.json`" (NEXT_AGENT_HANDOFF.md) | `~/.config/Claude/claude_desktop_config.json` currently has **only `ssh-shell-mcp` registered** — no `lavira-*` entries, and no monolith entry either. None of the Lavira MCP servers are wired into Claude Desktop right now. |
| "Both the monolith and the federated servers are live simultaneously" | `ps aux` shows **no Lavira process running at all** — nothing on 4005/4006, no node process for any `server.js` or `servers/*.js`. |
| `docs/MEDIA_LIBRARY.md` (2026-07-01, separately): "only one process runs — `src/mcp/server.js`... the federated servers are not required/spawned" | Consistent with "nothing running now," but contradicts the "all 6 boot clean standalone" claim in the same week's other handoff doc. |
| 6 federated server files exist | Confirmed: `brand-server.js`, `design-server.js`, `media-server.js`, `ops-server.js`, `publish-server.js`, `search-server.js` all present in `src/mcp/servers/`, plus stale `.bak_*` copies from a 2026-06-30 inspection that should probably be deleted. |
| `variation-engine.js` + `dynamic-templates.js` rewrite (Signature Variance Engine) shipped | Confirmed on disk, plus `.bak_20260702_*` backup copies of both — also worth cleaning up once confidence is high. |
| Media library symlink dir + cron sync | Confirmed: 271 symlinks in `media-library/`, cron entry present (`*/15 * * * *`) and pointed at the right script. |
| Git: `variation-engine` commit pushed | Confirmed — `7f55928` is HEAD-ish (2 commits ahead of it exist: none; it's the tip). One untracked file: `READ-THIS-FIRST-CLAUDE.md` (this task's trigger doc, harmless, not yet gitignored/committed). |
| `outputs/` has ~223+ files per docs/MEDIA_LIBRARY.md | Now 287 files — growing, no cleanup cron currently configured for outputs/ itself (`cleanup_old_outputs` tool exists but nothing schedules it). |

**Bottom line: the engine's code is in good shape (variance engine wired, bugs fixed, federated server files exist), but nothing is currently running and nothing is currently registered with Claude Desktop.** The most useful next action is almost certainly re-registering (or deciding *not* to re-register) the MCP servers, not more feature work. See §7.

---

## 3. Architecture (as designed in code)

```
Claude (AI assistant)
    │
    ├── [if registered] lavira-media-engine (monolith, src/mcp/server.js, stdio)
    │
    └── [if registered] federated cluster, src/mcp/servers/:
          ├── lavira-media    — video/image/audio editing primitives (17 tools)
          ├── lavira-search   — stock + GIPHY + library search (8 tools)
          ├── lavira-publish  — social publishing, scheduling, bookings (13 tools)
          ├── lavira-brand    — brand context, AI captions, memory (13 tools)
          ├── lavira-design   — cards, overlays, compositor, intelligence-router (12 tools)
          └── lavira-ops      — health, cache, files, admin (11 tools)

Express REST API (src/server.js, port 4005) — separate, web UI backend, unaffected by MCP registration state.
```

**Engine root:** `/home/kamau/lavira-media-engine/`
**Key modules:** `src/engines/*` (compositor, promo, variation-engine, dynamic-templates, intelligence-router, context-pools, logo-loader, media-cache), `src/content/ai-captions.js`, `src/orchestrator/{brand,memory,intent}.js`, `src/publishing/*`.

---

## 4. What's actually working (verified via BUG_REPORT.md 26/26 pass + later sessions)

- Full post pipeline: fetch → brand → caption → package (`create_post_workflow`, `smart_generate`) — code-verified working through the Signature Variance Engine as of the 2026-07-02 session.
- **Signature Variance Engine** (`variation-engine.js`): randomizes template/layout/palette/logo-position/hook/CTA/caption-angle from curated pools, enforces no-repeat-last-5, persists rolling history to `lavira.db` (falls back to in-memory).
- Font-family SVG bug (malformed XML breaking `ModernBold`/`EditorialWarm` pairings) — fixed and verified across all 5 templates × 3 pairings.
- Destination misidentification bug ("Ol Pejeta" → "Nakuru") — fixed via keyword map reorder.
- `image_metadata`/`image_analyze_colors`/`image_compare` outputs-dir resolution bug — fixed.
- Windows installer chain (CWD bug, elevation, MCP stdio transport, redirect-following downloads) — fixed as of v1.6.0.
- `media-library/` unified symlink view — live, cron-synced every 15 min.

## 5. What's broken or blocked right now

| Issue | Detail | Blocking? |
|---|---|---|
| **Nothing registered in Claude Desktop** | See §2 — this blocks *everything* MCP-related until resolved | 🔴 Yes |
| Anthropic API credits depleted (as of last check) | AI captions/hooks/video-scripts fall back to static templates; `ask_claude` returns clean `{error, status:'no_credits'}` instead of crashing, but real AI generation is off | 🔴 Yes, for AI-authored content |
| Social publishing stubs | Instagram has a real Graph API integration; TikTok and Facebook publishing are still stub/partial per multiple docs (status conflicts — see below) | 🟡 Needs re-verification |
| `publish_job` filePath dict/string mismatch | `broadcastToAll` receives `{platform: path}` but publishers expect plain strings | 🟡 |
| WhatsApp send uses `link:` (public URL) | Local files can't be sent without an upload step or tunnel | 🟡 |
| Live key exposure (historical) | Live API keys were echoed once during a config inspection session; rotation was recommended in that session. **Verify keys were actually rotated** — this workspace's memory doesn't confirm completion. | 🔴 Verify |
| Stale `.bak_*` files in `src/mcp/servers/` and `src/engines/` | From 2026-06-09/06-30/07-02 inspection sessions | 🟢 Cleanup only |
| `MASTER_ANALYSIS_APRIL14.md` has `600` permissions (owner-only) | Deliberately restricted; not summarized in detail here out of respect for that boundary — flagged only for awareness | 🟢 |

**Status-conflict note:** `AGENT_HANDOFF.md`'s own summary table marks "Publishing: Incomplete... ✅ INSTAGRAM DONE" while its prose section says TikTok/Facebook are still stub. Treat "real API integration" claims as **Instagram-only, confirmed**; TikTok/Facebook/Twitter claims across different docs (`INFRA-SHIFT.md` mentions "TikTok v2, Twitter OAuth1a, WhatsApp webhooks" as already merged in commit `a31d896`) need a live functional test, not just a doc read, before being trusted.

---

## 6. Known bugs log (consolidated from BUGS.md / BUG_REPORT.md / NEXT_AGENT_HANDOFF.md)

1. ~~Double-path bug in media-cache~~ — fixed.
2. ~~outputs/ path resolution for image_metadata/colors/compare~~ — fixed.
3. AI calls fail on depleted credits — handled gracefully now, but still functionally blocked until credits are topped up.
4. ~~get_destination_rotation_status double-wrap~~ — fixed.
5. ~~Ol Pejeta/Nakuru misclassification~~ — fixed.
6. `publish_job` filePath type mismatch — open.
7. WhatsApp `link:`-only sending — open.
8. `get_engine_health` in federated `ops-server.js` doesn't call `rpc-core.getMetrics()` (monolith does) — open, minor parity gap.
9. `ai-captions.js` context sourcing is independent of `context-pools.js`/`intelligence-router.js` — intentional divergence, flagged for a future unification decision, not a bug.
10. `logo-loader.js` untested for cold-cache/first-fetch path — open, worth a test.

---

## 7. Recommended next steps (priority order)

1. **Decide on and execute MCP registration.** Nothing is currently wired into Claude Desktop. Pick one:
   - (a) Re-register the monolith only (`src/mcp/server.js`) — simplest, matches what most historical usage assumed.
   - (b) Register the 6 federated servers — matches the INFRA-SHIFT.md target architecture and the "tool prowess/delegation" framing of this task; each server is already extracted and file-complete.
   - Given the explicit ask for "delegation/communication mechanism," **(b) is the better long-term fit** — it's already built, just not wired up. This is almost certainly the single highest-leverage action available right now.
2. **Verify/rotate credentials** that were echoed during the earlier config-inspection session, if not already done — check `.env` is still gitignored and untouched in `git log -p` for the relevant window.
3. **Top up Anthropic API credits** to restore AI-authored captions/hooks/video scripts (currently falling back to static templates silently).
4. **Live-test social publishing** for TikTok/Facebook/WhatsApp — docs disagree on completion status; only Instagram is confidently "real."
5. **Clean up `.bak_*` files** in `src/mcp/servers/` and `src/engines/` once the current versions are trusted (or delete after confirming git history preserves the prior versions, which it does).
6. Fix the `publish_job` filePath dict/string mismatch and WhatsApp `link:` limitation — both are small, contained fixes.
7. Optional/lower priority: unify `ai-captions.js` context sourcing with `context-pools.js`; test `logo-loader.js` cold-cache path; wire `intelligence-router.js`'s fuller vision signals (weather/vegetation/entity → palette/copy) per `VISION_INTELLIGENCE_ROADMAP.md` — much of Phase 1–2 there may already be superseded by `variation-engine.js`'s simpler palette rotation, worth a diff-check before re-implementing.

---

## 8. Source documents folded into this file

Root: `NEXT_AGENT_HANDOFF.md`, `LATEST_CHANGES.md`, `BUG_REPORT.md`, `CHANGELOG.md`, `AGENT_RULES.md`, `BUGS.md`, `RENDER-FIXES.md`, `INFRA-SHIFT.md`, `LAVIRA_MCP_HANDOFF.md`, `AGENT_HANDOFF.md`, `VISION_INTELLIGENCE_ROADMAP.md`, `LAVIRA_POST_ENGINE_UPGRADE.md` (partial — largely superseded by the Signature Variance Engine), `README.md` (pre-update).
`docs/`: `MEDIA_LIBRARY.md`, `INSTALLATION.md`.
Not folded in: `docs/archive/*` (already marked stale by a prior agent), `archive/docs/*` (pre-2026-05, superseded), `windows/SETUP.md` / `electron/icons/README.md` / `samples/README.md` (peripheral, installer/asset-specific, unchanged), `MASTER_ANALYSIS_APRIL14.md` (owner-restricted permissions, not read in detail).

*This file should be treated as the entry point for any new agent session on this project — read this before the individual handoff docs.*
