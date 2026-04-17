// captions.js — Rich static fallback templates using full brand data
// Used when Claude API key has no credits or is unset.
'use strict';
const BRAND = require('../orchestrator/brand');

function getHashtagArray(count = 8) {
  const h = BRAND.hashtags;
  const all = Array.isArray(h) ? h
    : typeof h.all === 'function' ? h.all()
    : Object.values(h).filter(Array.isArray).flat();
  return all.filter((v, i, a) => a.indexOf(v) === i).slice(0, count);
}

// Static story hooks per destination — used when AI is unavailable
const HOOKS = {
  'Masai Mara':    'Where lions rule the golden savanna',
  'Amboseli':      'Giants beneath the mountain of ice',
  'Tsavo East':    'Red elephants in the world\'s wildest park',
  'Samburu':       'Northern secrets the maps don\'t show',
  'Lake Nakuru':   'A million pink wings at sunrise',
  'Ol Pejeta':     'The last giants need your witness',
  'Tanzania':      'Serengeti endless — the earth breathes here',
  'Lake Naivasha': 'Hippos yawn where flamingos wade',
  'Diani Beach':   'The Indian Ocean kept its best secret',
  'default':       'Africa\'s wildest chapter starts here',
};

// Coastal/beach destinations — do NOT use safari/wildlife copy for these
const COASTAL_DESTS = new Set(['Diani Beach', 'Watamu', 'Lamu', 'Malindi']);

function isCoastal(dest) { return COASTAL_DESTS.has(dest); }

function getHook(dest) {
  return HOOKS[dest] || HOOKS.default;
}

function getDestHighlight(dest) {
  const p = BRAND.destination_profiles?.[dest];
  if (p?.highlight) return p.highlight;
  if (p?.headline) return p.headline;
  // Beach destinations get a coastal-appropriate fallback
  if (isCoastal(dest)) return `${dest} — white sand, warm Indian Ocean, pure escape`;
  return `${dest} — wild Africa at your doorstep`;
}

// Destination-specific hashtag selection (bug fix: was always returning all 8 generic tags)
function getDestHashtags(dest) {
  const h = BRAND.hashtags;
  const core = (h.core || []).slice(0, 4);
  const destTags = (h.destinations || []).filter(t => {
    const tl = t.toLowerCase();
    return dest.toLowerCase().split(/\s+/).some(w => w.length > 3 && tl.includes(w));
  });
  const wildlife = isCoastal(dest)
    ? ['#BeachKenya','#IndianOcean','#KenyaCoast']
    : (h.wildlife || []).slice(0, 3);
  const exp = (h.experience || []).slice(0, 2);
  const combined = [...new Set([...core, ...destTags, ...wildlife, ...exp])];
  return combined.slice(0, 10);
}

function getRelatedPackage(dest) {
  return BRAND.safari_packages?.find(p => p.destinations?.includes(dest));
}

// ─── Template generator ───────────────────────────────────────────────────────
function generateCaption(destination) {
  const dest     = destination || BRAND.destinations[Math.floor(Math.random() * BRAND.destinations.length)];
  const hashtags = getDestHashtags(dest);
  const hook     = getHook(dest);
  const pkg      = getRelatedPackage(dest);
  const highlight = getDestHighlight(dest);
  const usp      = BRAND.usps?.[Math.floor(Math.random() * (BRAND.usps?.length || 1))] || 'Expert guides, custom safari vehicles, every detail handled.';

  const templates = [
    // Template 1: Hook → Destination story → Package → CTA
    () => `${hook} 🌅\n\n${highlight}. With Lavira Safaris, this is your story to tell.\n\n${usp}\n\n${pkg ? `📌 Try our "${pkg.name}" — ${pkg.duration} of pure Africa.\n\n` : ''}📞 ${BRAND.phone}\n🌐 ${BRAND.website}\n\n${hashtags.join(' ')}`,

    // Template 2: Destination-led, testimonial flavour (coastal-safe)
    () => isCoastal(dest)
      ? `${hook} 🌊\n\nThe ${dest} coastline is something you feel before you see. Crystal water, white sand, dhow sunsets — and Lavira Safaris to handle every detail.\n\nOur guests call it "the most relaxed I've ever been."\n\n${pkg ? `Start here: "${pkg.name}" (${pkg.duration}). We've got you.\n\n` : ''}📞 ${BRAND.phone} | 🌐 ${BRAND.website}\n📧 ${BRAND.email}\n\n${hashtags.join(' ')}`
      : `${dest} doesn't just show you Africa — it changes you. 🦁\n\nOur guests call it "the trip of a lifetime." We call it Thursday.\n\nLavira Safaris: ${usp.toLowerCase()}\n\n${pkg ? `Perfect start: "${pkg.name}" (${pkg.duration}). Ask us.\n\n` : ''}📞 ${BRAND.phone} | 🌐 ${BRAND.website}\n📧 ${BRAND.email}\n\n${hashtags.join(' ')}`,

    // Template 3: Seasonal/atmospheric, package CTA
    () => `🌍 ${dest}. ${highlight}.\n\nThis is not a holiday. This is a memory that stays with you for life.\n\nLavira Safaris crafts private, personalized safaris across Kenya & Tanzania — custom vehicles, expert guides, zero stress.\n\n${pkg ? `Our "${pkg.name}" is the perfect gateway (${pkg.duration}).\n\n` : ''}📲 WhatsApp: ${BRAND.phone}\n🌐 ${BRAND.website}\n\n${hashtags.join(' ')}`,
  ];

  const tpl     = templates[Math.floor(Math.random() * templates.length)];
  const caption = tpl();

  return {
    caption,
    destination: dest,
    hashtags,
    hook,
    storyCaption:   `${hook}\n\nSwipe up ➜ ${BRAND.website}`,
    ctaBlock:       `📞 ${BRAND.phone}\n🌐 ${BRAND.website}\n📧 ${BRAND.email}`,
    relatedPackage: pkg ? { name: pkg.name, duration: pkg.duration, highlights: pkg.highlights } : null,
    aiGenerated:    false,
    generatedAt:    new Date().toISOString(),
  };
}

module.exports = { generateCaption, getHook, isCoastal, getDestHashtags };
