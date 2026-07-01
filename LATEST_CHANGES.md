# Lavira Post Quality Overhaul — Ruleset + Signature Variance Engine

Status: **planning / spec document**. No rendering code has been changed yet — this file defines the rules the MCP agent (Claude) must follow when generating Lavira posts, and the randomization mechanism to implement so no two posts look alike. See "Implementation TODOs" for what's still code-side work.

---

## 1. Root cause of today's weak post

Symptoms reported: minimal content, scattered/unplanned layout, no context-awareness, weak Lavira branding, poor layout.

**Diagnosis (verified against source):**

- The `auto` content workflow renders through `src/engines/compositor.js` → `buildOverlaySVG()`. Every dimension in that function is a fixed percentage of image width/height (e.g. `topBarH = h * 0.10`, `logoSize = topBarH * 0.70`, `hookBandY = h * 0.72`). There is no randomness and no per-post variation of any kind in this path.
- The engine already has a smarter layer that the `auto` path does **not** call:
  - `src/engines/dynamic-templates.js` — a `TEMPLATE_REGISTRY` with 5 templates (`hero_destination`, `package_promo`, `testimonial`, `wildlife_spotlight`, `activity_highlight`), each with allowed layout variants (`standard`, `story`, `minimal`), plus `selectTemplate()` which picks intelligently based on content type and media analysis, and already tracks usage history to avoid repeats.
  - `src/engines/intelligence-router.js` — 5 named palettes (`ForestGold`, `AmberDusk`, `SavannahBlue`, `NightSafari`, `EarthRust`), an entity→destination map (e.g. `lion`→Masai Mara, `flamingo`→Nakuru), and weather→palette mapping.
  - `src/engines/context-pools.js` — curated hook lines by theme (`adventure`, `luxury`, `wildlife`, `family`, `conservation`), a CTA pool, time-of-day lines, seasonal context lines, and "angle variants" for caption framing.
- Net effect: the post you reviewed used none of this. It got one fixed layout, one fixed logo size/position, and whatever caption text the job happened to generate — which is exactly why it read as generic and under-branded.

**The fix is not "write a better prompt."** It's wiring the `auto`/`smart_generate` path to call the intelligent engines that already exist, and adding true randomization on top of them. Sections 2–4 below define exactly how.

---

## 2. Standing Ruleset — apply on EVERY post, regardless of how minimal the request is

This is the checklist the agent must silently run through before calling any Lavira media/publish tool. The person should be able to say just "make me a post about Amboseli" and get an on-brand, context-aware, non-repetitive result without spelling out any of this.

### A. Context-awareness
- Resolve the destination (or infer it from the media/theme given) and pull real, destination-specific facts: signature wildlife, known packages, best season/time-of-day for that spot. Use `intelligence-router.js`'s `ENTITY_DEST_MAP` and `get_safari_packages` so captions reference something true about that destination, not generic safari copy.
- If a season/weather signal is available, let it drive palette choice via `WEATHER_PALETTE` rather than defaulting to one look every time.
- Tie every post to a sellable angle: a specific package name/duration, a testimonial angle, a conservation angle, etc. — never just "pretty picture + generic caption."

### B. Mandatory brand presence (non-negotiable, checked before any post is considered done)
- [ ] Lavira logo visible and legible
- [ ] Brand name text present
- [ ] Contact bar present (phone/WhatsApp AND website, from the brand dictionary — never hard-coded, always pulled from `get_brand_info`)
- [ ] Consistent brand color present somewhere in the palette used (not necessarily identical every time — see Section 3 — but recognizably "Lavira")
- [ ] Caption includes a CTA (from the CTA pool or equivalent) — no post ships without a next action for the viewer

### C. Layout & legibility
- Respect safe zones: no text within the platform's UI-overlap zones (Instagram Story top/bottom ~14% each, feed post standard safe margins).
- Maintain contrast: text over photo must sit on a scrim/overlay band strong enough to stay legible against any image (use the palette's `overlay` alpha value, don't render text directly on raw photo).
- Never let hook text and destination chip collide — `dynamic-templates.js`'s `calculateTextLayout()` already does media-aware layout calc; use it instead of fixed offsets.

### D. Copy
- Pull hook lines from `context-pools.js` matched to the post's theme category, not one default tone every time.
- Vary caption structure using `angleVariants` (sensory / invitation / narrative / contrast / social proof) so consecutive posts don't all read the same way.
- Keep hashtags destination + theme specific, not a static block reused verbatim across every post.

### E. Media selection
- Prefer media that actually matches the resolved destination/entity (checked against `ENTITY_DEST_MAP`) over generic stock that merely fits the mood.
- Pull 2–3 candidates via `fetch_optimal_media`/`search_external_media` and pick the one with the best composition for the chosen template's `mediaAware` layout, not just the first result.

### F. Platform specifics
- Each platform target (`instagram_post`, `instagram_story`, `facebook_feed`, `tiktok`, `whatsapp`) gets its own aspect ratio and layout pass — never one image naively squeezed into three shapes.

### G. Pre-publish QA (run silently before staging to `outputs/`)
1. All Section B checkboxes pass
2. This exact template+palette+hook combination was not used in the last 5 posts (Section 3)
3. Caption references a real destination fact/package, not filler
4. Files land in `outputs/`; nothing is copied to `posts/` or marked approved without explicit user confirmation

---

## 3. The Signature Variance Engine (randomization layer)

**Philosophy:** random, but never arbitrary. Every randomized choice is drawn from a curated, brand-safe pool — the randomness is *which approved option gets picked*, never *whether brand/legibility rules are followed*. This is what makes every post look different while still looking like Lavira.

### Randomizable dimensions and their pools (grounded in what already exists in code)

| Dimension | Pool (source) | Notes |
|---|---|---|
| Template | `TEMPLATE_REGISTRY` in `dynamic-templates.js` (5 templates) | Filtered by content type first, then randomized among remaining candidates |
| Layout variant | Each template's `layouts` array (`standard`/`story`/`minimal`) | Constrained to what the chosen template allows |
| Palette | `PALETTES` in `intelligence-router.js` (5 named palettes) | Weighted toward `WEATHER_PALETTE` match when weather/time data is available; otherwise uniform random across all 5 |
| Logo position | New: define a small set of brand-safe corners (e.g. top-left default, top-right, bottom-left-above-contact-bar) | Must never overlap the contact bar or hook text — compute the exclusion zone first, then randomize within what's left |
| Hook line | `hooks[theme]` in `context-pools.js` | Exclude any hook used in the last 5 posts for that theme |
| CTA | `ctas` in `context-pools.js` | Same no-repeat-last-5 rule |
| Caption angle | `angleVariants` in `context-pools.js` | Rotates sensory/invitation/narrative/contrast/social-proof framing |
| Accent/font pairing | **Not yet in code** — needs 2–3 approved pairings defined (e.g. a display serif + a clean sans, one alternate weight set) | Flagged as an implementation TODO below |

### No-repeat rule
Maintain a short rolling history (extend the existing `templateUsageHistory` Map pattern already in `dynamic-templates.js`) of the last 5 posts' full combo (template + palette + hook + CTA). Before finalizing a post, reject any exact-combo repeat and re-roll that one dimension.

### Reproducibility
Log the resolved variation choices into the job's `meta` field (template, layout, palette, logo corner, hook index, CTA index, angle) so any post can be explained or reproduced later — "why does this one look like this" should always be answerable from the job record, not a mystery.

---

## 4. Implementation TODOs (code-level — not yet done)

1. **Wire the smart path in**: change the `auto`/`smart_generate` workflow to call `selectTemplate()` + `renderDynamicTemplate()` (from `dynamic-templates.js`) instead of going straight to `compositeImage()` (`compositor.js`). This is the single highest-impact fix — it turns on everything that already exists but is dormant.
2. **Add a variation engine module** (new file, e.g. `src/engines/variation-engine.js`) that owns the randomization logic in Section 3: picks template/layout/palette/logo-corner/hook/CTA/angle as one resolved "variation object," enforces the no-repeat-last-5 rule, and returns it to the renderer.
3. **Extend `buildOverlaySVG()`/`renderDynamicTemplate()`** to accept that variation object and actually apply logo-corner and palette instead of the current fixed values.
4. **Define font pairings** — currently there's no font variation at all; needs 2–3 approved pairings added to the brand dictionary.
5. **Persist last-5 history** — either extend the in-memory `templateUsageHistory` Map to store full combos (works until restart) or persist to `lavira.db` (survives restarts, safer default).
6. **Route caption generation through `context-pools.js` + `intelligence-router.js`** consistently — confirm `generate_marketing_payload`/caption logic actually pulls hooks/CTAs/angle variants from there rather than generating ad hoc phrasing, so Section 2D is enforced in practice, not just in theory.

None of this has been implemented yet — say the word and I'll do the wiring (item 1 first, since it activates the existing intelligence with the least new code).

---

## 5. Master prompt

Use this whenever you want a Lavira post, no matter how minimal your actual request is — it tells the agent to apply everything above automatically:

> Create a Lavira Safaris post for [destination or theme — can be as short as one word]. Follow the ruleset and Signature Variance Engine defined in `LATEST_CHANGES.md` in the lavira-media-engine repo: resolve real destination context, select media that actually matches it, apply full mandatory branding (logo, brand name, contact bar, CTA), and randomize template/layout/palette/logo-position/hook/CTA/caption-angle from their approved pools — excluding any combination used in the last 5 posts. Log the resolved variation choices in the job's metadata. Stage the result in `outputs/` only — do not copy to `posts/` or mark it approved without my explicit confirmation.

Once item 1 in Section 4 is implemented, this one prompt is all you need per post — the rules live in this file, not in what you type.
