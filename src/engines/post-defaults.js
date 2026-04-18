// src/engines/post-defaults.js — canonical post data resolver
'use strict';
const BRAND = require('../orchestrator/brand');
const POOLS = require('./context-pools');

// Anti-repeat LRU for hooks and CTAs
const _usedHooks = [];
const _usedCtas  = [];
const LRU_MAX = 5;

function _lruPick(pool, used) {
  const candidates = pool.filter(x => !used.includes(x));
  const pick = (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length || pool.length))];
  used.push(pick);
  if (used.length > LRU_MAX) used.shift();
  return pick;
}

function guessSeason() {
  const m = new Date().getMonth() + 1;
  if ([7, 8, 9, 10].includes(m)) return 'migration';
  if ([6, 11, 12, 1, 2].includes(m)) return 'dry';
  return 'wet';
}

function findPackage(destination) {
  const pkgs = BRAND.safari_packages || [];
  return pkgs.find(p => p.destinations && p.destinations.includes(destination)) || {};
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Infer destination from a keyword (e.g. "rhino" → "Ol Pejeta")
function inferDestination(keyword) {
  if (!keyword) return null;
  const kw = keyword.toLowerCase();
  const profiles = BRAND.destination_profiles || {};
  for (const [dest, prof] of Object.entries(profiles)) {
    const wildlife = (prof.wildlife || []).map(w => w.toLowerCase());
    if (wildlife.some(w => kw.includes(w) || w.includes(kw))) return dest;
    if (dest.toLowerCase().includes(kw) || kw.includes(dest.toLowerCase())) return dest;
  }
  return null;
}

async function resolvePostData(destination, template, userContext = {}, imageAnalysis = {}) {
  // Infer destination from keyword if not specified
  const dest = destination
    || (userContext.keyword && inferDestination(userContext.keyword))
    || pickRandom(BRAND.destinations || ['Masai Mara']);

  const prof   = (BRAND.destination_profiles || {})[dest] || {};
  const pkg    = findPackage(dest);
  const season = imageAnalysis.season || guessSeason();
  const time   = imageAnalysis.timeOfDay || 'morning';
  const mood   = imageAnalysis.mood || 'adventure';

  // Pick mood-appropriate hook with anti-repeat
  const hookPool = POOLS.hooks[mood] || POOLS.hooks.adventure;
  const hook     = _lruPick(hookPool, _usedHooks);
  const cta      = _lruPick(POOLS.ctas, _usedCtas);

  const base = {
    destination:  dest,
    hook:         hook,
    highlight:    prof.highlight || `Discover ${dest} with Lavira Safaris`,
    packageName:  pkg.name       || `${dest} Safari`,
    duration:     pkg.duration   || '3 days',
    highlights:   pkg.highlights || (prof.wildlife || []).slice(0, 4) || (BRAND.usps || []).slice(0, 4) || [],
    destinations: pkg.destinations || [dest],
    cta:          cta,
    season,
    timeContext:  POOLS.timeLines[time] || '',
    seasonLine:   POOLS.seasonalContext[season] || '',
    animal:       (prof.wildlife || [])[0] || 'Elephant',
    wildlife:     prof.wildlife || [],
    activities:   prof.activities || [],
  };

  // Template-specific field enrichment
  const overrides = _templateOverrides(template, dest, prof, pkg, imageAnalysis);

  // userContext always wins (spread last), except we never let hook be empty
  const merged = { ...base, ...overrides, ...userContext };
  if (!merged.hook) merged.hook = hook;

  return merged;
}

function _templateOverrides(template, dest, prof, pkg, imageAnalysis) {
  const pkgs = BRAND.safari_packages || [];
  const testimonials = BRAND.testimonials || [];
  const t = testimonials[Math.floor(Math.random() * (testimonials.length || 1))] || {};
  const dests = BRAND.destinations || [];

  switch (template) {
    case 'testimonial':
      return {
        quote:     t.quote || 'An absolutely unforgettable experience with Lavira Safaris.',
        guest:     t.guest || 'Verified Safari Guest',
        highlight: t.highlight || '',
      };
    case 'twin_destination': case 'dual_destination': {
      const dest2 = dests.find(d => d !== dest) || 'Amboseli';
      const prof2 = (BRAND.destination_profiles || {})[dest2] || {};
      return {
        destination1: dest, destination2: dest2,
        hook1: (prof.highlight || '').slice(0, 30),
        hook2: (prof2.highlight || '').slice(0, 30),
        highlights1: (prof.wildlife || []).slice(0, 3),
        highlights2: (prof2.wildlife || []).slice(0, 3),
        packageName: `${dest} & ${dest2} Safari`,
      };
    }
    case 'stats': case 'conservation':
      return {
        stats: [
          { value: '13+', label: 'Destinations' },
          { value: '14',  label: 'Safari Packages' },
          { value: '★4.9', label: 'Guest Rating' },
        ],
      };
    case 'itinerary': {
      const dayActivities = (prof.activities || ['Game drive', 'Sundowner', 'Bush walk']).slice(0, 5);
      return {
        days: dayActivities.map((act, i) => ({ day: i + 1, activity: act })),
      };
    }
    case 'offer': case 'pricing': case 'promo_flash':
      return {
        offerTitle: `${dest} Safari Special`,
        inclusions: pkg.highlights || (prof.wildlife || []).slice(0, 4),
        urgency: 'Limited Spots — Book Now via WhatsApp',
      };
    default:
      return {};
  }
}

module.exports = { resolvePostData, guessSeason, inferDestination };
