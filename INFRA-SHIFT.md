# INFRA-SHIFT: Lavira Media Engine — Federated MCP Cluster

**Version:** 1.0
**Date:** 2026-06-06
**Status:** Planning — Pre-implementation
**Author:** Paul (kamau) + Claude Copilot
**Applies to:** `~/lavira-media-engine` · v3.0 monolith → federated cluster

---

## I. THE PROBLEM — WHY THE MONOLITH MUST GO

The current `src/mcp/server.js` is **1,446 lines, 77 tools, one file, one process.**
Every tool call goes through a single JSON-RPC dispatcher. Claude receives all 77 tool
descriptions on every `tools/list` call and must pick from them with no structural hint
about category, precedence, or call order.

| Issue | Consequence |
|---|---|
| 77 tools in one flat list | Claude spends tokens disambiguating `generate_auto_promo` vs `smart_generate` vs `create_post_workflow` |
| No precedence hierarchy | Pipeline tools (`apply_overlay`, `make_ready_to_post`, `build_post_package`) appear as peers |
| Mixed operation types | Read-only brand queries live next to destructive write ops (`delete_output_file`) |
| One process = one crash surface | SQLite `SQLITE_BUSY` on the MCP process brings down all 77 tools |
| Adding tools makes it worse | Every new feature widens the flat list further |
| No per-category context injection | Brand context is loaded globally even for pure media-edit calls |

The toolBOX precedent (`INFRA-SHIFT.md`, May 2026) proved the fix: **one discipline = one
MCP server**. This document applies that ideology to lavira.

---

## II. THE TARGET ARCHITECTURE — FEDERATED CLUSTER

```
claude_desktop_config.json
├── lavira-media        (stdio)  ← video/image/audio editing primitives
├── lavira-search       (stdio)  ← stock + GIPHY + library search
├── lavira-publish      (stdio)  ← social publishing, scheduling, booking flows
├── lavira-brand        (stdio)  ← brand context, content generation, AI captions
├── lavira-design       (stdio)  ← cards, overlays, compositor, intelligence-router
└── lavira-ops          (stdio)  ← health, cache, files, admin settings, cleanup
```

Each server:
- Runs as a **separate Node.js process** (stdio transport for Claude Desktop)
- Imports only the engines it needs — no global require-everything startup
- Has its own launch entry in `claude_desktop_config.json`
- Can be disabled per session without touching others
- Shares `src/config.js`, `src/orchestrator/brand.js`, and `lavira.db` (read-only where safe)

The Express REST API (`src/server.js`, port 4005) is **unchanged** — it is the web UI
backend and is not part of the MCP cluster.

---

## III. SERVER DEFINITIONS — TOOLS BY CATEGORY AND OPERATION TYPE

### Operation type legend

| Code | Meaning |
|---|---|
| `R` | Read — returns data, no file written |
| `W` | Write — produces output file or DB record |
| `P` | Pipeline step — must be called in sequence |
| `D` | Destructive — deletes or overwrites |
| `A` | Agentic — calls external API (Anthropic/Pexels/GIPHY/social) |

---

### 1. `lavira-media` — Media Editing Primitives

**Concern:** Transform uploaded or existing media files into platform-ready assets.
No brand injection. No AI caption. No external search.
**Tool count:** 17

| Tool | Op | Description |
|---|---|---|
| `process_video` | W | Auto-crop, watermark, export one platform variant |
| `video_clip` | W | Trim: extract segment at startSec for durationSec |
| `video_probe` | R | Duration, resolution, fps, codec, audio, file size |
| `video_encode_platform` | W | Encode for specific platform (resolution, fps, bitrate, moov) |
| `video_add_watermark` | W | Burn brand watermark into video |
| `video_to_reel` | W | Static image → animated Ken Burns zoom MP4 |
| `full_video_post_pipeline` | W | End-to-end: Pexels fetch → probe → clip → encode |
| `process_image` | W | Manual edits (crop, rotate, color) → social profiles |
| `image_smart_crop` | W | Entropy-based subject-aware crop |
| `image_compare` | R | Side-by-side A/B comparison of two images |
| `image_export_platform` | W | Resize + optimise for whatsapp/instagram/facebook/tiktok |
| `image_ocr_prepare` | W | Greyscale + normalise + sharpen + threshold for OCR |
| `image_analyze_colors` | R | Dominant colour, brightness, mood |
| `image_metadata` | R | Dimensions, format, file size, megapixels, EXIF |
| `image_build_collage` | W | 2×2 grid from 2–4 images |
| `process_audio` | W | Normalise, fade, export at platform duration (15/30/45/60s) |
| `mix_audio_with_media` | W | Attach music to image or video |

**Entry point:** `src/mcp/servers/media-server.js`
**Imports:** `engines/video`, `engines/video-enhanced`, `engines/image`, `engines/image-enhanced`, `engines/audio`, `engines/media-mixer`

---

### 2. `lavira-search` — Media Search & Discovery

**Concern:** Find the best external or internal media for a given topic.
Returns URLs, filenames, or cache entries — never writes output files directly.
**Tool count:** 8

| Tool | Op | Description |
|---|---|---|
| `search_stock_images` | R,A | Pexels photo search by keyword |
| `video_search_stock` | R,A | Pexels portrait-oriented safari video search |
| `search_external_media` | R,A | Intelligent Pexels/Unsplash ranking + caching |
| `fetch_optimal_media` | R,A | Best-match fetch with content scoring |
| `search_giphy` | R,A | GIPHY GIF search by topic |
| `use_giphy` | W,A | Download GIPHY GIF by ID as MP4 |
| `list_sample_media` | R | List staged sample media by destination/type/theme |
| `get_sample_media` | R | Get sample files for a specific destination |

**Entry point:** `src/mcp/servers/search-server.js`
**Imports:** `engines/external-media`, `engines/giphy`, `engines/media-cache`, `engines/media-library`

---

### 3. `lavira-publish` — Publishing, Scheduling & Booking Flows

**Concern:** Post content to social platforms, manage the content calendar,
and trigger booking-linked automation. Tools here write to social APIs or to
the scheduler/DB — they do not touch media files directly.
**Tool count:** 13

| Tool | Op | Description |
|---|---|---|
| `post_to_instagram` | W,A | Publish job to Instagram Reels/Feed/Stories |
| `post_to_tiktok` | W,A | Publish job to TikTok |
| `post_to_facebook` | W,A | Publish job to Facebook page feed |
| `publish_job` | W,A | Publish to multiple platforms at once |
| `schedule_post` | W | Schedule a job at a specific datetime |
| `get_daily_schedule` | R | Auto-generated daily promo schedule |
| `trigger_daily_promo` | W,A | Immediately run daily promo generation |
| `approve_job` | W | Mark job approved for sharing |
| `reject_job` | W,D | Reject and flag a job |
| `get_share_package` | R | Caption + hook + hashtags + per-platform download links |
| `record_booking` | W | Record a confirmed safari booking |
| `trigger_post_booking_flow` | W,A | Generate content for a confirmed booking |
| `list_booking_events` | R | Recent bookings with guest details |

**Entry point:** `src/mcp/servers/publish-server.js`
**Imports:** `publishing/index`, `publishing/instagram`, `publishing/multi-platform`, `scheduler/index`, `orchestrator/memory`

---

### 4. `lavira-brand` — Brand Context, Content Intelligence & AI

**Concern:** All reads from brand knowledge, content generation via Claude AI, and
memory management. Pure read or AI-agentic — no file writes, no social posts.
**Tool count:** 13

| Tool | Op | Description |
|---|---|---|
| `get_brand_info` | R | Full brand dictionary: name, contacts, destinations, packages |
| `get_safari_packages` | R | All packages with durations, destinations, highlights |
| `get_destinations_to_feature` | R | Destinations ranked by LRU posting frequency |
| `get_destination_rotation_status` | R | Per-destination posting frequency, last posted date |
| `check_content_duplicate` | R | Is this caption too similar to a recent post? |
| `analyze_content_theme` | R,A | Claude determines optimal creative theme from media |
| `generate_video_script` | W,A | Multi-part video script: hook, body beats, CTA, timing |
| `ask_claude` | W,A | Free-form Claude prompt with brand context pre-injected |
| `get_user_memory` | R | Read LAVIRA_USER_MEMORY.md |
| `update_user_memory` | W | Append/replace section in user memory |
| `generate_marketing_payload` | W,A | Tagline + CTA + contact info + promo text package |
| `generate_promo_package` | W,A | AI caption + story hook + CTA + hashtags |
| `smart_generate` | W,A | Master tool: parse natural language → full post generation |

**Entry point:** `src/mcp/servers/brand-server.js`
**Imports:** `orchestrator/brand`, `orchestrator/memory`, `orchestrator/intent`, `orchestrator/settings`, `content/ai-captions`, `content/captions`

---

### 5. `lavira-design` — Graphic Design, Cards & Overlay Composition

**Concern:** All visual design output. Takes media + brand data and produces
branded image/video composites. Many tools here are pipeline steps — call order matters.
**Tool count:** 12

| Tool | Op | Call order note |
|---|---|---|
| `analyze_content_theme` | R,A | Step 0 — read image mood/palette (shared with brand server) |
| `generate_overlay_plan` | R,A | Step 1 — compute text placement and overlay positioning |
| `generate_branded_media` | W,A | Step 2 — apply theme + render dynamic overlay |
| `apply_overlay` | W,P | Step 3 — apply Lavira brand overlay to image or video |
| `make_ready_to_post` | W,P | Step 4 — add logo bar, title, promo type |
| `build_post_package` | W,P | Step 5 — composite overlays to all profiles in one call |
| `generate_card_template` | W,A | Render a single branded social card |
| `generate_all_cards` | W,A | Generate all 10 card templates for a destination |
| `save_to_posts` | W | Copy output file to posts/ subfolder |
| `list_posts` | R | List files in posts/ directory |
| `process_sample_as_test` | W | Run full pipeline on a sample without uploading |
| `batch_process_samples` | W | Process all samples in a destination folder |

**Entry point:** `src/mcp/servers/design-server.js`
**Imports:** `engines/compositor`, `engines/card-templates`, `engines/dynamic-templates`, `engines/intelligence-router`, `engines/image-vision`, `engines/logo-loader`, `engines/media-augmentation`, `engines/context-pools`

---

### 6. `lavira-ops` — System, Cache, Files & Admin

**Concern:** Health, file management, cache control, and admin settings.
No AI calls, no social API, no media transformation.
**Tool count:** 11

| Tool | Op | Description |
|---|---|---|
| `get_engine_health` | R | FFmpeg, AI, Pexels, GIPHY status |
| `get_api_status` | R | All API integrations active/inactive |
| `get_admin_settings` | R | Persisted admin settings |
| `update_admin_settings` | W | Deep-merge patch into admin settings |
| `cache_stats` | R | External media cache: size, entries, freshness |
| `cache_prune` | D | Evict expired cache entries |
| `cache_clear` | D | Clear entire external media cache |
| `cleanup_old_outputs` | D | Delete output files older than N days |
| `list_output_files` | R | Files in outputs/ with size and created date |
| `list_upload_files` | R | Files in uploads/ |
| `delete_output_file` | D | Delete a specific output file by filename |

**Entry point:** `src/mcp/servers/ops-server.js`
**Imports:** `config`, `engines/media-cache`

---

## IV. CLAUDE DESKTOP REGISTRATION

`~/.config/claude/claude_desktop_config.json` (Linux) or Windows equivalent:

```json
{
  "mcpServers": {
    "lavira-media": {
      "command": "node",
      "args": ["/home/kamau/lavira-media-engine/src/mcp/servers/media-server.js"],
      "env": { "DOTENV_CONFIG_PATH": "/home/kamau/lavira-media-engine/.env" }
    },
    "lavira-search": {
      "command": "node",
      "args": ["/home/kamau/lavira-media-engine/src/mcp/servers/search-server.js"],
      "env": { "DOTENV_CONFIG_PATH": "/home/kamau/lavira-media-engine/.env" }
    },
    "lavira-publish": {
      "command": "node",
      "args": ["/home/kamau/lavira-media-engine/src/mcp/servers/publish-server.js"],
      "env": { "DOTENV_CONFIG_PATH": "/home/kamau/lavira-media-engine/.env" }
    },
    "lavira-brand": {
      "command": "node",
      "args": ["/home/kamau/lavira-media-engine/src/mcp/servers/brand-server.js"],
      "env": { "DOTENV_CONFIG_PATH": "/home/kamau/lavira-media-engine/.env" }
    },
    "lavira-design": {
      "command": "node",
      "args": ["/home/kamau/lavira-media-engine/src/mcp/servers/design-server.js"],
      "env": { "DOTENV_CONFIG_PATH": "/home/kamau/lavira-media-engine/.env" }
    },
    "lavira-ops": {
      "command": "node",
      "args": ["/home/kamau/lavira-media-engine/src/mcp/servers/ops-server.js"],
      "env": { "DOTENV_CONFIG_PATH": "/home/kamau/lavira-media-engine/.env" }
    }
  }
}
```

---

## V. LAVIRASAFARIS.COM LIVE INTEGRATION — IMPACT ANALYSIS

### Current state

`src/orchestrator/brand.js` is a **static snapshot** of the Lavira website, manually
curated and hardcoded. Packages, destinations, testimonials, guides, and USPs are frozen
at the time of last edit. When Lavira adds a new package or updates copy, nothing reaches
the MCP unless a developer edits `brand.js` and redeploys.

### What live integration would unlock

| Feature | Mechanism | Benefit |
|---|---|---|
| Live package list | Scrape `lavirasafaris.com/safari-packages` on `get_safari_packages` call | Captions reference real, current packages — no stale prices |
| New testimonials | Scrape `/testimonials` or pull from Google Reviews API | Content feels fresh, real guests quoted |
| Blog/editorial feed | RSS or `lavirasafaris.com/blog` scrape | Post themes tied to real editorial calendar |
| Destination updates | Scrape individual destination pages | Wildlife seasonality copy always accurate |
| Gallery images | Scrape `lavirasafaris.com/gallery` for real Lavira photos | Replace Pexels stock with authentic owned images |
| Booking events | WordPress REST API or WooCommerce webhook | Booking-triggered posts use real guest details |

### Architecture for live integration

```
lavira-brand server
  ├── brand-cache.js          ← TTL-based cache (24h packages, 1h blog)
  │     ├── lavirasafaris.com/safari-packages  → parsed package array
  │     ├── lavirasafaris.com/blog             → RSS/post titles + URLs
  │     └── WP REST API: /wp-json/wp/v2/posts  → structured content
  └── brand.js                ← static fallback (used if scrape fails)
```

New tools this unlocks (add to `lavira-brand`):

| Tool | Op | Description |
|---|---|---|
| `refresh_brand_cache` | W,A | Force re-scrape of lavirasafaris.com |
| `get_live_packages` | R,A | Packages from live site (TTL-cached) |
| `get_blog_feed` | R,A | Latest blog posts for editorial alignment |
| `get_live_testimonials` | R,A | Recent guest reviews from live site or Google |
| `get_gallery_images` | R,A | Authentic Lavira photos from site gallery |

### Risk factors

- WordPress DOM can change structure without notice — target semantic HTML, not div classes.
- Rate limiting: crawl at most once per TTL per endpoint; set `User-Agent: lavira-media-engine/3.0`.
- Personal data: if booking webhooks carry guest PII, strip to `{ destination, package, date }` only before any logging.
- WordPress REST API is cleaner than scraping for structured data
  (`/wp-json/wp/v2/posts`, `/wp-json/wc/v3/products` if WooCommerce installed).
  Requires a read-only Application Password — store in `.env` as `WP_APP_PASSWORD`, never committed.

---

## VI. MIGRATION STRATEGY — HOW TO PROCEED WITHOUT BREAKING THINGS

### Principle: parallel deployment, not cutover

The monolith `src/mcp/server.js` continues running exactly as today. Federated servers
are built alongside it. Claude Desktop config is switched only when each server passes
integration tests. The monolith is removed last, in Phase 7.

### Phase 0 — Scaffold (1–2 hrs, zero risk)

```bash
mkdir -p src/mcp/servers
```

Create `src/mcp/lib/rpc-core.js` — minimal shared JSON-RPC stdio dispatcher.
All sub-servers `require('../lib/rpc-core')`. No duplication of transport code.

### Phase 1 — Extract `lavira-ops` (2 hrs, lowest risk)

Zero external API calls. Zero media writes beyond settings.
Extract, test, register in Claude Desktop. Monolith still handles all other tools.

**Test gate:** `get_engine_health` returns correct FFmpeg and API status in Claude Desktop.

### Phase 2 — Extract `lavira-search` (2–3 hrs)

Pure read + external API. No DB writes. Wire up `engines/external-media.js` and `engines/media-cache.js`.

**Test gate:** `fetch_optimal_media` with query "Masai Mara lion" returns a real Pexels image URL.

### Phase 3 — Extract `lavira-brand` (2–3 hrs)

Imports `orchestrator/brand.js` and `content/ai-captions.js`. No media writes.
Add `brand-cache.js` stub (static-only; live scrape added later).

**Test gate:** `get_brand_info` returns full dictionary; `generate_promo_package` returns an AI caption for Samburu.

### Phase 4 — Extract `lavira-media` (3–4 hrs)

Largest pure-transform concern. FFmpeg and Sharp handlers already self-contained in
engine files — this phase is mostly wiring.

**Test gate:** `video_probe` returns duration; `image_smart_crop` produces an output file.

### Phase 5 — Extract `lavira-design` (3–4 hrs)

Most complex — compositor, card-templates, intelligence-router, and image-vision interlock.
Extract together, document pipeline call order in each tool's description string.

**Test gate:** `generate_card_template({template:'hero_destination', data:{destination:'Amboseli'}})` produces a branded card file.

### Phase 6 — Extract `lavira-publish` (2–3 hrs)

Social token handling. Re-test Instagram, TikTok, and Facebook posting. Scheduler extraction.

**Test gate:** `schedule_post` writes a schedule entry; `get_daily_schedule` returns it.

### Phase 7 — Monolith retirement

Once all 6 servers are green:
1. Remove `lavira-mcp` service from `docker-compose.yml`
2. Archive `src/mcp/server.js` → `src/mcp/server.js.archive`
3. Update `README.md` to reflect new server list
4. Tag `v4.0.0`

### Risk log

| Phase | Risk | Mitigation |
|---|---|---|
| 1 | Settings path mismatch | Use `cfg.js` path resolution, not `__dirname` |
| 2 | Pexels cache TTL collision between two processes | Accept occasional double-fetch; lock-file in future |
| 3 | SQLite read/write conflict (brand vs engine) | Open DB read-only in brand server via `better-sqlite3` readonly flag |
| 4 | FFmpeg path differs between stdio and Docker | `ffmpeg-static` bundled path already resolved via `config.js` |
| 5 | Image-vision Anthropic call timeout | Inherit 30s timeout from existing `ai-captions.js` |
| 6 | Instagram token scoping | No change — tokens in `.env`, same env shared by all servers |

---

## VII. GITHUB SECURITY ISSUE — HISTORY & TOKEN EXPOSURE

### What happened

Between v1.0.0 (2026-04-18) and the eight `security: neutralise operator identity
footprint` commits on 2026-06-01, the public repo `jaguar999paw-droid/lavira-media-engine` had:

| Exposure type | Evidence | Risk |
|---|---|---|
| Real API keys in Windows ZIP release artifacts | v1.5.1 CHANGELOG: "CI injects pre-filled `keys.env` from GitHub Actions secrets at build time" | **Critical** — keys shipped to any downloader |
| Operator SSH public key + hostname | `windows/keys.env.example`: `DISASTER_PUBKEY` + `DISASTER_IP` publicly committed | Medium — infrastructure fingerprint |
| Tailscale auth key scheme | `keys.env.example` comment: `tag:lavira, Reusable=Yes, Expiry=90d` | Medium — operational detail |
| Business identity in handoff docs | 8 consecutive security commits strongly imply phone/email/details were in prior commits | High |
| All of the above persists in git history | `git clone` + `git log --all` recovers pre-sanitisation state | **High — history ≠ HEAD** |

### Remediation steps

**Step 1 — Audit the history**

```bash
cd ~/lavira-media-engine

# Find commits that touched sensitive files
git log --all --oneline -- windows/keys.env AGENT_HANDOFF.md \
  LAVIRA_MCP_HANDOFF.md MASTER_ANALYSIS_APRIL14.md HANDOFFFFFF.md

# Scan for real key patterns in full history
git log --all -p | grep -E \
  'ANTHROPIC_API_KEY=sk-|PEXELS_API_KEY=[A-Za-z0-9]{30,}|tskey-auth|INSTAGRAM_ACCESS_TOKEN=EAA'
```

**Step 2 — Rewrite history with git-filter-repo**

```bash
pip install git-filter-repo

# Remove files that carried real keys
git filter-repo --invert-paths \
  --path windows/keys.env \
  --path AGENT_HANDOFF.md \
  --path HANDOFFFFFF.md \
  --path MASTER_ANALYSIS_APRIL14.md \
  --path LAVIRA_MCP_HANDOFF.md

# Scrub known key patterns from remaining content
git filter-repo --replace-text <(printf '%s\n' \
  'ANTHROPIC_API_KEY=sk-ant-==>ANTHROPIC_API_KEY=REDACTED' \
  'tskey-auth==>tskey-auth-REDACTED' \
  'INSTAGRAM_ACCESS_TOKEN=EAA==>INSTAGRAM_ACCESS_TOKEN=REDACTED')

# Force-push after coordinating with any forks
git push --force origin main
```

**Step 3 — Rotate all credentials immediately**

Treat every credential that ever appeared in any commit as compromised.
Keys to rotate regardless of filter-repo outcome:

- `ANTHROPIC_API_KEY` → Anthropic Console → API Keys → Delete + new
- `PEXELS_API_KEY` → Pexels API Dashboard → Regenerate
- `GIPHY_API_KEY` → GIPHY Developers → Regenerate
- `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_USER_ID` → Meta → Token refresh
- `FACEBOOK_ACCESS_TOKEN` + `FACEBOOK_PAGE_ID` → Meta → Token refresh
- `TIKTOK_ACCESS_TOKEN` → TikTok Developer Portal → Regenerate
- Any `TS_AUTH_KEY` ever committed → Tailscale Admin → Keys → Delete + regenerate

**Step 4 — Enable GitHub secret scanning**

Repo → Settings → Security → Code security and analysis → enable:
- Secret scanning
- Push protection (blocks pushes containing known token patterns)
- Dependabot alerts

**Step 5 — Pre-commit hook**

```bash
pip install detect-secrets
detect-secrets scan > .secrets.baseline
git add .secrets.baseline
```

`.pre-commit-config.yaml`:
```yaml
repos:
- repo: https://github.com/Yelp/detect-secrets
  rev: v1.4.0
  hooks:
  - id: detect-secrets
    args: ['--baseline', '.secrets.baseline']
```

**Step 6 — Safer CI key injection going forward**

The v1.5.1 approach (keys baked into release ZIP) is retired. Replace with:

```yaml
# .github/workflows/windows-package.yml
- name: Write blank keys.env (no real values)
  run: printf 'ANTHROPIC_API_KEY=\nPEXELS_API_KEY=\nGIPHY_API_KEY=\n' > windows/keys.env
```

Users fill in keys after install:
```bash
# Via Tailscale SSH into the Windows machine:
echo "ANTHROPIC_API_KEY=your_key" >> ~/lavira-media-engine/.env
docker compose restart
```

**Step 7 — Sanitise `keys.env.example`**

Remove `DISASTER_PUBKEY` and `DISASTER_IP`. Replace with:

```env
# Operator SSH public key (paste full public key for remote access setup)
OPERATOR_PUBKEY=

# Operator Tailscale IP (used for install-complete ping — leave blank to skip)
OPERATOR_IP=
```

---

## VIII. SUMMARY

| Concern | Current state | Target state | When |
|---|---|---|---|
| Tool discoverability | 77 tools, flat list | 6 servers × ~12 tools | Phases 1–6 |
| Pipeline clarity | Peers with no order | Design server with ordered P-type tools | Phase 5 |
| Crash isolation | One process for all | 6 independent processes | Phases 1–6 |
| Brand freshness | Static `brand.js` | `brand-cache.js` with live site TTL | Phase 3+ |
| Live site integration | None | WP REST API + cheerio scrape | Post-phase 3 |
| Git history exposure | Reachable sensitive commits | filter-repo rewrite + force-push | Immediate |
| CI key injection | Keys in release ZIP (v1.5.1) | Blank template, manual post-install fill | Immediate |
| Secret scanning | None | GitHub scanning + detect-secrets hook | Immediate |
| Token rotation | Stale | Full rotation post filter-repo | Immediate |

---

*INFRA-SHIFT v1.0 — generated 2026-06-06. Next review at v4.0.0 release.*
