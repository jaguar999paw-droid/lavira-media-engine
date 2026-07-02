# NEXT_AGENT_HANDOFF.md
> Updated: 2026-06-09 | Engine: lavira-media-engine

---

## Session Summary

**Session 1 (earlier today):**
- `rpc-core.js` v2.1.0 — per-tool metrics; `get_engine_health` exposes `toolMetrics[]`
- `dry_run` + caption enforcement on `post_to_instagram`, `post_to_facebook`, `post_to_tiktok` (monolith)
- `generate_whatsapp_status` auto-saves to `posts/whatsapp/`
- `src/publishing/tiktok.js` — real v2 Content Posting API (init → chunked upload → poll)
- `src/routes/webhooks.js` — Meta/TikTok/WhatsApp webhook receiver, mounted on `/api/webhooks`

**Session 2 (this session):**
- `src/publishing/twitter.js` — real OAuth1a publisher: media upload (INIT→APPEND→FINALIZE) + v2 tweet post
- `src/publishing/multi-platform.js` — `publishTikTok` and `publishTwitter` now delegate to real publishers
- `src/publishing/index.js` — `publishTikTok` delegates to `tiktok.js` (not the old stub in multi-platform)
- `src/mcp/servers/publish-server.js` (federated) — `post_to_instagram`, `post_to_tiktok`, `post_to_facebook`, `publish_job` all have real handlers + `dry_run` + caption enforcement; `post_to_twitter` tool added
- `~/.config/systemd/user/lavira-http.service` — HTTP server now managed by systemd user unit (auto-restart, survives reboots); enabled + active on port 4005

---

## Active Work Items (priority order)

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 1 | Add `META_WEBHOOK_VERIFY_TOKEN` + `META_WEBHOOK_SECRET` to .env | `.env` | 🔴 Needs tokens |
| 2 | Add `post_to_twitter` to monolithic `server.js` (matches federated server parity) | `src/mcp/server.js` | 🟡 Minor |
| 3 | `publish_job` in `publishing/index.js` — per-platform file picker broken (passes object not path) | `src/publishing/index.js` line ~`platformFiles[pid]` | 🔴 Bug |
| 4 | WhatsApp publisher uses `link:` (public URL) — local files don't upload | `src/publishing/whatsapp.js` | 🟡 Design issue |
| 5 | Deprecate legacy/redundant tools in monolithic `server.js` TOOLS array | `src/mcp/server.js` | 🔵 Later |
| 6 | Refactor monolithic `server.js` → thin HTTP bridge (all logic in federated servers) | `src/mcp/server.js` | 🔵 Later |

---

## Known Bugs (remaining)

- `publish_job` in `index.js`: `broadcastToAll` receives `filePath` as a `{ platform: path }` dict but each platform publisher expects a string — passes object not string path
- Facebook multipart upload: uses `source` field name for both photo + video — photos might need `url` or `message` param instead
- WhatsApp image send: uses `link:` field requiring a publicly accessible URL — won't work for local files without an upload step or ngrok/tunnel
- `get_engine_health` in federated `ops-server.js`: doesn't yet call `rpc-core.getMetrics()` (only monolith does)

---

## Architecture Notes

- Six federated stdio sub-servers + monolithic `server.js`
- HTTP server: systemd user unit `lavira-http.service`, port 4005, auto-restart
- `rpc-core.js` exports `{ start, getMetrics }` — all sub-servers can access metrics
- Twitter: OAuth1a signing via HMAC-SHA1; 5 MB media chunks; polls video processing
- TikTok: 10 MB chunks, 50 MB file limit, `.mp4/.mov/.webm` only
- Webhook env vars: `META_WEBHOOK_VERIFY_TOKEN`, `META_WEBHOOK_SECRET` (both currently unset)
- `webhook_log.jsonl` written to `~/lavira-media-engine/webhook_log.jsonl`

---

## What Still Needs Tokens

- Instagram: `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_USER_ID`
- Facebook: `FACEBOOK_ACCESS_TOKEN` + `FACEBOOK_PAGE_ID`
- TikTok: `TIKTOK_ACCESS_TOKEN`
- WhatsApp: `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_RECIPIENT_NUMBER`
- Twitter: `TWITTER_API_KEY` + `TWITTER_API_SECRET` + `TWITTER_ACCESS_TOKEN` + `TWITTER_ACCESS_SECRET`
- Webhook: `META_WEBHOOK_VERIFY_TOKEN` + `META_WEBHOOK_SECRET`
