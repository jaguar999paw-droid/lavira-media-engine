// src/engines/media-library.js — Lavira Media Library Engine v1.0
// Recursively indexes images/videos from the media directories
// Tags by context (nature, wildlife, flamingos, culture, etc.)
// Provides random selection by tag for zero-input auto-promo
'use strict';
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuid } = require('uuid');
const cfg  = require('../config');
const { log, state } = require('../orchestrator/memory');

const ROOT = path.join(__dirname, '../..');
const IMAGES_DIR = path.join(ROOT, 'images');
const VIDEOS_DIR = path.join(ROOT, 'videos');
const LIBRARY_FILE = path.join(ROOT, 'assets', 'media-library.json');

// ── Auto-tagging rules (filename + dimensions → tags) ──────────────────────
const TAG_RULES = [
  { patterns: ['flamingo','walvis','pink'], tags: ['flamingo','birds','lake','pink','nature'] },
  { patterns: ['masai','maasai','mara','kenya'], tags: ['masai mara','kenya','culture','wildlife','nature'] },
  { patterns: ['elephant','amboseli','kilimanjaro'], tags: ['elephant','amboseli','nature','wildlife','big five'] },
  { patterns: ['lion','pride','big cats','leopard','cheetah'], tags: ['big cats','big five','wildlife','predator'] },
  { patterns: ['zebra','wildebeest','migration'], tags: ['wildlife','migration','plains','nature'] },
  { patterns: ['culture','immerse','vibrant','tribal'], tags: ['culture','maasai','people','community'] },
  { patterns: ['sunset','golden','sunrise','sky'], tags: ['sunset','golden hour','landscape','nature'] },
  { patterns: ['ocean','beach','coast','diani','watamu'], tags: ['ocean','beach','coast','kenya'] },
  { patterns: ['savanna','plains','bush','acacia'], tags: ['savanna','landscape','nature','africa'] },
  { patterns: ['pinterest'], tags: ['inspiration','mood','safari'] },
  { patterns: ['national geographic','nat geo'], tags: ['wildlife','nature','professional'] },
];

const DESTINATION_TAGS = {
  'masai mara': 'Masai Mara', 'mara': 'Masai Mara',
  'amboseli': 'Amboseli', 'kilimanjaro': 'Amboseli',
  'samburu': 'Samburu', 'tsavo': 'Tsavo East',
  'nakuru': 'Lake Nakuru', 'flamingo': 'Lake Nakuru',
  'naivasha': 'Lake Naivasha',
  'diani': 'Diani Beach', 'ocean': 'Diani Beach',
  'tanzania': 'Tanzania', 'serengeti': 'Tanzania',
};

function autoTag(filename, width, height) {
  const lower = filename.toLowerCase();
  const tags = new Set(['safari', 'africa', 'kenya']);

  // Dimension-based tags
  if (height > width * 1.2) tags.add('portrait'); else
  if (width > height * 1.2) tags.add('landscape'); else
  tags.add('square');

  // High-res tag
  if (width >= 1080 || height >= 1080) tags.add('high-res');

  // Filename pattern matching
  for (const rule of TAG_RULES) {
    if (rule.patterns.some(p => lower.includes(p))) {
      rule.tags.forEach(t => tags.add(t));
    }
  }

  // Infer destination
  let destination = null;
  for (const [key, dest] of Object.entries(DESTINATION_TAGS)) {
    if (lower.includes(key)) { destination = dest; break; }
  }

  return { tags: [...tags], destination };
}

function safeFilename(original) {
  // Sanitize filename: keep alphanumeric, dashes, underscores, dots
  const ext = path.extname(original) || '.jpg';
  const base = path.basename(original, ext)
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
  return base + ext;
}

const MEDIA_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
                             '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);

async function scanDirectory(dir) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;

  const walk = (d, depth = 0) => {
    if (depth > 3) return;
    let items;
    try { items = fs.readdirSync(d); } catch { return; }
    for (const item of items) {
      const full = path.join(d, item);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      const ext = path.extname(item).toLowerCase();
      if (!MEDIA_EXTS.has(ext)) continue;
      entries.push({ path: full, filename: item, size: stat.size, ext, mtime: stat.mtime });
    }
  };
  walk(dir);
  return entries;
}

async function buildLibrary(force = false) {
  // Load existing library
  let library = { version: 1, built: null, items: [] };
  if (!force && fs.existsSync(LIBRARY_FILE)) {
    try { library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')); }
    catch {}
  }

  const existingPaths = new Set(library.items.map(i => i.sourcePath));

  // Scan both directories
  const [images, videos] = await Promise.all([
    scanDirectory(IMAGES_DIR),
    scanDirectory(VIDEOS_DIR),
  ]);

  let added = 0;
  for (const entry of [...images, ...videos]) {
    if (existingPaths.has(entry.path)) continue; // already indexed

    const isImage = ['.jpg','.jpeg','.png','.webp','.avif','.gif'].includes(entry.ext);
    const isVideo = ['.mp4','.mov','.avi','.mkv','.webm','.m4v'].includes(entry.ext);

    let width = 0, height = 0, mediaType = 'image';
    try {
      if (isImage) {
        const meta = await sharp(entry.path).metadata();
        width = meta.width || 0; height = meta.height || 0;
      }
      if (isVideo) { mediaType = 'video'; }
    } catch {}

    const { tags, destination } = autoTag(entry.filename, width, height);

    // Sanitized copy name for DB referencing
    const cleanName = safeFilename(entry.filename);

    const item = {
      id:          uuid().slice(0, 12),
      sourcePath:  entry.path,
      filename:    entry.filename,
      cleanName,
      mediaType,
      width, height,
      size:        entry.size,
      tags,
      destination: destination || null,
      indexed:     new Date().toISOString(),
      usedCount:   0,
      lastUsed:    null,
    };

    library.items.push(item);
    added++;
  }

  library.built = new Date().toISOString();
  library.totalImages = library.items.filter(i => i.mediaType === 'image').length;
  library.totalVideos = library.items.filter(i => i.mediaType === 'video').length;

  fs.mkdirSync(path.dirname(LIBRARY_FILE), { recursive: true });
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2));

  console.log(`[MediaLibrary] Indexed: ${library.items.length} items (+${added} new). Images: ${library.totalImages}, Videos: ${library.totalVideos}`);
  return library;
}

function loadLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')); }
  catch { return null; }
}

// ── Pick best image by tags/destination ─────────────────────────────────────
function selectByContext({ tags = [], destination = null, mediaType = 'image', exclude = [] } = {}) {
  const library = loadLibrary();
  if (!library || !library.items.length) return null;

  let pool = library.items.filter(i => i.mediaType === mediaType && !exclude.includes(i.id));

  // Score items: destination match (3pts), tag match (1pt each)
  const scored = pool.map(item => {
    let score = 0;
    if (destination && item.destination === destination) score += 3;
    for (const tag of tags) {
      if (item.tags.includes(tag)) score++;
    }
    // Prefer less-used
    score -= (item.usedCount * 0.5);
    return { item, score };
  }).filter(s => s.score >= 0);

  if (!scored.length) {
    // Fall back: any image
    const fallback = pool[Math.floor(Math.random() * pool.length)];
    return fallback || null;
  }

  // Sort by score desc, pick top 3 randomly for variety
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(3, scored.length));
  const chosen = top[Math.floor(Math.random() * top.length)].item;

  // Update usage stats
  chosen.usedCount++;
  chosen.lastUsed = new Date().toISOString();
  try {
    const lib = loadLibrary();
    const idx = lib.items.findIndex(i => i.id === chosen.id);
    if (idx >= 0) { lib.items[idx] = chosen; fs.writeFileSync(LIBRARY_FILE, JSON.stringify(lib, null, 2)); }
  } catch {}

  return chosen;
}

function getStats() {
  const lib = loadLibrary();
  if (!lib) return { indexed: false };
  const byDest = {};
  const byTag  = {};
  lib.items.forEach(item => {
    if (item.destination) byDest[item.destination] = (byDest[item.destination] || 0) + 1;
    item.tags.forEach(t => { byTag[t] = (byTag[t] || 0) + 1; });
  });
  return {
    indexed: true,
    built: lib.built,
    total: lib.items.length,
    totalImages: lib.totalImages,
    totalVideos: lib.totalVideos,
    byDestination: byDest,
    topTags: Object.entries(byTag).sort((a,b)=>b[1]-a[1]).slice(0,15),
  };
}

// ── Sample Media Library (for MCP & testing) ────────────────────────────────
const SAMPLES_DIR = path.join(ROOT, 'samples');
const DEST_MAP = {
  'masai_mara': 'Masai Mara', 'masai-mara': 'Masai Mara',
  'amboseli': 'Amboseli',
  'mt_kenya': 'Mt Kenya', 'mt-kenya': 'Mt Kenya',
  'nakuru': 'Lake Nakuru',
  'ol_pejeta': 'Ol Pejeta', 'ol-pejeta': 'Ol Pejeta',
  'samburu': 'Samburu',
  'tsavo': 'Tsavo',
};

function listSampleMedia({ type = 'all', destination = null } = {}) {
  const result = { destinations: {}, total: 0 };
  const dirs = ['images', 'videos', 'audio'];
  const targets = type === 'all' ? dirs : [type];

  for (const dir of targets) {
    const destDir = path.join(SAMPLES_DIR, dir, 'destinations');
    if (!fs.existsSync(destDir)) continue;
    
    const dests = fs.readdirSync(destDir);
    for (const dest of dests) {
      if (destination && dest !== destination.replace(/ /g, '-').toLowerCase()) continue;
      const destPath = path.join(destDir, dest);
      if (!fs.statSync(destPath).isDirectory()) continue;
      
      const files = fs.readdirSync(destPath)
        .filter(f => MEDIA_EXTS.has(path.extname(f).toLowerCase()));
      
      if (files.length > 0) {
        const key = DEST_MAP[dest] || dest;
        if (!result.destinations[key]) result.destinations[key] = { images: 0, videos: 0, audio: 0 };
        result.destinations[key][dir] = files.length;
        result.total += files.length;
      }
    }
  }
  return result;
}

function getSamplesByDestination(type = 'image', destination = 'masai-mara') {
  const destPath = path.join(SAMPLES_DIR, type + 's', 'destinations', destination.replace(/ /g, '-').toLowerCase());
  if (!fs.existsSync(destPath)) return [];
  
  return fs.readdirSync(destPath)
    .filter(f => MEDIA_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => ({
      filename: f,
      url: `/samples/${type}s/destinations/${destination.replace(/ /g, '-').toLowerCase()}/${f}`,
      type,
      destination: DEST_MAP[destination.replace(/ /g, '-').toLowerCase()] || destination,
      localPath: path.join(destPath, f)
    }));
}

function getRandomSample(destination, type = 'image') {
  const samples = getSamplesByDestination(type, destination);
  return samples.length > 0 ? samples[Math.floor(Math.random() * samples.length)] : null;
}

module.exports = { buildLibrary, loadLibrary, selectByContext, getStats, listSampleMedia, getSamplesByDestination, getRandomSample };
