# 🧠 Vision Intelligence & Media Sources Roadmap
## Lavira Media Engine — Next-Agent Handoff Document
**Written:** 2026-04-28 | **By:** Claude (session closing) | **For:** Next agent to implement

---

## 1. WHERE WE ARE NOW — Current Vision Pipeline

```
image-vision.js (Claude Haiku)
  └─► returns: entities, background, weather, timeOfDay, season,
               mood, subjectRegion, clearRegions, primaryColor,
               safeTextZone, confidence
        │
        ▼
  card-templates.js
    └─► ONLY uses: safeTextZone → text anchor positioning
    └─► IGNORES: weather, entities, vegetation, mood, timeOfDay for content

  compositor.js
    └─► does NOT call analyseImage() at all
    └─► overlayOpts passed in manually by caller
```

### What's Broken / Underused
| Signal | Detected? | Drives Output? | Gap |
|---|---|---|---|
| `weather` | ✅ Yes | ❌ No | Golden hour image gets same copy as midday shot |
| `timeOfDay` | ✅ Yes | ❌ No | Sunrise/sunset = poetic copy; never applied |
| `season` | ✅ Yes | ❌ No | Migration season ≠ dry season copy |
| `entities` | ✅ Yes | ❌ No | Hippos / elephants / lions don't change the hook |
| `vegetation` | ❌ Not detected | ❌ No | Green (wet) vs golden (dry) vs burnt (post-fire) not read |
| `mood` | ✅ Yes | 🟡 Partially | adventure/luxury returned but palette not matched |
| `primaryColor` | ✅ Yes | ❌ No | Could auto-select closest brand palette |
| `confidence` | ✅ Yes | ❌ No | Low-confidence fallback never triggered |

---

## 2. THE TARGET STATE — Intelligence-Driven Post Generation

```
PHOTO INPUT
    │
    ▼
[LAYER 1] image-vision.js — extended prompt
    Detects: entities, weather, vegetation_type, vegetation_density,
             climate_zone, water_presence, time_of_day, season,
             sky_condition, human_activity, vehicle_presence,
             emotional_tone, composition_quality, subject_clarity

    │
    ▼
[LAYER 2] intelligence-router.js  (NEW — build this first)
    Maps vision signals → content decisions:
    ┌──────────────────────────────────────────────────┐
    │ weather=golden_hour  → palette=AmberDusk          │
    │                      → hook_pool=wildlife.sunset  │
    │                      → caption_tone=poetic        │
    │ weather=misty        → palette=SavannahBlue       │
    │                      → hook="Mist over the Mara…" │
    │ entities=[hippo]     → conservation_hook          │
    │                      → package=masai_mara_2day    │
    │ entities=[elephant]  → amboseli route suggested   │
    │ vegetation=wet_green → season_copy=post_rain      │
    │ vegetation=dry_gold  → season_copy=dry_season     │
    │ water_presence=true  → lake/river hooks activated  │
    │ sky=dramatic_clouds  → high overlay contrast mode │
    └──────────────────────────────────────────────────┘
    │
    ▼
[LAYER 3] Feeds into ALL generators
    card-templates.js  → palette, hook, zone, CTA, font style
    compositor.js      → overlay opacity, gradient direction, logo position
    promo.js           → caption tone, hashtags, package recommendation
    context-pools.js   → hook selected from entity-matched sub-pool
```

---

## 3. IMPLEMENTATION PLAN

### Phase 1 — Extend the Vision Prompt (1 day)
**File:** `src/engines/image-vision.js`

Extend `VISION_PROMPT` to detect:
```json
{
  "entities":           ["hippo", "water"],
  "entity_count":       12,
  "entity_confidence":  0.92,
  "background":         "river",
  "vegetation_type":    "riverine_forest",
  "vegetation_density": "dense",
  "vegetation_color":   "green",
  "water_presence":     true,
  "water_type":         "river",
  "weather":            "golden_hour",
  "sky_condition":      "partly_cloudy",
  "time_of_day":        "sunset",
  "season":             "wet",
  "climate_feel":       "humid",
  "human_activity":     "none",
  "vehicle_presence":   false,
  "composition_quality": "excellent",
  "subject_clarity":    "high",
  "emotional_tone":     "majestic",
  "safeTextZone":       "bottom_left",
  "clearRegions":       ["top_right", "bottom_left"],
  "primaryColor":       "#6B4226",
  "mood":               "wildlife",
  "confidence":         0.91
}
```

Also add **persistent disk cache** (JSON file in `assets/vision_cache/`):
```javascript
// assets/vision_cache/<md5_of_path>.json
// TTL: 7 days — avoids re-analysing same image
```

---

### Phase 2 — Build `intelligence-router.js` (2 days)
**New file:** `src/engines/intelligence-router.js`

This is the brain that maps vision → every content decision.

```javascript
// ENTITY → PACKAGE routing
const ENTITY_TO_DESTINATION = {
  hippo:       { destinations: ['Masai Mara', 'Naivasha'], pkg: '2-days-masai-mara' },
  elephant:    { destinations: ['Amboseli', 'Tsavo'],      pkg: '3-days-amboseli' },
  lion:        { destinations: ['Masai Mara', 'Samburu'],  pkg: '2-days-masai-mara' },
  leopard:     { destinations: ['Masai Mara', 'Samburu'],  pkg: '4-days-ol-pejeta-samburu' },
  rhino:       { destinations: ['Ol Pejeta'],              pkg: '2-days-ol-pejeta' },
  flamingo:    { destinations: ['Lake Nakuru'],             pkg: '2-days-naivasha-nakuru' },
  wildebeest:  { destinations: ['Masai Mara'],              pkg: '5-days-amboseli-masai-mara' },
  giraffe:     { destinations: ['Masai Mara', 'Samburu'],  pkg: '3-days-samburu' },
  zebra:       { destinations: ['Masai Mara', 'Amboseli'], pkg: '2-days-masai-mara' },
  cheetah:     { destinations: ['Masai Mara'],              pkg: '5-days-amboseli-masai-mara' },
};

// WEATHER/LIGHT → PALETTE
const WEATHER_TO_PALETTE = {
  golden_hour: 'AmberDusk',
  blue_hour:   'SavannahBlue',
  sunrise:     'ForestGold',
  sunny:       'EarthRust',
  overcast:    'NightSafari',
  misty:       'SavannahBlue',
  rain:        'SavannahBlue',
};

// VEGETATION → SEASON COPY
const VEGETATION_TO_SEASON = {
  wet_green:   { tag: 'post_rain',  copy: 'The rains have come — Africa is reborn 🌿' },
  dry_golden:  { tag: 'dry_season', copy: 'Golden savanna. Peak season. Your window is now.' },
  burnt:       { tag: 'fire_season',copy: 'After the flames, the wildlife concentrates.' },
  lush_forest: { tag: 'wet_season', copy: 'The forest breathes. The animals feast.' },
};

// ENTITY → HOOK POOL
const ENTITY_TO_HOOK_POOL = {
  hippo:      'conservation',  // → context-pools.hooks.conservation
  rhino:      'conservation',
  elephant:   'wildlife',
  lion:       'wildlife',
  leopard:    'adventure',
  camp_scene: 'luxury',
  family:     'family',
  maasai:     'cultural_moment',
};

// TONE MATRIX: weather × time_of_day → caption_style
// [overcast][morning] = factual | [golden_hour][sunset] = poetic
// [misty][morning] = moody | [sunny][afternoon] = energetic
```

**Key function:**
```javascript
function routeIntelligence(visionResult) {
  return {
    palette:        resolvePalette(visionResult),
    hookPool:       resolveHookPool(visionResult),
    captionTone:    resolveCaptionTone(visionResult),
    suggestedDest:  resolveDestination(visionResult),
    suggestedPkg:   resolvePackage(visionResult),
    seasonCopy:     resolveSeasonCopy(visionResult),
    overlayOpacity: resolveOpacity(visionResult),
    ctaStyle:       resolveCTA(visionResult),
    hashtagBoost:   resolveHashtags(visionResult),
  };
}
```

---

### Phase 3 — Wire Router into Every Generator (1 day)
**Files to update:**
- `src/engines/card-templates.js` — use `routeIntelligence()` to select palette + zone
- `src/engines/compositor.js` — call `analyseImage()` before compositing; pass intel to overlay
- `src/engines/promo.js` — feed `captionTone` + `seasonCopy` + `suggestedPkg` into AI prompt
- `src/orchestrator/intent.js` — if no destination given, use `suggestedDest` from vision

---

### Phase 4 — MCP Tool Exposure (0.5 day)
**Add to `src/mcp/server.js`:**

```javascript
{ name: 'analyse_image_intelligence',
  description: 'Full vision analysis: entities, weather, vegetation, climate, emotional tone → routing decisions for palette, copy, package. Use before generating any post from an uploaded or found image.',
  inputSchema: { type:'object', properties: {
    filePath:    { type:'string' },
    destination: { type:'string', description:'Override if known' },
  }, required:['filePath'] } }
```

---

## 4. BETTER MEDIA SOURCES THAN GIPHY

### Tier 1 — Free / Low Cost (implement first)

| Source | API | Best For | Free Tier | Key |
|---|---|---|---|---|
| **Wikimedia Commons** | REST API | Historical/wildlife, no license worries | Unlimited | None needed |
| **iNaturalist** | REST API | Species photos geo-tagged in Kenya/Africa | Unlimited | Free |
| **Flickr** | REST API (CC filter) | High-quality wildlife, filter CC-BY | 500/hr | Free key |
| **Pixabay** | REST API | Wildlife vectors, illustrations | 100/hr | Free key |
| **Freepik (API)** | REST API | Vectors, infographics for card backgrounds | Limited | Paid |

**iNaturalist is the highest-value free source** — it has thousands of Kenya-specific wildlife observations with photographer-credited photos, GPS coordinates (Masai Mara, Amboseli etc.), and species-level accuracy. This directly maps to Lavira's destinations.

```javascript
// iNaturalist API — search by place_id + taxon
// Masai Mara place_id: 105012
// Amboseli place_id: 105016
const url = `https://api.inaturalist.org/v1/observations?
  place_id=105012&taxon_name=Hippopotamus+amphibius
  &photos=true&quality_grade=research&per_page=10`;
```

### Tier 2 — Premium (configure keys when budget allows)

| Source | Cost | Why Worth It |
|---|---|---|
| **Shutterstock API** | $0.22–$2.50/image | Largest safari-specific library, editorial rights |
| **Adobe Stock API** | $0.26+/image | Best leopard/rare wildlife coverage |
| **Getty Images Embed** | Free embed only | For blog/web, not downloadable |
| **Storyblocks (Videoblocks)** | $149/yr unlimited | Best for B-roll safari video stock |
| **Artlist** | $199/yr | Best licensed music for reels (no copyright strikes) |

### Tier 3 — Lavira-Specific Sources (highest authenticity)

| Source | How to Access | Value |
|---|---|---|
| **lavirasafaris.com/wp-content/** | Direct scrape (already started) | Real photos from their actual safaris — zero licensing issue |
| **GetYourGuide API** | Partner account + API key | Live availability + real guest photos |
| **Wetu API** | Already a partner | Itinerary images + destination photography |
| **Google My Business Photos** | GMB API | Customer-uploaded photos of their safaris |
| **TripAdvisor Content API** | Apply for access | Authentic guest review photos |

### Implementation: `media-library.js` Upgrade

```javascript
// src/engines/media-library.js — add these sources

async function searchInaturalist(taxonName, placeId, limit) { ... }
async function searchWikimediaCommons(query, limit) { ... }
async function searchFlickr(query, license, limit) { ... }
async function searchLaviraWebsite(keyword, limit) { ... }  // already scraped

// Smart waterfall: try sources in priority order
const SOURCE_PRIORITY = [
  'lavira_website',    // Tier 0: their own photos — always try first
  'inaturalist',       // Tier 1: free, Kenya-specific, species-accurate
  'pexels',            // Tier 2: already integrated
  'unsplash',          // Tier 2: already integrated
  'wikimedia',         // Tier 3: free fallback
  'flickr_cc',         // Tier 3: quality fallback
];
```

---

## 5. VISION-DRIVEN DISPLAY TWEAKS — Specific Recipes

### A. Weather-Adaptive Overlays
```
golden_hour detected → 
  - overlay gradient: bottom-up warm amber (#C8860A → transparent)
  - noiseTex opacity: 0.03 (minimal, preserve the gold)
  - hook: "Golden hour on the Mara. This is why you came."
  - palette: AmberDusk

misty/overcast detected →
  - overlay gradient: full-bleed dark vignette
  - noiseTex opacity: 0.02
  - hook: "The Mara wakes in mystery. The animals don't wait."
  - palette: SavannahBlue

rain detected →
  - add animated rain SVG layer (CSS animation in HTML template)
  - hook: "After the rains, Africa erupts with life."
  - palette: NightSafari (dark, moody)
```

### B. Entity-Specific Card Layouts
```
entities=[hippo, water] →
  - template: hero_destination (wide, river-horizon composition)
  - badge: "🦛 River Giants of the Mara"
  - package_promo: "2 Days Masai Mara"
  - conservation_tag: "#SaveTheHippo #ConservationSafari"

entities=[elephant, mountain] →
  - template: safari_package_promo (Kilimanjaro + elephant = Amboseli)
  - headline: "AMBOSELI: Where Giants Meet the Mountain"
  - package: "3 Days Amboseli"

entities=[maasai_person] →
  - template: cultural_moment
  - tone: respectful, educational
  - hashtags: +#MaasaiCulture #CulturalSafari
```

### C. Vegetation-Season Copy Rules
```
vegetation_color=green + season=wet →
  caption: "Post-rains Kenya. The grasslands are electric green,
           the rivers full, and the animals everywhere."
  hashtags: +#GreenSeason #WetSeason #KenyaRains

vegetation_color=golden + season=dry →
  caption: "Dry season — the best time to spot the Big Five.
           Sparse grass means nowhere to hide."
  hashtags: +#DrySeason #BigFive #PeakSafari
```

---

## 6. FILES TO CREATE / MODIFY

### New Files
```
src/engines/intelligence-router.js   ← Phase 2 brain
src/engines/media-library-v2.js      ← iNaturalist + Wikimedia + Flickr + Lavira
src/engines/vision-cache.js          ← Persistent disk cache for vision results
assets/vision_cache/                 ← Directory for cached analysis JSONs
```

### Files to Modify
```
src/engines/image-vision.js          ← Extend prompt (Phase 1)
src/engines/compositor.js            ← Call analyseImage() internally
src/engines/card-templates.js        ← Use routeIntelligence() for palette
src/engines/promo.js                 ← Feed captionTone + season + entities into AI prompt
src/engines/external-media.js        ← Add iNaturalist + Wikimedia + Flickr sources
src/engines/context-pools.js         ← Add entity-specific hook sub-pools
src/orchestrator/intent.js           ← Use vision suggestedDest when no dest given
src/mcp/server.js                    ← Expose analyse_image_intelligence tool
.env.example                         ← Add FLICKR_API_KEY, INATURALIST_KEY (none needed)
```

---

## 7. API KEYS NEEDED

```bash
# .env additions
FLICKR_API_KEY=         # Free at flickr.com/services/apps/create — 500 req/hr
PIXABAY_API_KEY=        # Free at pixabay.com/api/docs — 100 req/hr
# iNaturalist = no key needed for read-only API
# Wikimedia = no key needed
# Lavira website = direct HTTP, no key
```

---

## 8. QUICK WIN — Implement This First (< 2 hours)

The single highest-ROI change is wiring `weather` + `timeOfDay` into palette selection inside `renderCard()`. It's 10 lines:

```javascript
// In src/engines/card-templates.js, inside renderCard():
// AFTER: imageAnalysis = await analyseImage(backgroundImage)
// ADD:
const WEATHER_PALETTE = {
  golden_hour: 1,  // AmberDusk index
  blue_hour:   2,  // SavannahBlue
  sunrise:     0,  // ForestGold
  misty:       2,  // SavannahBlue
  overcast:    3,  // NightSafari
  rain:        3,  // NightSafari
  sunny:       4,  // EarthRust
};
const forcePaletteIdx = WEATHER_PALETTE[imageAnalysis.weather];
const C = forcePaletteIdx !== undefined ? PALETTES[forcePaletteIdx] : getPalette();
```

This alone makes every golden-hour hippo photo automatically use AmberDusk palette (warm amber tones) instead of a random one. That's visible quality improvement with zero new infrastructure.

---

## 9. SESSION HANDOFF NOTES

**What this session built:**
- ✅ Real Lavira SVG logo downloaded + baked into ALL posts
- ✅ White glare fixed (accentLight palette values darkened, noiseTex halved)
- ✅ `full_video_post_pipeline` — 7-step atomic video tool (search→dl→probe→clip→encode→logo→posts)
- ✅ `posts/whatsapp/` directory + routing
- ✅ `update_user_memory` + `cleanup_old_outputs` missing handlers added
- ✅ WhatsApp hippo post generated: `posts/whatsapp/lavira_whatsapp_hippos_masaimara_final.jpg`
- ✅ Integration report doc: `Lavira_Integration_Report_2026.docx`

**What still needs building:**
- ❌ `intelligence-router.js` — the brain mapping vision → content (Phase 2 above)
- ❌ `media-library-v2.js` — iNaturalist + Wikimedia + Flickr + Lavira website source
- ❌ Weather/entity-driven palette selection in `renderCard()`
- ❌ Social platform API tokens (all 5 platforms still need manual upload)
- ❌ `outputs[]` bug in `list_recent_jobs` memory.js join
- ❌ `getSeasonalContext is not defined` error in ai-captions.js

**Engine state when this session ended:**
- Running on `localhost:4005`
- 77 MCP tools
- `node --check` passes on all three key files
- Memory doc updated, content calendar current

---

*End of handoff document. Good luck, next agent. 🦛*
