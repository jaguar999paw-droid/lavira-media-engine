# Lavira Media Engine — Bug Report & Tool Test Log
**Generated:** 2026-04-29 | **Agent:** Claude Sonnet 4.6 | **Engine:** v3.0, 52 tools

---

## BUGS.md — Fix Status

### Bug 1 — Double-path bug (/home/kamau/.../outputs/...)
**Status: ✅ NOT REPRODUCIBLE — already correct**
`cfg.ASSETS_DIR` resolves to `/home/kamau/lavira-media-engine/assets` cleanly.
`media-cache.js` line 8: `path.join(cfg.ASSETS_DIR, 'external_cache')` is correct.
No double-path issue confirmed via `node -e "console.log(cfg.ASSETS_DIR)"`.

---

### Bug 2 — image_metadata / image_analyze_colors / image_compare fail on outputs
**Status: ✅ FIXED — commit 505acd2**
**Root cause:** `resolveMediaPath()` in `server.js` checked UPLOADS_DIR and engine root but NOT OUTPUTS_DIR. Engine-generated images land in `outputs/` and were never resolved.
**Fix:** Added `fromOutputs` check between `fromUploads` and `fromRoot`:
```js
const fromOutputs = path.join(cfg.OUTPUTS_DIR, path.basename(fp));
if (fs.existsSync(fromOutputs)) return fromOutputs;
```
**Verified:** Both `image_metadata` and `image_analyze_colors` now ✅ with output filenames.

---

### Bug 3 — ask_claude and generate_video_script fail silently
**Status: ✅ FIXED — commit 505acd2**
**Root cause:** Anthropic API credits are DEPLETED on the account. Key is valid (sk-ant-api03...) but every call returns HTTP 400 `credit balance too low`. The old code threw uncaught exceptions.
**Fix (two-part):**
1. `ask_claude` wrapped in try/catch — returns structured `{error, status:'no_credits'}` instead of crashing
2. `get_api_status` now does a live micro-probe (`max_tokens:1` ping) and reports:
   - `✓ key valid + credits OK` — working
   - `⚠ KEY VALID but CREDITS DEPLETED — top up at console.anthropic.com/settings/billing`
   - `✗ KEY INVALID or EXPIRED — replace in .env`
**Action required:** Add credits at https://console.anthropic.com/settings/billing
`generate_video_script` falls back to static script template when AI is unavailable — this is existing behaviour, no code change needed there.

---

### Bug 4 — get_destination_rotation_status returns raw MCP envelope
**Status: ✅ FIXED — commit 505acd2**
**Root cause:** The handler returned `{ content:[{ type:'text', text: JSON.stringify(...) }] }` — the server's main serialiser wraps ALL returns in the content envelope, so this was double-wrapped.
**Fix:** Changed return to `return status;` (plain object). Server handles wrapping.

---

### Bug 5 — smart_generate misidentifies "Ol Pejeta" as "Nakuru"
**Status: ✅ FIXED — commit 505acd2**
**Root cause:** `intent.js` DEST_KEYWORDS had `'Nakuru': ['nakuru','flamingo','lake','rhino','baboon']` — note `'rhino'` in Nakuru's keywords. Since `Object.entries()` iteration hit Nakuru before Ol Pejeta, any "rhino" prompt mapped to Nakuru.
**Fix:**
- Moved `'Ol Pejeta'` entry **before** `'Nakuru'` in DEST_KEYWORDS
- Removed `'rhino'` from Nakuru (rhino is Ol Pejeta's signature animal)
- Changed `'lake'` → `'lake nakuru'` to avoid false matches
**Verified:**
```
parseIntent('ol pejeta rhino post').destination → "Ol Pejeta" ✅
parseIntent('flamingo at lake nakuru').destination → "Nakuru" ✅
parseIntent('Masai Mara today').destination → "Masai Mara" ✅
```

---

## New Module Built

### `src/engines/intelligence-router.js`
**Implements:** VISION_INTELLIGENCE_ROADMAP.md Layer 2
**Purpose:** Maps `image-vision.js` output → content decisions for card-templates.js and promo.js

**Exports:**
- `routeIntelligence(visionData)` → `{ palette, hookPool, copyTone, destinationHint, seasonLine, timeLine, overlayMode, wildlifeEntity, safeTextZone }`
- `guessSeason()` → `'migration'|'dry'|'wet'` based on Kenyan calendar
- `PALETTES` — 5 named palettes (ForestGold, AmberDusk, SavannahBlue, NightSafari, EarthRust)

**Key mappings:**
| Vision signal | Content decision |
|---|---|
| `weather: 'golden_hour'` | palette = AmberDusk, copyTone = 'poetic' |
| `weather: 'misty'` | palette = SavannahBlue, copyTone = 'atmospheric' |
| `entities: ['elephant']` | destinationHint = 'Amboseli' |
| `entities: ['rhino']` | destinationHint = 'Ol Pejeta' |
| `entities: ['lion']` | destinationHint = 'Masai Mara' |
| `season: 'migration'` | seasonLine = Great Migration copy |
| `mood: 'luxury'` | hookPool = 'luxury', palette = NightSafari |

---

## Full Tool Test Results — 2026-04-29

**Engine:** http://localhost:4006 | **Tools registered:** 52

### Round 1 — Management & Content (17 tools)
| Tool | Result |
|---|---|
| get_brand_info | ✅ |
| get_api_status | ✅ (reports credits depleted correctly) |
| get_engine_health | ✅ |
| list_recent_jobs | ✅ |
| list_output_files | ✅ |
| get_destinations_to_feature | ✅ |
| get_safari_packages | ✅ |
| get_destination_rotation_status | ✅ (Bug4 fixed, no longer double-wraps) |
| cache_stats | ✅ |
| generate_promo_package | ✅ |
| generate_marketing_payload | ✅ |
| analyze_content_theme | ✅ |
| get_daily_schedule | ✅ |
| list_sample_media | ✅ |
| list_upload_files | ✅ |
| ask_claude | ✅ (Bug3 fixed — returns `{error, status:'no_credits'}` cleanly) |
| generate_video_script | ✅ (falls back to static template, no crash) |

### Round 2 — Media Generation & Pipeline (9 tools)
| Tool | Result | Notes |
|---|---|---|
| generate_auto_promo | ✅ | Pexels → branded JPG |
| generate_card_template | ✅ | hero_destination template |
| fetch_optimal_media | ✅ | Cache-aware Pexels fetch |
| search_stock_images | ✅ | 3 results returned |
| search_giphy | ✅ | Safari GIFs found |
| image_metadata | ✅ | Bug2 fixed, resolves from outputs/ |
| image_analyze_colors | ✅ | Bug2 fixed |
| create_post_workflow | ✅ | Full pipeline: fetch→brand→caption→package |
| smart_generate | ✅ | NLP intent → pipeline auto-selected |

**TOTAL: 26/26 PASS | 0 FAIL**

---

## Known Remaining Issues (Not in BUGS.md, new observations)

| # | Tool | Issue | Severity |
|---|---|---|---|
| 1 | `ask_claude`, `ai-captions.js` | Anthropic credits depleted — all AI-generated captions fall back to static templates | 🔴 HIGH — add credits to unblock |
| 2 | `post_to_instagram` | INSTAGRAM_ACCESS_TOKEN not in .env — publishing stub only | 🟡 MED |
| 3 | `post_to_tiktok` | Stub implementation — no real API | 🟡 MED |
| 4 | `post_to_facebook` | Stub implementation — no real API | 🟡 MED |
| 5 | `generate_animated_card` | Not implemented (Puppeteer not installed) | 🟢 LOW |
| 6 | `image_compare` | Needs two valid file paths — will fail if one doesn't exist | 🟢 LOW |

---

## Next Actions (Priority Order)

1. **Top up Anthropic credits** — unlocks AI captions, hooks, video scripts, vision analysis
2. **Add Instagram token** to `.env` → enables `post_to_instagram`
3. **Wire intelligence-router.js** into `promo.js` and `card-templates.js` (see VISION_INTELLIGENCE_ROADMAP.md Layer 2→3 wiring)
4. **Implement `generate_animated_card`** via Puppeteer headless render

