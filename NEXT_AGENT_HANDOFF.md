# NEXT_AGENT_HANDOFF.md
> Updated: 2026-07-02 | Engine: lavira-media-engine

(Prior handoff, describing Twitter/TikTok publisher work from 2026-06-09, archived at
`docs/archive/NEXT_AGENT_HANDOFF_20260609.md` — that work is already committed on `main`.)

---

## Session Summary (2026-07-02)

Picked up from an earlier agent's uncommitted work implementing the Signature
Variance Engine described in `LATEST_CHANGES.md`. That work (`variation-engine.js`,
`dynamic-templates.js` rewrite, `logo-loader.js`) was syntactically valid but:
1. **Not wired to anything that runs** — `create_post_workflow`/`smart_generate`
   still rendered through the old flat-watermark path in `src/engines/promo.js`.
2. **Had a live bug** that would have broken it the moment it *was* wired in.

Both are fixed and verified end-to-end this session:

- **Wired it in**: `src/engines/promo.js` (`generateAutoPromo` → `brandImageVaried`)
  now calls `variation-engine.resolveVariation()` + `dynamic-templates.renderDynamicTemplate()`
  for every post. Falls back to the old flat watermark (`brandImage()`) if either
  module fails to load or render throws — a post always ships. Verified: output
  filenames now come out as `dynamic_<template>_<profile>_<uuid>.jpg` (new path)
  instead of `lavira_auto_<profile>_<uuid>.jpg` (old path).
- **Fixed a real bug**: `FONT_PAIRINGS` in `variation-engine.js` used double-quoted
  font names (`'"Helvetica Neue", Arial, sans-serif'`) interpolated into a
  double-quoted SVG `font-family="..."` attribute in `dynamic-templates.js` —
  this produced malformed XML (`font-family=""Helvetica Neue"...""`) and made
  `sharp` throw `Input buffer has corrupt header` on **any** template that used
  the `ModernBold` or `EditorialWarm` pairing (2 of 3 pairings — this would have
  broken ~2/3 of posts once the engine was live). Fixed by switching the font
  names to single quotes in `FONT_PAIRINGS` (valid CSS/SVG either way, just
  avoids nesting the same quote character). All 5 templates × all 3 font
  pairings tested clean after the fix.
- **TODO #6 confirmed**: caption/hook/CTA data (`resolvePostData()` in
  `post-defaults.js`) already pulls from `context-pools.js` (hooks, CTAs,
  time-of-day/season lines) with anti-repeat LRU — this was already correct,
  no change needed. Note: the separate Claude-powered caption writer
  (`content/ai-captions.js`) has its own independent destination/season/USP
  context rather than sharing `context-pools.js` — intentional design (it's a
  richer, model-driven pipeline), not a bug, but flagging in case a future
  session wants the two unified.
- **Archived stale docs**: `NEXT_AGENT_HANDOFF.md`/`LAVIRA_USER_MEMORY.md`
  (dated 2026-06-09, describing earlier publisher work already on `main`) moved
  to `docs/archive/*_20260609.md` so they don't get mistaken for current state.
- **Federated MCP servers**: registered all 6 (`lavira-ops`, `lavira-search`,
  `lavira-brand`, `lavira-media`, `lavira-design`, `lavira-publish`) in
  `claude_desktop_config.json` alongside the existing monolith. All 6 boot
  clean standalone; see this session's chat log for the live verification.
- **Committed & pushed** — see git log. `.env` and any files containing live
  API keys/tokens were confirmed excluded via `.gitignore` before push (see
  `git status`/`git diff` review in this session).

---

## Active Work Items (priority order)

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 1 | Anthropic API key has zero credit balance — AI captions are silently falling back to static templates | `.env` / Anthropic billing | 🔴 Needs billing top-up |
| 2 | Unify `ai-captions.js` context sourcing with `context-pools.js`/`intelligence-router.js` (optional, both work independently today) | `src/content/ai-captions.js` | 🔵 Later, non-blocking |
| 3 | `logo-loader.js` — only tested against local cache path; no test yet for cold-cache/first-fetch behavior | `src/engines/logo-loader.js` | 🟡 Worth a test |
| 4 | Old items 2–6 from the 2026-06-09 handoff (webhook tokens, `post_to_twitter` parity, `publish_job` file-picker bug, WhatsApp `link:` design issue) — unchanged, still open | see `docs/archive/NEXT_AGENT_HANDOFF_20260609.md` | 🔴/🟡 still open |

## Known Bugs (remaining, unrelated to this session)

- `publish_job` in `publishing/index.js`: `broadcastToAll` receives `filePath` as
  a `{platform: path}` dict but each publisher expects a plain string path.
- WhatsApp image send uses `link:` (public URL) — local files can't be sent
  without an upload step or tunnel.
- `get_engine_health` in federated `ops-server.js` doesn't yet call
  `rpc-core.getMetrics()` (only the monolith does).

## Architecture Notes

- Monolith `src/mcp/server.js` (stdio) — registered in Claude Desktop as
  `lavira-media-engine`; also the process the systemd HTTP unit (`lavira-http.service`,
  port 4005) launches internally for MCP.
- Federated 6-server split under `src/mcp/servers/` — now also registered in
  Claude Desktop individually (see table above). Both the monolith and the
  federated servers are live simultaneously; they share the same engine code
  (`src/engines/*`), so behavior should stay consistent between them.
- Signature Variance Engine: `src/engines/variation-engine.js` persists a
  rolling no-repeat-last-5 history per theme to `lavira.db` (falls back to
  in-memory if the DB is unavailable).
