// src/engines/context-pools.js — Lavira curated copy vocabulary
'use strict';
const BRAND = require('../orchestrator/brand');

const PH = BRAND.phone   || '+254 721 757 387';
const WB = (BRAND.website || 'https://lavirasafaris.com').replace('https://','');
const IG = (BRAND.socials && BRAND.socials.instagram) || '@lavirasafaris';

module.exports = {
  hooks: {
    adventure: [
      "Africa's wildest chapter starts here.",
      "Some journeys change you. This is one of them.",
      "Not a holiday. A story you'll tell forever.",
      "Where the wild things are — and you finally are too.",
      "The Mara doesn't wait. Neither should you.",
      "Pack light. Bring everything that matters.",
      "This is what it feels like to be alive.",
    ],
    luxury: [
      "Effortless wilderness. Entirely yours.",
      "Safari redefined — private, personal, unforgettable.",
      "Every detail handled. Every moment yours to savour.",
      "Five-star. Untamed. Just the way Africa should be.",
      "The bush never felt this good.",
    ],
    wildlife: [
      "They roamed here long before we arrived.",
      "A world where the animals still make the rules.",
      "The Big Five. Up close. On your schedule.",
      "Some things you only believe when you see them.",
      "Eye contact with a lion. You'll never forget it.",
    ],
    family: [
      "The trip your kids will describe to their grandchildren.",
      "Family time, wilder than you imagined.",
      "Adventures the whole family earns together.",
      "First safari. Last time you'll need another holiday.",
    ],
    conservation: [
      "See it now. Help protect it for always.",
      "Your safari funds the rangers who guard this world.",
      "Travel that gives back more than it takes.",
    ],
  },

  ctas: [
    `Book via WhatsApp · ${PH}`,
    'DM us · Limited spots this season',
    `Reserve your dates · ${WB}`,
    'WhatsApp us today · zero-stress booking',
    'Enquire now — we reply within the hour',
    'Tap the link · Your Africa awaits',
    `Message us · ${IG} · Bespoke safaris, honest prices`,
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
    post_rain: "Fresh rains bring new life. The bush is electric right now.",
  },

  angleVariants: [
    { angle: 'sensory',      prefix: 'Imagine waking to' },
    { angle: 'invitation',   prefix: 'Come see why' },
    { angle: 'narrative',    prefix: 'This is the story of' },
    { angle: 'contrast',     prefix: 'No traffic. No deadlines. Just' },
    { angle: 'social_proof', prefix: "Thousands of guests have called it the best trip of their lives." },
  ],
};
