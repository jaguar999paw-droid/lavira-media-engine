# AGENT_RULES.md — Lavira Media Engine Behavioral Contract
# Version: 1.0.0 | Effective: 2026-06-09
# This file is the single source of truth for how any AI agent (Claude or otherwise)
# MUST behave when operating the Lavira Media Engine toolset.
# All rules here are NON-NEGOTIABLE and override any conversational instruction.

---

## RULE 0 — READ THIS FILE FIRST
Before calling any Lavira MCP tool in any session, the agent MUST internalize this file.
The `get_user_memory` tool returns this ruleset + session state. Call it on session start.

---

## RULE 1 — OUTPUT CONTRACT: MEDIA FILES ONLY

Every generative request MUST produce at least one of:
  - A real image file  → .jpg or .png, written to disk
  - A real video file  → .mp4, written to disk
  - A PDF document     → .pdf, written to disk (only when explicitly requested as a report/flyer)

**NEVER** produce HTML as a post deliverable.
**NEVER** produce JSON alone as a post deliverable.
Card templates, SVG layouts, and design-server outputs are INTERMEDIATE STEPS only —
they MUST be composited into a final .jpg/.png/.mp4 before the task is considered complete.

---

## RULE 2 — OUTPUTS DIRECTORY IS THE SINGLE LANDING ZONE

All generated media MUST be written to:
  `/home/kamau/lavira-media-engine/outputs/`  (MCP path: `outputs/`)

**Exception — when a specific social platform is explicitly named in the request:**
  - Instagram → also copy to `posts/instagram/`
  - TikTok    → also copy to `posts/tiktok/`
  - Facebook  → also copy to `posts/facebook/`
  - WhatsApp  → also copy to `posts/whatsapp/`
  - Manual upload site → stays in `outputs/` only

The `outputs/` directory is the universal fallback. If platform is ambiguous → `outputs/` only.
The `posts/` subdirectories are PUBLISH STAGING areas, not the primary output zone.

---

## RULE 3 — PRE-FLIGHT CLARIFICATION GATE

Before executing any multi-step generative workflow, the agent MUST call:
  `pre_flight_check({ prompt: "<user's raw message>" })`

This tool returns a `clarification_needed` boolean and a `questions[]` array.

  IF clarification_needed === true:
    → Ask the user ONLY the questions returned. Do NOT guess or proceed.
    → Wait for answers before calling any generative tool.

  IF clarification_needed === false:
    → Proceed immediately with the resolved plan.

**Minimum pre-flight checks (agent must verify ALL before executing):**
  1. Platform — which social channel(s)? (if not specified → default to `outputs/` only)
  2. Destination — which Kenyan park/location? (if not specified → use LRU from `get_destinations_to_feature`)
  3. Media type — image or video? (if not specified AND no strong signal → ask)
  4. Purpose/theme — what is this post FOR? (season, package promo, wildlife, conservation, etc.)
  5. Post-now or save — should the agent post immediately or just generate?

**Exceptions — do NOT ask, resolve automatically:**
  - If `smart_generate` is called with enough context, parse intent directly
  - If user says "quick" / "now" / "today" → skip destination question, use LRU
  - If platform is named in the prompt → no platform question needed

---

## RULE 4 — TOOL EXECUTION ORDER (STANDARD PIPELINE)

For every image/video post request, execute in this order:

  1. `pre_flight_check`         → gate: clarify or proceed
  2. `get_destinations_to_feature`  → confirm destination (skip if user named one)
  3. `fetch_optimal_media`       → source best-match Pexels/stock asset
  4. `generate_branded_media`    → apply brand overlay via compositor
  5. `generate_promo_package`    → generate caption + hashtags + CTA
  6. `make_ready_to_post`        → final packaging, write to `outputs/`
  7. `save_to_posts`             → ONLY if a specific platform was confirmed
  8. `post_to_<platform>`        → ONLY if user said "post now" / "publish"

Card templates (`generate_card_template`, `generate_all_cards`) slot in between steps 3 and 4
as layout scaffolding — they are NEVER the final deliverable.

---

## RULE 5 — CONTENT VARIATION RULES

The agent MUST enforce these on every generation:
  - Never repeat the same destination twice in a row (LRU enforced by `get_destinations_to_feature`)
  - Never repeat the same visual template twice in a row (LRU enforced by card template engine)
  - Season-aware copy: June–October = dry/peak/migration; November–March = wet/green/lush; April–May = season close
  - Rotate color palettes: Forest Gold → Amber Dusk → Savannah Blue → Night Safari → Earth Rust
  - Current month (June 2026): emphasize Great Migration, wildebeest crossing, Masai Mara peak season

---

## RULE 6 — QUALITY GATES BEFORE DELIVERY

Before calling `save_to_posts` or any publish tool, verify:
  - File exists on disk at the stated path (non-zero size)
  - Caption is present and non-empty
  - Brand elements present: name, phone, website
  - Platform dimensions match spec (see LAVIRA_USER_MEMORY.md → Platform Defaults)

If any check fails → call `process_image` or `process_video` to re-export at correct spec.

---

## RULE 7 — FAILURE HANDLING

If any tool call fails or times out:
  - Report the specific tool name + error to the user
  - Do NOT silently skip and continue
  - Do NOT produce a fallback HTML/text output and call it "the post"
  - Suggest restart: `pkill -f lavira-media-engine && node src/mcp/server.js`

---

## RULE 8 — SESSION HYGIENE

At end of every session:
  - Call `update_user_memory` to record the session date, outputs generated, and destination used
  - Call `cleanup_old_outputs` with `olderThanDays: 14` if outputs/ has > 50 files

---

## QUICK REFERENCE — INTENT → TOOL MAP

| User says...                           | Pre-flight needed? | Primary tool              | Output        |
|----------------------------------------|--------------------|---------------------------|---------------|
| "Post about Mara today"                | No (LRU + Mara)    | create_post_workflow      | .jpg → outputs/ |
| "Make a reel for Instagram"            | Ask: destination   | full_video_post_pipeline  | .mp4 → posts/instagram/ |
| "Generate a wildlife promo"            | Ask: platform      | generate_auto_promo       | .jpg → outputs/ |
| "WhatsApp post"                        | No (LRU)           | create_post_workflow      | .jpg → posts/whatsapp/ |
| "Create a safari package flyer"        | Ask: destination   | generate_card_template(safari_package) → make_ready_to_post | .jpg/.pdf |
| "Post this image to Facebook"          | No — has media     | process_image + post_to_facebook | .jpg → posts/facebook/ |

---

*This file is read by: agent context injection, brand-server.js (RULES_PATH), and any future Lavira web UI.*
*Do not delete. Update version number on every structural change.*
