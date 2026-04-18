# Lavira Media Engine — Post Generation Upgrade Spec
**Document type:** AI Agent Handoff  
**Author:** Claude Sonnet 4.6 (via Jake's session, 17 Apr 2026)  
**Scope:** Template architecture, smart defaults, layout randomization, content-safety guardrails, and image-vision pipeline  
**Engine root:** `/home/kamau/lavira-media-engine/`  
**Primary file to change:** `src/engines/card-templates.js`  
**Supporting files:** `src/engines/media-augmentation.js`, `src/engines/promo.js`, `src/mcp/server.js`

---

## Background — what's broken right now

After a live audit of the current codebase, four structural problems were confirmed:

**1. Identical top/bottom chrome on every template**  
`topBar()` and `botBar()` are called unconditionally on all 10 templates (T1–T10). Every post gets the same dark header with `Lavira Safaris` in Arial Black and the same dark footer with phone + website. On a background photo, both bars cover 11% + 12% = 23% of the image with identical dark rectangles. The result looks like a stamp, not a designed post.

**2. Content text lands in the image centre by default**  
Most templates place their main content block (headline, hook, destination label) around `y ≈ 0.50–0.55 * h`. No awareness of where the subject is in the background photo, so text frequently occludes the rhino, summit, or safari vehicle that gives the image its value.

**3. No working defaults for sparse prompts**  
`buildDefaultData()` in `card-templates.js` exists but is only called from some code paths. The promo engine (`promo.js:121`) builds its own data object independently. If a user says "post about Mt Kenya", the `hook`, `highlight`, and `packageName` fields often arrive empty, causing blank text regions in the SVG.

**4. No real image intelligence**  
`detectSubjectArea()` in `media-augmentation.js` (line ~60) is explicitly a stub: it admits `"For now, use center bias with some randomness"` and returns a jitter around 50% x, 40% y. There is no actual edge-detection, saliency, or Claude Vision call. Weather, season, lighting, animal species, and scene context are all ignored.

---

## Goal summary (Jake's requirements)

| # | Requirement | Priority |
|---|---|---|
| 1 | At least **3 visually distinct** post layout families — header/footer not identical across all | Must-have |
| 2 | **Content guardrails** — text never occludes subject; safe zones detected from image | Must-have |
| 3 | **Smart defaults** — any one-word prompt produces a complete, publishable post | Must-have |
| 4 | **Randomised context injection** — pick hooks, angles, CTAs from curated pools without repeating | Should-have |
| 5 | **Claude Vision scan** — analyse background image for entities, weather, season, lighting before compositing | Should-have |
| 6 | Above bundled so the MCP server re-routes automatically; no new MCP tools needed | Nice-to-have |

---

## Step 1 — Redesign template layout families

### The core fix

Retire the single shared `topBar()` / `botBar()` approach. Replace with **three layout families**, each with its own branding strategy. Assign each of the 10 existing templates to a family in the `TEMPLATE_MAP`.

---

### Family A — "Minimal float" (clean, editorial)

**Brand placement:** A small pill badge in the top-left corner only (no full-width dark bar). Footer replaced by a slim one-line contact strip pinned to the very bottom with high transparency.

```
┌─────────────────────────────────────┐
│ [○ Lavira]                          │  ← 36px pill, top-left, rgba dark
│                                      │
│           (background image)         │
│                                      │
│  ╔═══════════════════════════╗       │
│  ║  DESTINATION HEADLINE     ║       │  ← frosted card, lower-left
│  ║  Hook line underneath     ║       │     never > 40% image height
│  ╚═══════════════════════════╝       │
│  +254 721 757 387 · lavirasafaris   │  ← 1-line strip, 28px, 0.78 alpha
└─────────────────────────────────────┘
```

**Assign to:** T1 (Hero Destination), T4 (Wildlife Spotlight), T7 (Story)

**SVG change:** Replace `topBar()` call with a `logoPill(w, h)` helper. Replace `botBar()` with `thinStrip(w, h)`. The content block (destination name + hook) moves to a frosted `<rect>` positioned in the **safe zone** (see Step 3).

---

### Family B — "Split panel" (structured, informational)

**Brand placement:** A left-side vertical accent bar (4px, amber) with the brand name rotated 90° along it. Footer is a solid green CTA band — the only full-width element.

```
┌─────────────────────────────────────┐
│▌                                    │  ← 4px amber bar, full height
│▌  PACKAGE NAME                      │
│▌  Duration · Destination            │
│▌                                    │
│▌  ✦ Highlight 1                     │
│▌  ✦ Highlight 2                     │
│▌  ✦ Highlight 3                     │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │  BOOK THIS SAFARI — WhatsApp     │ │  ← solid green CTA band
│ └──────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Assign to:** T2 (Package Card), T5 (Twin Destination), T8 (Stats), T9 (Itinerary)

**SVG change:** Remove `topBar()`. Add a `verticalBrand(w, h)` helper that draws the amber bar plus rotated text. Keep `botBar()` **only for this family**, renaming it `ctaBand()` and removing the phone/website repetition (move to one-liner inside the band).

---

### Family C — "Immersive overlay" (dramatic, full-bleed)

**Brand placement:** Logo mark only (circle with L, 42px) pinned top-right corner. No header bar at all. All copy floats over the image using the safe-zone system. Footer is transparent — contact info printed as small text over a semi-transparent pill at the very bottom.

```
┌─────────────────────────────────────┐
│                              [●L]   │  ← 42px logo mark, top-right
│                                      │
│                                      │
│                                      │
│  "Quote or hook line here,           │  ← placed in computed safe zone
│   spanning two lines max"            │
│                                      │
│              ★★★★★                  │
│         — Guest Name · Location     │
│                                      │
│  [  BOOK NOW  ]  +254 721 757 387  │  ← pill CTA + contact, bottom
└─────────────────────────────────────┘
```

**Assign to:** T3 (Testimonial), T6 (Activity Card), T10 (Offer)

**SVG change:** Remove `topBar()` and `botBar()` entirely. Add `logoMark(w, h, corner='top-right')` and `overlayContact(w, h)` helpers.

---

### Implementation checklist for Step 1

- [ ] Write `logoPill(w, h)` — returns SVG string, no full-width dark rect
- [ ] Write `thinStrip(w, h)` — 28px bottom strip, 0.78 opacity, single line
- [ ] Write `verticalBrand(w, h)` — 4px bar + rotated BN text, no header rect
- [ ] Write `ctaBand(w, h)` — replaces old `botBar()` for Family B only
- [ ] Write `logoMark(w, h, corner)` — 42px circle with L, no header rect
- [ ] Write `overlayContact(w, h)` — bottom-aligned pill with phone + web, no full bar
- [ ] Remap T1,T4,T7 → Family A helpers
- [ ] Remap T2,T5,T8,T9 → Family B helpers
- [ ] Remap T3,T6,T10 → Family C helpers
- [ ] Delete original `topBar()` and `botBar()` functions entirely

---

## Step 2 — Smart defaults engine

### Problem

`buildDefaultData()` exists in `card-templates.js` but is bypassed in the main promo pipeline. `promo.js:121`'s `generateAutoPromo()` builds its own partial data and never imports `buildDefaultData`.

### Fix: canonical `resolvePostData(destination, template, userContext)` function

Create a new file `src/engines/post-defaults.js`. This is the single source of truth for data flowing into any template.

```js
// src/engines/post-defaults.js
'use strict';
const BRAND = require('../orchestrator/brand');
const POOLS = require('./context-pools');   // new file — see Step 4

async function resolvePostData(destination, template, userContext = {}, imageAnalysis = {}) {
  const dest   = destination || pickRandom(BRAND.destinations);
  const prof   = BRAND.destination_profiles?.[dest] || {};
  const pkg    = findPackage(dest);
  const season = imageAnalysis.season || guessSeason();
  const time   = imageAnalysis.timeOfDay || 'morning';
  const mood   = imageAnalysis.mood || 'adventure';

  // Base layer — always populated
  const base = {
    destination: dest,
    hook:        userContext.hook || POOLS.hooks[mood][Math.floor(Math.random() * POOLS.hooks[mood].length)],
    highlight:   prof.highlight   || pkg.highlights?.[0] || `Discover ${dest} with Lavira`,
    packageName: pkg.name         || `${dest} Safari`,
    duration:    pkg.duration     || '3 days',
    highlights:  pkg.highlights   || prof.wildlife?.slice(0,4) || BRAND.usps?.slice(0,4) || [],
    cta:         POOLS.ctas[Math.floor(Math.random() * POOLS.ctas.length)],
    season,
    timeContext: POOLS.timeLines[time] || '',
  };

  // Template-specific overrides
  const overrides = buildTemplateOverrides(template, dest, prof, pkg, imageAnalysis);

  return { ...base, ...overrides, ...userContext };
}
```

**Key rules:**
- Every field that a template can render **must** have a non-empty fallback in `base`
- `userContext` (what the MCP user passed in) always wins — it is spread last
- `imageAnalysis` from the vision scan (Step 5) feeds in as a peer of `userContext`

### Wire into promo.js

In `promo.js → generateAutoPromo()`, replace the ad-hoc data assembly with:

```js
const { resolvePostData } = require('./post-defaults');
// ...
const postData = await resolvePostData(dest, selectedTemplate, parsedContext, imageAnalysis);
```

---

## Step 3 — Content guardrails (safe zone system)

### Problem

Text is currently placed at hardcoded fractional positions (`y ≈ 0.52 * h`). No relationship to where the image subject is.

### Solution: `computeSafeZones(w, h, subjectMap)` → returns allowed text placement regions

```
Image divided into a 3×3 grid:
┌─────┬─────┬─────┐
│ TL  │ TC  │ TR  │  row 0 (y: 0–33%)
├─────┼─────┼─────┤
│ ML  │ MC  │ MR  │  row 1 (y: 33–66%)
├─────┼─────┼─────┤
│ BL  │ BC  │ BR  │  row 2 (y: 66–100%)
└─────┴─────┴─────┘
```

Each cell gets an **occupancy score** from the subject map (0.0 = clear, 1.0 = fully occupied by subject). A cell is **safe** if occupancy < 0.45.

The function returns a ranked list of safe cells and maps them to SVG `y` anchor points:

```js
function computeSafeZones(w, h, subjectMap) {
  const cells = buildOccupancyGrid(w, h, subjectMap);  // 3×3 array of scores
  const safe  = cells.filter(c => c.score < 0.45).sort((a,b) => a.score - b.score);
  // Prefer lower cells for text (BL, BC, BR) so subject stays visible at top
  return safe.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, region: c.label }));
}
```

**Template text placement rule:**
- Before writing any text SVG element, call `computeSafeZones()`
- Pick the lowest-y safe cell that is also in the bottom half of the image (preferred) or top half (fallback)
- Set the SVG text `y` to `cell.y + padding`
- If no safe cell exists (fully-busy image), shrink text and force it to the bottom 15% strip at 0.88 opacity (always legible over any image)

**Brand elements are excluded from the safe-zone check** — the logo pill and thin strip are reserved screen estate and are never displaced.

---

## Step 4 — Randomised context pool

Create `src/engines/context-pools.js`. This provides the curated, brand-voice-consistent vocabulary that feeds into `resolvePostData()`.

```js
// src/engines/context-pools.js
'use strict';

module.exports = {
  hooks: {
    adventure: [
      "Africa's wildest chapter starts here.",
      "Some journeys change you. This is one of them.",
      "Not a holiday. A story you'll tell forever.",
      "Where the wild things are — and you finally are too.",
      "The Mara doesn't wait. Neither should you.",
    ],
    luxury: [
      "Effortless wilderness. Entirely yours.",
      "Safari redefined — private, personal, unforgettable.",
      "Every detail handled. Every moment yours to savour.",
    ],
    wildlife: [
      "They roamed here long before we arrived.",
      "A world where the animals still make the rules.",
      "The Big Five. Up close. On your schedule.",
    ],
    family: [
      "The trip your kids will describe to their grandchildren.",
      "Family time, wilder than you imagined.",
    ],
    conservation: [
      "See it now. Help protect it for always.",
      "Your safari funds the rangers who guard this world.",
    ],
  },

  ctas: [
    "Book via WhatsApp ·  +254 721 757 387",
    "DM us · Limited spots this season",
    "Reserve your dates · lavirasafaris.com",
    "WhatsApp Jake today · zero-stress booking",
    "Enquire now — we reply within the hour",
  ],

  timeLines: {
    sunrise: "At first light, the savanna belongs to you.",
    morning: "Mornings here feel like the world just began.",
    afternoon: "Golden hour stretches for miles.",
    sunset: "The sun sets over Africa — and it never gets old.",
    night: "After dark, the stars take over.",
  },

  seasonalContext: {
    dry: "Dry season: animals gather at waterholes. Sightings are exceptional.",
    wet: "After the rains: lush green, newborn wildlife, fewer crowds.",
    migration: "The Great Migration is underway — one of Earth's greatest spectacles.",
  },

  angleVariants: [
    // Different journalistic angles to prevent every post sounding the same
    { angle: 'sensory',     prefix: 'Imagine waking to' },
    { angle: 'invitation',  prefix: 'Come see why' },
    { angle: 'narrative',   prefix: 'This is the story of' },
    { angle: 'contrast',    prefix: 'No traffic. No deadlines. Just' },
    { angle: 'social_proof',prefix: 'Thousands of guests have called it the best trip of their lives.' },
  ],
};
```

**Anti-repeat guard:** In `resolvePostData`, track the last 5 hooks/ctas used via a small in-memory LRU (same pattern as the existing template LRU in `memory.js`). Re-roll if the chosen item matches any of the last 5.

```js
const usedHooks = new Set();  // initialise at module load, max 5 entries
function pickFresh(pool) {
  const candidates = pool.filter(x => !usedHooks.has(x));
  const pick = candidates.length ? pickRandom(candidates) : pickRandom(pool);
  usedHooks.add(pick);
  if (usedHooks.size > 5) usedHooks.delete(usedHooks.values().next().value);
  return pick;
}
```

---

## Step 5 — Claude Vision image analysis pipeline

This is the most impactful single change. Before compositing any overlay, call Claude's vision API on the background image. Extract structured context that feeds both `resolvePostData()` (for copy) and `computeSafeZones()` (for placement).

### New file: `src/engines/image-vision.js`

```js
// src/engines/image-vision.js
'use strict';
const fs  = require('fs');
const cfg = require('../config');

const VISION_PROMPT = `
You are analysing a background photograph for a safari marketing post.
Return ONLY a JSON object with these exact keys — no prose, no markdown:

{
  "entities":     ["string"],   // visible animals, people, vehicles, landmarks
  "background":   "string",     // dominant scene type: savanna|forest|mountain|water|sky|camp|vehicle_interior
  "weather":      "string",     // sunny|overcast|golden_hour|blue_hour|rain|misty
  "timeOfDay":    "string",     // sunrise|morning|afternoon|sunset|night
  "season":       "string",     // dry|wet|migration|post_rain
  "mood":         "string",     // adventure|luxury|wildlife|family|conservation
  "subjectRegion":"string",     // where main subject sits: top_left|top_center|top_right|middle_left|center|middle_right|bottom_left|bottom_center|bottom_right
  "clearRegions": ["string"],   // list of regions (same vocab) with no important content
  "primaryColor": "string",     // dominant hex color of the image, e.g. "#C47A3A"
  "safeTextZone": "string",     // best region for text overlay without blocking subject
  "confidence":   0.0           // float 0–1, your certainty in this analysis
}
`;

async function analyseImage(imagePath) {
  if (!cfg.ANTHROPIC_KEY) {
    console.warn('[vision] No ANTHROPIC_KEY — skipping image analysis, using defaults');
    return getDefaultAnalysis();
  }

  try {
    const imageData  = fs.readFileSync(imagePath);
    const base64     = imageData.toString('base64');
    const mediaType  = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const { Anthropic } = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: cfg.ANTHROPIC_KEY });

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',   // use vision-capable model
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: VISION_PROMPT },
        ],
      }],
    });

    const raw = response.content[0]?.text || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    return { ...getDefaultAnalysis(), ...parsed, analysed: true };
  } catch (err) {
    console.error('[vision] Analysis failed:', err.message);
    return getDefaultAnalysis();
  }
}

function getDefaultAnalysis() {
  return {
    entities:      [],
    background:    'savanna',
    weather:       'sunny',
    timeOfDay:     'morning',
    season:        'dry',
    mood:          'adventure',
    subjectRegion: 'center',
    clearRegions:  ['bottom_left', 'bottom_right', 'top_right'],
    primaryColor:  '#2D6A4F',
    safeTextZone:  'bottom_left',
    confidence:    0.0,
    analysed:      false,
  };
}

// Map safeTextZone string to SVG anchor coords
function zoneToCoords(zone, w, h, padding = 40) {
  const map = {
    top_left:      { x: padding,         y: padding + 80 },
    top_center:    { x: w / 2,           y: padding + 80, anchor: 'middle' },
    top_right:     { x: w - padding,     y: padding + 80, anchor: 'end' },
    middle_left:   { x: padding,         y: h * 0.45 },
    center:        { x: w / 2,           y: h * 0.50, anchor: 'middle' },
    middle_right:  { x: w - padding,     y: h * 0.45, anchor: 'end' },
    bottom_left:   { x: padding,         y: h * 0.72 },
    bottom_center: { x: w / 2,           y: h * 0.72, anchor: 'middle' },
    bottom_right:  { x: w - padding,     y: h * 0.72, anchor: 'end' },
  };
  return map[zone] || map['bottom_left'];
}

module.exports = { analyseImage, zoneToCoords, getDefaultAnalysis };
```

### Wire into the render pipeline

In `card-templates.js → renderCard()`:

```js
const { analyseImage, zoneToCoords } = require('./image-vision');

async function renderCard({ template, data, backgroundImage, profile }) {
  const [w, h] = SIZES[profile] || [1080, 1080];

  // 1. Analyse background before building SVG
  let imageAnalysis = getDefaultAnalysis();
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    imageAnalysis = await analyseImage(backgroundImage);
  }

  // 2. Resolve data with full context (vision + user input)
  const resolvedData = await resolvePostData(data.destination, template, data, imageAnalysis);

  // 3. Compute safe text anchor from vision output
  const textAnchor = zoneToCoords(imageAnalysis.safeTextZone, w, h);
  resolvedData._textAnchor = textAnchor;   // templates read this

  // 4. Build SVG with the resolved data
  const fn = TEMPLATE_MAP[template] || T1;
  const svgBuf = Buffer.from(fn(w, h, resolvedData));

  // ... rest of compositing unchanged
}
```

Each template function reads `data._textAnchor` to position its main text block:

```js
// Example inside T1 — before:
const cy = Math.round(h * 0.52);

// After:
const anchor = d._textAnchor || { x: Math.round(w * 0.06), y: Math.round(h * 0.52) };
const cx = anchor.x;
const cy = anchor.y;
```

### Vision-to-copy mapping

The vision output also feeds copy decisions in `resolvePostData()`:

| Vision field | Copy effect |
|---|---|
| `mood: 'luxury'` | Picks from `POOLS.hooks.luxury` |
| `timeOfDay: 'sunrise'` | Injects `POOLS.timeLines.sunrise` as `timeContext` |
| `season: 'migration'` | Injects `POOLS.seasonalContext.migration` as `seasonLine` |
| `entities` includes `'rhino'` | Sets `animal = 'Rhino'` for wildlife templates |
| `weather: 'golden_hour'` | Bumps amber color accent weight |
| `background: 'mountain'` | Forces `destination` default to a mountain destination |

---

## Step 6 — MCP server wiring (no new tools)

No new MCP tools need to be added. The improvements are internal to the render pipeline. The existing `create_post_workflow`, `generate_all_cards`, and `generate_branded_media` tools all call `renderCard()` — they automatically get the new behaviour.

**One small MCP change:** expose `imageAnalysis` in the job result so the AI agent can see what was detected:

In `server.js`, wherever job results are built, add:

```js
results.imageAnalysis = job.imageAnalysis || null;
```

This lets the MCP client (Claude) report back: *"I detected a golden-hour rhino scene and placed copy in the bottom-left safe zone."*

---

## Step 7 — Default inference for sparse prompts

When a user sends a one-word or content-free prompt (e.g. just `"Mt Kenya"` or `"rhino post"`), the pipeline must auto-fill everything to produce a publication-ready post. The inference chain:

```
User prompt: "rhino"
        │
        ▼
resolvePostData()
  destination  → scan BRAND.destinations for "rhino" in destination_profiles.wildlife → "Ol Pejeta"
  template     → auto-select 'wildlife_spotlight' (rhino = animal entity)
  hook         → POOLS.hooks.wildlife[random, fresh]
  highlight    → BRAND.destination_profiles["Ol Pejeta"].highlight
  packageName  → findPackage("Ol Pejeta").name
  season       → guessSeason() based on current month
  cta          → POOLS.ctas[random, fresh]
        │
        ▼
analyseImage() on fetched Pexels image
        │
        ▼
computeSafeZones() → textAnchor
        │
        ▼
SVG rendered, post packaged ✓
```

### `guessSeason()` implementation

```js
function guessSeason() {
  const m = new Date().getMonth() + 1;   // 1–12
  if ([7, 8, 9, 10].includes(m)) return 'migration';  // Jul–Oct: Great Migration
  if ([6, 11, 12, 1, 2].includes(m)) return 'dry';    // Jun, Nov–Feb: dry season
  return 'wet';                                         // Mar–May: long rains
}
```

---

## File-by-file change summary

| File | Change |
|---|---|
| `src/engines/card-templates.js` | Replace `topBar`/`botBar` with 3 family helpers; all 10 templates updated; `buildDefaultData` removed (replaced by `post-defaults.js`); `renderCard` calls vision + resolvePostData |
| `src/engines/post-defaults.js` | **NEW** — canonical data resolver with fallbacks; imports context-pools and vision |
| `src/engines/context-pools.js` | **NEW** — curated hooks, CTAs, time lines, seasonal context, angle variants; anti-repeat LRU |
| `src/engines/image-vision.js` | **NEW** — Claude Vision API call; returns structured scene analysis; `zoneToCoords()` helper |
| `src/engines/media-augmentation.js` | Replace stub `detectSubjectArea()` with a call to `image-vision.js`; remove random-jitter logic |
| `src/engines/promo.js` | Import `resolvePostData`; remove local ad-hoc data building; pass `imageAnalysis` through |
| `src/mcp/server.js` | Surface `imageAnalysis` in job results; no new tools |

---

## Testing checklist (for next agent to verify before deploy)

- [ ] `node -e "require('./src/engines/card-templates.js')"` — no syntax errors
- [ ] Generate T1 with empty `data = {}` — no blank text regions in output
- [ ] Generate T3 (Family C) — no `topBar` dark rectangle visible
- [ ] Generate T2 with a mountain background — text not over the peak
- [ ] Run `create_post_workflow` with prompt `"rhino"` only — produces complete post
- [ ] Vision API key present: confirm `imageAnalysis.analysed === true` in job result
- [ ] Vision API key absent: confirm `imageAnalysis.analysed === false`, post still renders
- [ ] Five consecutive posts — confirm hooks are not repeated
- [ ] Story format (1080×1920) — text anchors scale correctly (not stuck at 1080×1080 coords)

---

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| Vision API latency adds 1–3s per post | Cache `analyseImage()` result by image URL hash; re-use within same session |
| Claude Vision JSON parse failure | Catch and fall back to `getDefaultAnalysis()` — already coded |
| `safeTextZone` puts text under logo pill | Each family helper reserves top 12% and bottom 10% as brand-only zones before the safe-zone calculation runs |
| New template families break existing card tests | Old `topBar`/`botBar` were not tested — no regression risk. New helpers should be tested post-deploy |
| `context-pools.js` hooks feel off-brand | Jake to review the pool values before deploy; file is easy to edit |

---

*End of spec. Good luck, next agent. The engine is solid — these changes make it match what Jake is actually building.*
