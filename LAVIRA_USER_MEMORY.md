# Lavira Media Engine — User Memory & Productivity Profile
<!-- AUTO-UPDATED by engine. Edit preferences below — engine reads this on every session. -->
<!-- Last session: 2026-04-28 -->

## 🧠 WHO IS USING THIS ENGINE
- **Owner:** Jake (Kamau) — builds & operates the Lavira Media Engine
- **Role:** Solo operator managing all social content for Lavira Safaris (Kenya)
- **Setup:** Ubuntu machine "dizaster" · Claude Desktop + tmux · Tailscale Funnel
- **Engine path:** `/home/kamau/lavira-media-engine`

---

## ⚡ STANDING PREFERENCES (engine always applies these)

### Output Format — ABSOLUTE RULE
- **Posts MUST always be real image (.jpg/.png) or video (.mp4) files**
- HTML is ONLY used for the dashboard/admin UI — NEVER as post output
- Every tool call that produces content MUST write to `/outputs/` as a media file
- No exceptions regardless of source: Claude, Cursor, HTTP request, scheduler

### Platform Defaults
- WhatsApp post → 1080×1080 .jpg (square, max 16MB)
- Instagram feed → 1080×1080 .jpg
- Instagram story → 1080×1920 .jpg
- TikTok / Reel → 1080×1920 .mp4
- Facebook → 1280×720 .jpg
- Twitter/X → 1200×628 .jpg

### Visual Style
- Color palette: rotate across 5 palettes (Forest Gold, Amber Dusk, Savannah Blue, Night Safari, Earth Rust)
- Never repeat the same header/footer/badge style twice in a row
- Font stack: randomize per render (Arial Black, Georgia, Impact, Trebuchet)
- Gradient: directional, randomized angle per render
- Always include: brand name + phone + website on every output

### Content Preferences
- Theme rotation: wildlife_spotlight → destination_profile → safari_package_promo → testimonial → conservation
- Destination rotation: use LRU — never feature same destination twice in a row
- Season-aware: April = migration preview, June-Oct = dry/peak season, Nov-Mar = wet/green

---

## 🎯 SMART PROMPTS THAT WORK (no extra explanation needed)

| Prompt | What it does |
|---|---|
| `"Generate a WhatsApp post for today"` | Auto-picks LRU destination + theme, produces 1080×1080 .jpg |
| `"Make a Masai Mara reel"` | Fetches stock video, processes to 9:16, adds brand overlay, returns .mp4 |
| `"Post about elephants in Amboseli"` | Detects destination + wildlife theme, produces branded image set |
| `"Create a safari package promo"` | Triggers package_promo template with pricing + highlights |
| `"Run today's schedule"` | Triggers daily promo for all pending scheduled slots |
| `"Show me what's in outputs"` | Lists all generated files with download URLs |
| `"Approve the last job"` | Marks most recent job as approved |

---

## 📱 SOCIAL PLATFORM STATUS

| Platform | Status | Required |
|---|---|---|
| Instagram | ✗ needs token | INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID |
| Facebook | ✗ needs token | FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID |
| TikTok | ✗ needs approval | TIKTOK_ACCESS_TOKEN |
| Twitter/X | ✗ needs 4 keys | TWITTER_API_KEY/SECRET + ACCESS_TOKEN/SECRET |
| WhatsApp Business | ✗ needs setup | WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN |
| Telegram | ✗ easiest | TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID |

---

## 🔧 KNOWN ISSUES (tracked here so they don't need re-explaining)

- `outputs[]` in `list_recent_jobs` is empty — bug in memory.js (join against disk not done yet)
- Anthropic key: present and working as of last session
- Pexels key: active
- GIPHY key: active
- Instagram/TikTok: not configured — files saved to /outputs for manual upload

---

## 🗺️ CONTENT CALENDAR MEMORY

| Destination | Last featured | Next due |
|---|---|---|
| Masai Mara | 2026-04-28 | auto |
| Amboseli | — | auto |
| Samburu | — | auto |
| Tsavo | — | auto |
| Nakuru | — | auto |

---

## 📋 SESSION CHECKLIST (Claude reads this each new session)

1. Check engine health before generating any content
2. Posts = images/videos ONLY — never HTML
3. Files always land in `/outputs/<filename>` — serve via `/outputs/<filename>` URL
4. Apply card-templates v4 for all static image posts
5. Multi-platform publisher: adapt caption per channel automatically
6. Use intent.js to parse any casual prompt before choosing tools
7. Update this file's "Last session" date at end of session

---
*Updated by: Lavira Media Engine MCP · Engine v3.0*

---

## 📝 SESSION LOG — 2026-04-28

- Generated TikTok reel: `posts/tiktok/lavira_tiktok_masaimara_branded.mp4`
- Specs: 1080×1920 · 20s · H.264 · 8.9MB · Ken Burns zoom · brand watermark
- Caption hook: *"Where lions rule the golden savanna 🌅"*
- Destination: Masai Mara · Theme: wildlife_spotlight · April migration preview
- All patches applied: `update_user_memory` ✅ · `cleanup_old_outputs` ✅ · WhatsApp posts dir ✅ · smart_generate auto-save ✅
- TikTok token not yet configured — upload `posts/tiktok/lavira_tiktok_masaimara_branded.mp4` manually


## CONTENT CALENDAR

**2026-04-28 | WhatsApp | Hippos — Masai Mara**
- File: `posts/whatsapp/lavira_whatsapp_hippos_masaimara_final.jpg`
- Specs: 1080×1080 · 210KB · JPEG 90 · warm grade + sharpen + vignette
- Source: Pexels #32445261 — Tomasz Dworczyk
- Hook: "Africa's River Giants Await 🦛"
- Package promo: 2 Days Masai Mara Safari

