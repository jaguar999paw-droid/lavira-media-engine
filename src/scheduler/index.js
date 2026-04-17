// scheduler/index.js — v3.1: uses full auto-promo engine (Pexels + Sharp + AI caption fallback)
'use strict';
const cron = require('node-cron');
const path = require('path');
const fs   = require('fs');
const { v4: uuid } = require('uuid');
const cfg  = require('../config');
const BRAND = require('../orchestrator/brand');
const { log } = require('../orchestrator/memory');
const promoEng = require('../engines/promo');
const { generateCaption } = require('../content/captions');

const SCHEDULE_FILE = path.join(cfg.OUTPUTS_DIR, 'schedule.json');

function loadSchedule() {
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')); }
  catch { return { entries: [] }; }
}
function saveSchedule(sched) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(sched, null, 2));
}

function safeRecentCaptions(n = 7) {
  try {
    return log.getRecent(n)
      .map(r => r.caption)
      .filter(c => c && c !== '[encrypted]' && c.length > 10);
  } catch { return []; }
}

function smartDestination() {
  try {
    const unused = log.getUnusedDestinations(BRAND.destinations);
    return unused.length ? unused[0] : BRAND.destinations[Math.floor(Math.random() * BRAND.destinations.length)];
  } catch { return BRAND.destinations[0]; }
}

function smartTheme() {
  try {
    const unused = log.getUnusedThemes ? log.getUnusedThemes(BRAND.content_themes) : [];
    return unused.length ? unused[0] : BRAND.content_themes[Math.floor(Math.random() * BRAND.content_themes.length)];
  } catch { return 'wildlife_spotlight'; }
}

async function generateDailyPromo() {
  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const sched   = loadSchedule();

  if (sched.entries.find(e => e.date === dateStr)) {
    console.log(`[Scheduler] Already generated promo for ${dateStr}, skipping.`);
    return null;
  }

  console.log(`[Scheduler] Generating daily auto-promo for ${dateStr}...`);

  const destination = smartDestination();
  const theme       = smartTheme();
  const entryId     = 'sched_' + uuid().slice(0, 8);

  try {
    // Full pipeline: Pexels stock image + brand treatment + AI/static caption
    const result = await promoEng.generateAutoPromo({
      destination,
      theme,
      context: `Daily ${theme} post for ${destination} — ${dateStr}`,
      profiles: ['instagram_post', 'instagram_story', 'facebook'],
      recentCaptions: safeRecentCaptions()
    });

    const entry = {
      id:          entryId,
      date:        dateStr,
      generatedAt: now.toISOString(),
      destination,
      theme,
      promo:       result.promo,
      results:     result.results,
      stockCredit: result.stockCredit,
      status:      'pending'  // pending | approved | posted
    };

    sched.entries.unshift(entry);
    sched.entries = sched.entries.slice(0, 30);
    saveSchedule(sched);

    // Log to memory
    try {
      log.insert({
        jobId:     entryId,
        mediaType: 'scheduled',
        destination,
        theme,
        platforms: ['instagram_post', 'instagram_story', 'facebook'],
        caption:   result.promo?.caption || ''
      });
    } catch {}

    const hook = result.promo?.hook || result.promo?.caption?.slice(0, 60) || '';
    console.log(`[Scheduler] ✅ Daily promo ready — ${destination} (${theme}): "${hook}..."`);
    if (result.results?.length) {
      console.log(`[Scheduler]    Images: ${result.results.map(r => r.filename).join(', ')}`);
    }
    return entry;

  } catch (e) {
    // Hard fallback: static caption only, no image
    console.error('[Scheduler] ❌ Auto-promo failed:', e.message, '— using static caption');
    const captionData = generateCaption(destination);
    const entry = {
      id: entryId, date: dateStr, generatedAt: now.toISOString(),
      destination, theme, promo: captionData, results: [], status: 'pending', fallback: true
    };
    sched.entries.unshift(entry);
    sched.entries = sched.entries.slice(0, 30);
    saveSchedule(sched);
    try { log.insert({ jobId: entryId, mediaType: 'scheduled', destination, theme, platforms: ['instagram_post'], caption: captionData.caption }); } catch {}
    return entry;
  }
}

function start() {
  // 06:00 EAT = 03:00 UTC
  cron.schedule('0 3 * * *', () => generateDailyPromo(), { timezone: 'UTC' });
  // Boot: run 10s after server start — non-blocking
  setTimeout(() => generateDailyPromo().catch(() => {}), 10000);
  console.log('  [Scheduler] Daily auto-promo cron active — 06:00 EAT (uses Pexels + AI captions)');
}

function getSchedule() { return loadSchedule(); }

function approveScheduledEntry(id) {
  const sched = loadSchedule();
  const entry = sched.entries.find(e => e.id === id);
  if (!entry) throw new Error('Schedule entry not found: ' + id);
  entry.status = 'approved';
  entry.approvedAt = new Date().toISOString();
  saveSchedule(sched);
  return entry;
}

module.exports = { start, getSchedule, generateDailyPromo, approveScheduledEntry };
