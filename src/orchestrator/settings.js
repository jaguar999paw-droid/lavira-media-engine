// orchestrator/settings.js — persisted admin/settings layer (DB-backed)
'use strict';
const BRAND = require('./brand');
const { state } = require('./memory');

const SETTINGS_KEY = 'admin_settings_json_v1';

function defaultSettings() {
  return {
    brand: {
      title: BRAND.name || 'Lavira Safaris',
      tagline: BRAND.tagline || 'Making Your Safari Experience Memorable',
      logoUrl: BRAND.logo_url || 'https://lavirasafaris.com/wp-content/uploads/2025/02/lavira-logo.svg',
      phone: BRAND.phone || '+254 721 757 387',
      email: BRAND.email || 'info@lavirasafaris.com',
      website: BRAND.website || 'https://lavirasafaris.com',
      instagramHandle: (BRAND.socials && BRAND.socials.instagram) || '@lavirasafaris',
      colors: {
        primary: '#2D6A4F',
        accent: '#F4A261',
        dark: '#1B2830',
        light: '#F9F5F0'
      }
    },
    workflow: {
      defaultMediaType: 'image',
      defaultTheme: 'wildlife_spotlight',
      approvalRequired: true,
      maxPostsPerRequest: 2
    },
    cache: {
      externalMediaTtlDays: 30,
      maxDiskMB: 2048
    },
    cleanup: {
      outputsMaxAgeDays: 30,
      uploadsMaxAgeDays: 1
    },
    legal: {
      legalNotice: ''
    }
  };
}

function readSettings() {
  const raw = state.get(SETTINGS_KEY, '');
  if (!raw) return defaultSettings();
  try {
    const parsed = JSON.parse(raw);
    return deepMerge(defaultSettings(), parsed);
  } catch {
    return defaultSettings();
  }
}

function writeSettings(patch, actor = 'user') {
  const current = readSettings();
  const next = deepMerge(current, patch || {});
  state.set(SETTINGS_KEY, JSON.stringify(next));
  // also record an audit entry via memory's KV set
  return next;
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  if (Array.isArray(patch)) return patch.slice();
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { defaultSettings, readSettings, writeSettings };

