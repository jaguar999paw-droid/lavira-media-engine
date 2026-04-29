// src/engines/intelligence-router.js — Vision signal → content decision router
// Implements VISION_INTELLIGENCE_ROADMAP.md Layer 2
// Maps image-vision.js output to: palette, hook pool, caption tone, overlay mode
'use strict';

const BRAND = require('../orchestrator/brand');

// ── PALETTE DEFINITIONS ──────────────────────────────────────────────────────
const PALETTES = {
  ForestGold:    { bg:'#2D6A4F', accent:'#F4A261', text:'#F9F5F0', overlay:'rgba(27,40,48,0.62)' },
  AmberDusk:     { bg:'#C47A3A', accent:'#F4A261', text:'#FFFFFF',  overlay:'rgba(30,20,10,0.55)' },
  SavannahBlue:  { bg:'#1B4B6B', accent:'#90CAF9', text:'#F9F5F0', overlay:'rgba(10,20,35,0.60)' },
  NightSafari:   { bg:'#1B2830', accent:'#F4A261', text:'#FFFFFF',  overlay:'rgba(5,10,15,0.70)'  },
  EarthRust:     { bg:'#7B3F00', accent:'#FFD54F', text:'#FFFFFF',  overlay:'rgba(40,15,5,0.58)'  },
};

// ── ENTITY → DESTINATION HINTS ───────────────────────────────────────────────
const ENTITY_DEST_MAP = {
  elephant:        'Amboseli',
  kilimanjaro:     'Amboseli',
  rhino:           'Ol Pejeta',
  'white rhino':   'Ol Pejeta',
  chimpanzee:      'Ol Pejeta',
  lion:            'Masai Mara',
  cheetah:         'Masai Mara',
  wildebeest:      'Masai Mara',
  migration:       'Masai Mara',
  flamingo:        'Nakuru',
  grevy:           'Samburu',
  reticulated:     'Samburu',
  beach:           'Diani',
  ocean:           'Diani',
  coral:           'Lamu',
};

// ── WEATHER → PALETTE ────────────────────────────────────────────────────────
const WEATHER_PALETTE = {
  golden_hour:  'AmberDusk',
  blue_hour:    'SavannahBlue',
  sunny:        'ForestGold',
  overcast:     'SavannahBlue',
  misty:        'SavannahBlue',
  rain:         'NightSafari',
};

// ── WEATHER / TIME → COPY TONE ───────────────────────────────────────────────
const TONE_MAP = {
  golden_hour: 'poetic',
  blue_hour:   'poetic',
  misty:       'atmospheric',
  sunny:       'energetic',
  overcast:    'contemplative',
};

// ── MOOD → HOOK POOL KEY ─────────────────────────────────────────────────────
const MOOD_HOOK = {
  adventure:     'adventure',
  luxury:        'luxury',
  wildlife:      'wildlife',
  family:        'family',
  conservation:  'conservation',
};

/**
 * routeIntelligence(visionData)
 * Takes the output of image-vision.js analyseImage() and returns a rich
 * content decisions object consumed by resolvePostData() and card-templates.js
 *
 * @param {Object} visionData - result of analyseImage()
 * @returns {Object} decisions
 */
function routeIntelligence(visionData = {}) {
  const {
    entities      = [],
    weather       = 'sunny',
    timeOfDay     = 'morning',
    season        = 'dry',
    mood          = 'adventure',
    background    = 'savanna',
    primaryColor  = '#2D6A4F',
    safeTextZone  = 'bottom_left',
    confidence    = 0,
  } = visionData;

  // 1. Palette selection: weather > mood > default
  const paletteName = WEATHER_PALETTE[weather]
    || (mood === 'luxury' ? 'NightSafari' : 'ForestGold');
  const palette = { ...PALETTES[paletteName], name: paletteName };

  // 2. Hook pool key (which pool in context-pools.js to draw from)
  const hookPool = MOOD_HOOK[mood] || 'adventure';

  // 3. Copy tone
  const copyTone = TONE_MAP[weather] || 'energetic';

  // 4. Destination hint from detected entities
  let destinationHint = null;
  for (const entity of entities) {
    const e = (entity || '').toLowerCase();
    if (ENTITY_DEST_MAP[e]) { destinationHint = ENTITY_DEST_MAP[e]; break; }
  }

  // 5. Season-aware copy injection
  const seasonCopyMap = {
    migration:  'The Great Migration is underway — one of Earth\'s greatest spectacles.',
    dry:        'Dry season: animals gather at waterholes. Sightings are exceptional.',
    wet:        'After the rains: lush green, newborn wildlife, fewer crowds.',
    post_rain:  'Fresh rains bring new life. The bush is electric right now.',
  };
  const seasonLine = seasonCopyMap[season] || '';

  // 6. Time-of-day line
  const timeLineMap = {
    sunrise:   'At first light, the savanna belongs to you.',
    morning:   'Mornings here feel like the world just began.',
    afternoon: 'Golden hour stretches for miles.',
    sunset:    'The sun sets over Africa — and it never gets old.',
    night:     'After dark, the stars take over.',
  };
  const timeLine = timeLineMap[timeOfDay] || '';

  // 7. Overlay mode: dramatic sky or busy center → higher contrast
  const overlayMode = (weather === 'golden_hour' || background === 'sky') ? 'high_contrast' : 'standard';

  // 8. Animal entity for wildlife templates
  const wildlifeEntity = entities.find(e => ['lion','elephant','cheetah','leopard','buffalo','rhino',
    'giraffe','zebra','hippo','wildebeest','flamingo','chimpanzee'].includes((e||'').toLowerCase())) || null;

  return {
    palette,
    hookPool,
    copyTone,
    destinationHint,
    seasonLine,
    timeLine,
    overlayMode,
    wildlifeEntity,
    safeTextZone,
    confidence,
    // Pass-through for consumers that want raw vision data
    _vision: visionData,
  };
}

/**
 * guessSeason()
 * Returns current season based on Kenyan calendar
 */
function guessSeason() {
  const m = new Date().getMonth() + 1; // 1–12
  if ([7, 8, 9, 10].includes(m)) return 'migration'; // Jul–Oct: Great Migration
  if ([6, 11, 12, 1, 2].includes(m)) return 'dry';   // Jun, Nov–Feb: dry season
  return 'wet';                                         // Mar–May: long rains
}

module.exports = { routeIntelligence, guessSeason, PALETTES };
