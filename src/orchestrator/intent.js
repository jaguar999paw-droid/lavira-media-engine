// orchestrator/intent.js — Lavira Intent Parser & Delegation Engine v1
// Converts ANY natural language prompt into a fully-wired tool call plan.
// This is the "brain" that makes "Hey Claude, generate a WhatsApp post for today" work.
'use strict';
const BRAND = require('./brand');

// ── PLATFORM ROUTING TABLE ───────────────────────────────────────────────────
const PLATFORM_MAP = {
  whatsapp:   { profiles: ['whatsapp'],             aspect: '1:1',  ext: 'jpg', maxMB: 16 },
  instagram:  { profiles: ['instagram_post','instagram_story','instagram_portrait'], aspect: '1:1', ext: 'jpg' },
  tiktok:     { profiles: ['tiktok'],                     aspect: '9:16', ext: 'mp4' },
  facebook:   { profiles: ['facebook','facebook_story'],  aspect: '16:9', ext: 'jpg' },
  twitter:    { profiles: ['twitter_card'],               aspect: '16:9', ext: 'jpg' },
  telegram:   { profiles: ['instagram_post'],             aspect: '1:1',  ext: 'jpg' },
  youtube:    { profiles: ['youtube_thumb'],              aspect: '16:9', ext: 'jpg' },
  story:      { profiles: ['instagram_story','tiktok'],   aspect: '9:16', ext: 'jpg' },
  reel:       { profiles: ['tiktok','instagram_story'],   aspect: '9:16', ext: 'mp4' },
  default:    { profiles: ['instagram_post','instagram_story','facebook'], aspect: '1:1', ext: 'jpg' },
};

// ── THEME KEYWORDS ───────────────────────────────────────────────────────────
const THEME_KEYWORDS = {
  wildlife_spotlight: ['animal','lion','elephant','cheetah','leopard','buffalo','rhino','giraffe','zebra','wildlife','beast','predator','big five','bird'],
  destination_profile: ['destination','place','visit','explore','discover','landscape','view','park','reserve','conservancy'],
  safari_package_promo: ['package','deal','offer','book','safari','price','quote','budget','promo','special'],
  guest_testimonial: ['review','testimonial','guest','client','feedback','experience','story','5 star','rating'],
  conservation: ['conservation','environment','protect','ecosystem','community','green','sustainable','nature'],
  cultural_moment: ['culture','tribe','maasai','samburu','traditional','local','community','heritage'],
  adventure_activity: ['activity','balloon','ride','walk','drive','game drive','sundowner','camp','night'],
  sunrise_sunset: ['sunrise','sunset','golden','dusk','dawn','hour','evening','morning','sky'],
};

// ── DESTINATION KEYWORDS ─────────────────────────────────────────────────────
const DEST_KEYWORDS = {
  'Masai Mara':   ['mara','masai','wildebeest','migration','lion','cheetah'],
  'Amboseli':     ['amboseli','kilimanjaro','elephant','dust'],
  'Samburu':      ['samburu','reticulated','grevy','tribe'],
  'Tsavo':        ['tsavo','red elephant','man eater','savannah'],
  'Ol Pejeta':    ['ol pejeta','pejeta','chimpanzee','white rhino','rhino conservancy'],
  'Nakuru':       ['nakuru','flamingo','lake nakuru','baboon'],
  'Mt Kenya':     ['mt kenya','mount kenya','forest','cedar','tusker'],
  'Naivasha':     ['naivasha','hippo','lake','flamingo','flower'],
  'Aberdares':    ['aberdare','treetops','waterfall','mist','highland'],
  'Diani':        ['diani','beach','coast','ocean','dolphin','whale'],
  'Lamu':         ['lamu','island','arabic','dhow','coral','reef'],
  'Meru':         ['meru','white rhino','tana','cheetah','buffalo'],
};

// ── MEDIA TYPE DETECTION ─────────────────────────────────────────────────────
const VIDEO_KEYWORDS = ['video','reel','clip','mp4','movie','film','motion','animate','moving'];
const IMAGE_KEYWORDS = ['image','photo','picture','jpg','jpeg','png','card','poster','graphic','visual','flyer'];

// ── INTENT PARSER ────────────────────────────────────────────────────────────
function parseIntent(prompt) {
  const p = (prompt || '').toLowerCase();

  // 1. Platform detection
  let platform = 'default';
  for (const [key] of Object.entries(PLATFORM_MAP)) {
    if (p.includes(key)) { platform = key; break; }
  }

  // 2. Destination detection
  let destination = null;
  for (const [dest, keywords] of Object.entries(DEST_KEYWORDS)) {
    if (keywords.some(k => p.includes(k))) { destination = dest; break; }
  }
  // Fallback: pick least-recently-used
  if (!destination) destination = null; // promo engine will auto-pick LRU

  // 3. Theme detection
  let theme = 'wildlife_spotlight';
  let bestScore = 0;
  for (const [t, keywords] of Object.entries(THEME_KEYWORDS)) {
    const score = keywords.filter(k => p.includes(k)).length;
    if (score > bestScore) { bestScore = score; theme = t; }
  }

  // 4. Media type
  const wantsVideo = VIDEO_KEYWORDS.some(k => p.includes(k));
  const wantsImage = IMAGE_KEYWORDS.some(k => p.includes(k)) || !wantsVideo;
  const mediaType = wantsVideo ? 'video' : 'image';

  // 5. Intent quality signals
  const isUrgent = p.includes('today') || p.includes('now') || p.includes('quick') || p.includes('fast');
  const wantsPackage = p.includes('package') || p.includes('book') || p.includes('deal');
  const wantsTestimonial = p.includes('review') || p.includes('testimonial') || p.includes('guest');

  // Override theme based on strong signals
  if (wantsPackage) theme = 'safari_package_promo';
  if (wantsTestimonial) theme = 'guest_testimonial';

  return {
    platform,
    platformConfig: PLATFORM_MAP[platform] || PLATFORM_MAP.default,
    destination,
    theme,
    mediaType,
    isUrgent,
    profiles: PLATFORM_MAP[platform]?.profiles || PLATFORM_MAP.default.profiles,
    raw: prompt,
  };
}

// ── TOOL PLAN BUILDER ────────────────────────────────────────────────────────
// Given parsed intent, returns an ordered list of tool calls to execute
function buildToolPlan(intent) {
  const steps = [];

  // Step 1: Always generate content + media
  steps.push({
    tool: 'create_post_workflow',
    args: {
      destination: intent.destination || undefined,
      theme: intent.theme,
      mediaType: intent.mediaType,
      context: `${intent.platform} post — ${intent.theme}`,
      profiles: intent.profiles,
    },
    description: `Generate ${intent.mediaType} content for ${intent.platform}`,
  });

  // Step 2: Build overlays on the results
  steps.push({
    tool: 'build_post_package',
    args: { jobId: '__PREV_JOB_ID__' }, // resolved at runtime
    description: 'Apply brand overlays to all outputs',
  });

  // Step 3: Deliver to correct destination
  steps.push({
    tool: '_deliver',
    args: { platform: intent.platform, jobId: '__PREV_JOB_ID__' },
    description: `Route final files to ${intent.platform} output directory`,
  });

  return { intent, steps, estimatedOutputs: intent.profiles };
}

module.exports = { parseIntent, buildToolPlan, PLATFORM_MAP, DEST_KEYWORDS, THEME_KEYWORDS };
