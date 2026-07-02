// src/engines/variation-engine.js — Signature Variance Engine
// "Random, but never arbitrary": every dimension is drawn from a curated,
// brand-safe pool. Randomness picks *which* approved option is used, never
// *whether* the brand/legibility rules (logo, contact bar, CTA, safe zones)
// are followed. See LATEST_CHANGES.md Section 3.
'use strict';

const dynTpl   = require('./dynamic-templates');
const intel    = require('./intelligence-router');

// ── Brand-safe logo corners ────────────────────────────────────────────
// Each corner is defined as an exclusion-aware anchor. The contact bar
// always sits at the bottom, so bottom corners are nudged above it.
const LOGO_CORNERS = ['top_left', 'top_right', 'bottom_left_above_bar'];

// ── Approved font pairings (Implementation TODO #4) ─────────────────────
// display = large hook/title text, body = secondary/caption-style text.
// NOTE: font names use single quotes (not double) because these strings get
// interpolated directly into a double-quoted SVG font-family="..." attribute
// in dynamic-templates.js — double quotes here would break the XML.
const FONT_PAIRINGS = [
  { name: 'ClassicSafari', display: "Georgia, 'Times New Roman', serif",   body: 'Arial, Helvetica, sans-serif' },
  { name: 'ModernBold',    display: "'Helvetica Neue', Arial, sans-serif", body: "'Segoe UI', Arial, sans-serif" },
  { name: 'EditorialWarm', display: "'Palatino Linotype', Georgia, serif", body: "'Trebuchet MS', Arial, sans-serif" },
];

// ── History persistence ──────────────────────────────────────────────────
// Prefers the shared lavira.db (survives restarts); falls back to an
// in-memory ring buffer if the DB module can't be loaded for any reason.
let _db = null;
try {
  _db = require('../orchestrator/memory').db;
  if (_db) {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS variation_history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        created   TEXT DEFAULT (datetime('now')),
        theme     TEXT,
        template  TEXT,
        layout    TEXT,
        palette   TEXT,
        logo_corner TEXT,
        hook_index  INTEGER,
        cta_index   INTEGER,
        angle       TEXT,
        font_pairing TEXT
      );
    `);
  }
} catch (_) { /* DB unavailable — fall back to in-memory history below */ }

const _memHistory = []; // fallback ring buffer, most-recent last
const HISTORY_WINDOW = 5;

function _recentCombos(theme) {
  if (_db) {
    try {
      return _db.prepare(
        `SELECT template, layout, palette, logo_corner, hook_index, cta_index
         FROM variation_history WHERE theme = ? ORDER BY id DESC LIMIT ?`
      ).all(theme, HISTORY_WINDOW);
    } catch (_) { /* fall through to memory */ }
  }
  return _memHistory.filter(h => h.theme === theme).slice(-HISTORY_WINDOW);
}

function _recordCombo(entry) {
  if (_db) {
    try {
      _db.prepare(
        `INSERT INTO variation_history (theme, template, layout, palette, logo_corner, hook_index, cta_index, angle, font_pairing)
         VALUES (@theme, @template, @layout, @palette, @logo_corner, @hook_index, @cta_index, @angle, @font_pairing)`
      ).run({
        theme: entry.theme, template: entry.template, layout: entry.layout,
        palette: entry.palette, logo_corner: entry.logoCorner,
        hook_index: entry.hookIndex ?? -1, cta_index: entry.ctaIndex ?? -1,
        angle: entry.angle || '', font_pairing: entry.fontPairing || '',
      });
      return;
    } catch (_) { /* fall through to memory */ }
  }
  _memHistory.push(entry);
  if (_memHistory.length > 200) _memHistory.shift(); // cheap cap
}

function _pickUnused(pool, usedValues, keyFn = x => x) {
  const used = new Set(usedValues);
  const candidates = pool.filter(item => !used.has(keyFn(item)));
  const from = candidates.length ? candidates : pool; // exhausted pool → re-roll from full pool
  return from[Math.floor(Math.random() * from.length)];
}

function _isExactRepeat(combo, recent) {
  return recent.some(r =>
    r.template === combo.template &&
    r.palette === combo.palette &&
    (r.hook_index ?? r.hookIndex) === combo.hookIndex &&
    (r.cta_index ?? r.ctaIndex) === combo.ctaIndex
  );
}

/**
 * resolveVariation()
 * Returns one fully-resolved, brand-safe variation object for a post.
 *
 * @param {Object} opts
 * @param {string} opts.destination
 * @param {string} opts.theme          - content theme, used both as contentType hint and no-repeat bucket
 * @param {string} [opts.contentType]  - defaults to 'promo'
 * @param {string} [opts.weather]      - drives palette weighting when known
 * @param {number} [opts.hookIndex]    - resolved hook pool index (from post-defaults LRU pick), for combo tracking
 * @param {number} [opts.ctaIndex]     - resolved CTA pool index, for combo tracking
 * @param {string} [opts.angle]        - resolved caption angle, for combo tracking
 * @param {Object} [opts.mediaAnalysis]
 */
function resolveVariation(opts = {}) {
  const theme       = opts.theme || 'wildlife_spotlight';
  const contentType = opts.contentType || 'promo';
  const recent       = _recentCombos(theme);
  const recentNames   = recent.map(r => r.template);

  // 1. Template — delegate to dynamic-templates' own scoring, but exclude combos we've already used
  let template = dynTpl.selectTemplate(contentType, opts.mediaAnalysis, opts.destination, recentNames);

  // 2. Layout — constrained to what the chosen template allows
  const tplConfig = dynTpl.TEMPLATE_REGISTRY[template] || dynTpl.TEMPLATE_REGISTRY.hero_destination;
  const layout = tplConfig.layouts[Math.floor(Math.random() * tplConfig.layouts.length)];

  // 3. Palette — weighted toward weather match; otherwise uniform random across all 5
  let paletteName;
  const WEATHER_MAP = { golden_hour:'AmberDusk', blue_hour:'SavannahBlue', sunny:'ForestGold', overcast:'SavannahBlue', misty:'SavannahBlue', rain:'NightSafari' };
  if (opts.weather && WEATHER_MAP[opts.weather]) {
    paletteName = WEATHER_MAP[opts.weather];
  } else {
    const paletteNames = Object.keys(intel.PALETTES);
    paletteName = _pickUnused(paletteNames, recent.map(r => r.palette));
  }
  const palette = { ...intel.PALETTES[paletteName], name: paletteName };

  // 4. Logo position — random among brand-safe corners
  const logoCorner = LOGO_CORNERS[Math.floor(Math.random() * LOGO_CORNERS.length)];

  // 5. Font pairing
  const fontPairing = FONT_PAIRINGS[Math.floor(Math.random() * FONT_PAIRINGS.length)];

  // 6. No-repeat-last-5: if the resolved template+palette+hook+cta combo is an
  //    exact repeat, re-roll the palette once (cheapest dimension to change).
  let combo = { theme, template, layout, palette: paletteName, logoCorner, hookIndex: opts.hookIndex, ctaIndex: opts.ctaIndex };
  if (_isExactRepeat(combo, recent)) {
    const alt = Object.keys(intel.PALETTES).filter(p => p !== paletteName);
    if (alt.length) {
      paletteName = alt[Math.floor(Math.random() * alt.length)];
      combo.palette = paletteName;
    }
  }

  const resolved = {
    theme, contentType, template, layout,
    palette: { ...intel.PALETTES[paletteName], name: paletteName },
    logoCorner, fontPairing,
    hookIndex: opts.hookIndex ?? null,
    ctaIndex: opts.ctaIndex ?? null,
    angle: opts.angle || null,
  };

  _recordCombo({ ...combo, palette: paletteName, angle: opts.angle, fontPairing: fontPairing.name });
  dynTpl.recordTemplateUsage(template, contentType, true);

  return resolved;
}

module.exports = { resolveVariation, LOGO_CORNERS, FONT_PAIRINGS };
