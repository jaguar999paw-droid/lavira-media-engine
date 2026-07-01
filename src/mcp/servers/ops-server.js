#!/usr/bin/env node
// src/mcp/servers/ops-server.js — lavira-ops
// Concern: Health, file management, cache control, admin settings
// Tools: 11 | Op types: R, W, D | No AI calls, no social API, no media transforms
'use strict';

const rpc  = require('../lib/rpc-core');
const cfg  = require('../../config');
const fs   = require('fs');
const path = require('path');

// Lazy-load only what ops needs
let mediaCache;
try { mediaCache = require('../../engines/media-cache'); } catch { mediaCache = null; }
let settings;
try { settings = require('../../orchestrator/settings'); } catch { settings = null; }

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_engine_health',
    description: 'Check the health of the Lavira Media Engine web server: FFmpeg status, disk space, AI/Pexels/GIPHY API connectivity.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_api_status',
    description: 'Check which API integrations are active (Claude AI, GIPHY, Pexels, social tokens) vs missing.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_admin_settings',
    description: 'Get persisted admin settings (brand/publish/workflow/cleanup/cache).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'update_admin_settings',
    description: 'Update persisted admin settings by deep-merging the provided patch object.',
    inputSchema: {
      type: 'object',
      properties: { patch: { type: 'object', description: 'Key-value patch to deep-merge into admin settings' } },
      required: ['patch']
    }
  },
  {
    name: 'cache_stats',
    description: 'Check external media cache stats: size, entries, age, freshness.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cache_prune',
    description: 'Evict expired cache entries (older than 30 days) to free disk space.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cache_clear',
    description: 'Clear entire external media cache. DESTRUCTIVE — cannot be undone. Requires confirm:true.',
    inputSchema: {
      type: 'object',
      properties: { confirm: { type: 'boolean', description: 'Must be true to actually clear the cache' } },
      required: ['confirm']
    }
  },
  {
    name: 'cleanup_old_outputs',
    description: 'Delete output files older than N days to free disk space.',
    inputSchema: {
      type: 'object',
      properties: { olderThanDays: { type: 'number', description: 'Delete files older than this many days (default: 7)' } }
    }
  },
  {
    name: 'list_output_files',
    description: 'List all files in the outputs directory (videos, images, audio, GIFs) with size and created date.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by type: image, video, audio, all (default: all)' }
      }
    }
  },
  {
    name: 'list_upload_files',
    description: 'List files available in the uploads directory.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'delete_output_file',
    description: 'Delete a specific output file by filename. DESTRUCTIVE — cannot be undone. Requires confirm:true.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename (not full path) to delete from outputs/' },
        confirm: { type: 'boolean', description: 'Must be true to actually delete the file' }
      },
      required: ['filename', 'confirm']
    }
  }
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function listDir(dir, extFilter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => !f.startsWith('.') && (!extFilter || extFilter.test(f)))
    .map(f => {
      const full = path.join(dir, f);
      const st   = fs.statSync(full);
      return { filename: f, size: fmtSize(st.size), created: st.birthtime.toISOString().slice(0, 19) };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

// ── Handlers ────────────────────────────────────────────────────────────────

const HANDLERS = {

  async get_engine_health() {
    const { execSync } = require('child_process');
    const checks = {};

    // FFmpeg
    try {
      const ffmpegBin = require('ffmpeg-static');
      execSync(`"${ffmpegBin}" -version`, { stdio: 'pipe' });
      checks.ffmpeg = '✅ available';
    } catch { checks.ffmpeg = '❌ not found'; }

    // Disk space (outputs dir)
    try {
      const out = execSync(`df -h "${cfg.OUTPUTS_DIR}" 2>/dev/null | tail -1`).toString().trim().split(/\s+/);
      checks.disk = { size: out[1], used: out[2], avail: out[3], pct: out[4] };
    } catch { checks.disk = 'unavailable'; }

    // Outputs count
    checks.outputs_count = fs.existsSync(cfg.OUTPUTS_DIR) ? fs.readdirSync(cfg.OUTPUTS_DIR).length : 0;

    // Uploads count
    checks.uploads_count = fs.existsSync(cfg.UPLOADS_DIR) ? fs.readdirSync(cfg.UPLOADS_DIR).length : 0;

    // API keys presence (not values)
    checks.anthropic_key = !!process.env.ANTHROPIC_API_KEY ? '✅' : '❌';
    checks.pexels_key    = !!process.env.PEXELS_API_KEY    ? '✅' : '❌';
    checks.giphy_key     = !!process.env.GIPHY_API_KEY     ? '✅' : '❌';

    return { server: 'lavira-ops', status: 'healthy', ...checks };
  },

  async get_api_status() {
    const tokens = {
      ANTHROPIC_API_KEY:       !!process.env.ANTHROPIC_API_KEY,
      PEXELS_API_KEY:          !!process.env.PEXELS_API_KEY,
      GIPHY_API_KEY:           !!process.env.GIPHY_API_KEY,
      INSTAGRAM_ACCESS_TOKEN:  !!process.env.INSTAGRAM_ACCESS_TOKEN,
      INSTAGRAM_USER_ID:       !!process.env.INSTAGRAM_USER_ID,
      FACEBOOK_ACCESS_TOKEN:   !!process.env.FACEBOOK_ACCESS_TOKEN,
      FACEBOOK_PAGE_ID:        !!process.env.FACEBOOK_PAGE_ID,
      TIKTOK_ACCESS_TOKEN:     !!process.env.TIKTOK_ACCESS_TOKEN,
      TWITTER_API_KEY:         !!process.env.TWITTER_API_KEY,
      WHATSAPP_PHONE_NUMBER_ID:!!process.env.WHATSAPP_PHONE_NUMBER_ID,
      TELEGRAM_BOT_TOKEN:      !!process.env.TELEGRAM_BOT_TOKEN,
    };
    const active  = Object.entries(tokens).filter(([,v]) => v).map(([k]) => k);
    const missing = Object.entries(tokens).filter(([,v]) => !v).map(([k]) => k);
    return { active, missing };
  },

  async get_admin_settings() {
    if (settings?.getSettings) return settings.getSettings();
    const p = path.join(cfg.BASE_DIR || path.resolve(__dirname, '../../../..'), 'admin-settings.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return { note: 'No persisted admin settings found.' };
  },

  async update_admin_settings({ patch }) {
    if (settings?.updateSettings) return settings.updateSettings(patch);
    const p = path.join(cfg.BASE_DIR || path.resolve(__dirname, '../../../..'), 'admin-settings.json');
    const current = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
    function deepMerge(target, src) {
      for (const key of Object.keys(src)) {
        if (isPlainObject(src[key]) && isPlainObject(target[key])) {
          deepMerge(target[key], src[key]);
        } else {
          target[key] = src[key];
        }
      }
      return target;
    }
    const merged = deepMerge(JSON.parse(JSON.stringify(current)), patch);
    fs.writeFileSync(p, JSON.stringify(merged, null, 2));
    return { updated: true, settings: merged };
  },

  async cache_stats() {
    if (mediaCache?.getCacheStats) return mediaCache.getCacheStats();
    return { note: 'media-cache engine not available' };
  },

  async cache_prune() {
    if (mediaCache?.pruneCache) return mediaCache.pruneCache();
    return { note: 'media-cache engine not available' };
  },

  async cache_clear({ confirm } = {}) {
    if (!confirm) return { cleared: false, reason: 'Set confirm:true to clear the entire cache (irreversible).' };
    if (mediaCache?.clearCache) return mediaCache.clearCache();
    return { note: 'media-cache engine not available' };
  },

  async cleanup_old_outputs({ olderThanDays = 7 } = {}) {
    if (!fs.existsSync(cfg.OUTPUTS_DIR)) return { deleted: 0 };
    const cutoff = Date.now() - olderThanDays * 86400 * 1000;
    const files  = fs.readdirSync(cfg.OUTPUTS_DIR);
    let deleted  = 0;
    const list   = [];
    for (const f of files) {
      const full = path.join(cfg.OUTPUTS_DIR, f);
      const st   = fs.statSync(full);
      if (st.mtimeMs < cutoff && st.isFile()) {
        fs.unlinkSync(full);
        list.push(f);
        deleted++;
      }
    }
    return { deleted, files: list };
  },

  async list_output_files({ type = 'all' } = {}) {
    const EXT = {
      image: /\.(jpg|jpeg|png|webp|gif)$/i,
      video: /\.(mp4|mov|webm)$/i,
      audio: /\.(mp3|wav|aac|m4a)$/i,
    };
    const filter = type !== 'all' ? EXT[type] : null;
    return { files: listDir(cfg.OUTPUTS_DIR, filter) };
  },

  async list_upload_files() {
    return { files: listDir(cfg.UPLOADS_DIR) };
  },

  async delete_output_file({ filename, confirm }) {
    if (!confirm) return { deleted: false, reason: 'Set confirm:true to delete this file (irreversible).' };
    const full = path.join(cfg.OUTPUTS_DIR, path.basename(filename));
    if (!fs.existsSync(full)) return { deleted: false, reason: 'File not found' };
    fs.unlinkSync(full);
    return { deleted: true, filename };
  },
};

// ── Start ────────────────────────────────────────────────────────────────────
rpc.start({ name: 'lavira-ops', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
