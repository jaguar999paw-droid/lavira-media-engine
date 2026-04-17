// src/engines/media-cache.js — Intelligent Cache Management for External Media
// Tracks downloaded Pexels/Unsplash media with LRU eviction and 30-day TTL
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const CACHE_DIR = path.join(cfg.ASSETS_DIR, 'external_cache');
const CACHE_INDEX_FILE = path.join(CACHE_DIR, 'index.json');
const CACHE_TTL_DAYS = 30;

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ── Load or initialize cache index ─────────────────────────────────────────────
function loadIndex() {
  if (fs.existsSync(CACHE_INDEX_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_INDEX_FILE, 'utf8'));
    } catch { return {}; }
  }
  return {};
}

function saveIndex(index) {
  fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

// ── Generate cache key from query + destination ────────────────────────────────
function generateCacheKey(query, destination = '', theme = '') {
  const components = [query, destination, theme].filter(Boolean);
  return require('crypto')
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .slice(0, 16);
}

// ── Check if cache entry is fresh ──────────────────────────────────────────────
function isCacheFresh(entry) {
  if (!entry || !entry.cachedAt) return false;
  const ageMs = Date.now() - entry.cachedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < CACHE_TTL_DAYS;
}

// ── Get from cache ───────────────────────────────────────────────────────────────
function get(query, destination = '', theme = '') {
  const index = loadIndex();
  const key = generateCacheKey(query, destination, theme);

  if (index[key] && isCacheFresh(index[key])) {
    const filePath = path.join(CACHE_DIR, index[key].filename);
    if (fs.existsSync(filePath)) {
      // Update LRU timestamp
      index[key].lastAccessed = Date.now();
      saveIndex(index);
      return {
        filepath: filePath,
        filename: index[key].filename,
        source: index[key].source,
        url: index[key].url,
        metadata: index[key].metadata
      };
    }
  }
  return null;
}

// ── Add to cache ───────────────────────────────────────────────────────────────
function set(query, destination, theme, filePath, sourceUrl, metadata = {}) {
  const index = loadIndex();
  const key = generateCacheKey(query, destination, theme);
  const filename = path.basename(filePath);

  index[key] = {
    query,
    destination,
    theme,
    filename,
    url: sourceUrl,
    source: metadata.source || 'unknown',
    metadata,
    cachedAt: Date.now(),
    lastAccessed: Date.now()
  };

  saveIndex(index);
  return { key, ...index[key] };
}

// ── Prune old cache entries (called by scheduler or manual trigger) ────────────
function prune() {
  const index = loadIndex();
  const now = Date.now();
  const evicted = [];

  Object.entries(index).forEach(([key, entry]) => {
    if (!isCacheFresh(entry)) {
      const filePath = path.join(CACHE_DIR, entry.filename);
      try { fs.unlinkSync(filePath); } catch {}
      evicted.push(key);
      delete index[key];
    }
  });

  if (evicted.length > 0) {
    saveIndex(index);
  }

  return { evictedCount: evicted.length, totalEntries: Object.keys(index).length };
}

// ── Get cache stats ───────────────────────────────────────────────────────────
function getStats() {
  const index = loadIndex();
  const files = fs.readdirSync(CACHE_DIR).filter(f => f !== 'index.json');
  const totalSizeMB = files.reduce((sum, f) => {
    const stat = fs.statSync(path.join(CACHE_DIR, f));
    return sum + (stat.size / 1024 / 1024);
  }, 0);

  const freshCount = Object.values(index).filter(e => isCacheFresh(e)).length;
  const staleCount = Object.keys(index).length - freshCount;

  return {
    cacheDir: CACHE_DIR,
    totalFiles: files.length,
    totalSizeMB: totalSizeMB.toFixed(2),
    indexedEntries: Object.keys(index).length,
    freshEntries: freshCount,
    staleEntries: staleCount,
    ttlDays: CACHE_TTL_DAYS
  };
}

// ── Clear entire cache ───────────────────────────────────────────────────────
function clear() {
  const index = loadIndex();
  const cleared = Object.keys(index);
  Object.values(index).forEach(entry => {
    const filePath = path.join(CACHE_DIR, entry.filename);
    try { fs.unlinkSync(filePath); } catch {}
  });
  fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify({}, null, 2), 'utf8');
  return { clearedCount: cleared.length };
}

module.exports = { get, set, prune, getStats, clear, loadIndex };
