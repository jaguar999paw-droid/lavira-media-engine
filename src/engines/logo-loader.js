// src/engines/logo-loader.js
// Loads the Lavira Safaris logo as a sized PNG buffer.
// Priority chain (fastest / most reliable first):
//   1. In-process memory cache (_svgBuf already loaded)
//   2. Pre-rendered PNG file  — assets/brand/logo_300.png  (warm resize via sharp)
//   3. Local SVG cache        — assets/brand/logo.svg       (render with sharp/librsvg)
//   4. Network fetch          — lavirasafaris.com SVG        (write to local cache, then render)
//
// This ensures video compositing NEVER fails due to DNS/network issues.
'use strict';
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');
const sharp = require('sharp');
const cfg   = require('../config');

const LOGO_URL   = 'https://lavirasafaris.com/wp-content/uploads/2025/02/lavira-logo.svg';
const CACHE_DIR  = path.join(cfg.ASSETS_DIR, 'brand');
const SVG_CACHE  = path.join(CACHE_DIR, 'logo.svg');
const PNG_CACHE  = path.join(CACHE_DIR, 'logo_300.png');  // pre-rendered warm cache

fs.mkdirSync(CACHE_DIR, { recursive: true });

let _svgBuf = null;  // in-process memory cache

// ── Fetch SVG (local cache first, then network) ────────────────────────────
function fetchSVG() {
  if (_svgBuf) return Promise.resolve(_svgBuf);

  // Priority 1: local SVG cache (already downloaded or bundled)
  if (fs.existsSync(SVG_CACHE)) {
    try {
      const buf = fs.readFileSync(SVG_CACHE);
      if (buf.length >= 500) {
        _svgBuf = buf;
        return Promise.resolve(_svgBuf);
      }
    } catch (_) {}
  }

  // Priority 2: network fetch → write to local cache
  return new Promise((resolve, reject) => {
    const mod = LOGO_URL.startsWith('https') ? https : http;
    const req = mod.get(LOGO_URL, res => {
      if (res.statusCode !== 200) return reject(new Error(`Logo HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 500) return reject(new Error('Logo SVG too small — bad fetch'));
        try { fs.writeFileSync(SVG_CACHE, buf); } catch (_) {}
        _svgBuf = buf;
        resolve(buf);
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Logo fetch timeout')); });
  });
}

// ── Render SVG → PNG at given pixel width ──────────────────────────────────
async function getLogoPNG(width = 120) {
  // Fast path: if requesting ≤300px and the PNG cache exists, just resize from it
  if (width <= 300 && fs.existsSync(PNG_CACHE)) {
    try {
      const resized = await sharp(PNG_CACHE)
        .resize(width, null, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
        .png()
        .toBuffer();
      if (resized.length > 200) return resized;
    } catch (_) {}
  }

  // Standard path: render from SVG
  const svgBuf = await fetchSVG();
  const png = await sharp(svgBuf, { density: 192 })
    .resize(width, null, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
    .png()
    .toBuffer();
  return png;
}

// ── Warm cache at module-load time (non-blocking) ──────────────────────────
// Pre-renders a 300px PNG so first real composite is instant.
(async () => {
  try {
    if (!fs.existsSync(PNG_CACHE)) {
      const svgBuf = await fetchSVG();
      const png300 = await sharp(svgBuf, { density: 192 })
        .resize(300, null, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
        .png()
        .toBuffer();
      fs.writeFileSync(PNG_CACHE, png300);
      console.log('[logo-loader] Logo pre-rendered → assets/brand/logo_300.png');
    } else {
      // Validate existing PNG cache — re-render if corrupt (<200 bytes)
      const stat = fs.statSync(PNG_CACHE);
      if (stat.size < 200) {
        fs.unlinkSync(PNG_CACHE);
        const svgBuf = await fetchSVG();
        const png300 = await sharp(svgBuf, { density: 192 })
          .resize(300, null, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
          .png()
          .toBuffer();
        fs.writeFileSync(PNG_CACHE, png300);
        console.log('[logo-loader] Logo PNG cache was corrupt — rebuilt.');
      } else {
        // Seed SVG memory cache from local file for zero-latency first composite
        if (!_svgBuf && fs.existsSync(SVG_CACHE)) {
          try { _svgBuf = fs.readFileSync(SVG_CACHE); } catch (_) {}
        }
        console.log('[logo-loader] Logo ready (local cache).');
      }
    }
  } catch (e) {
    console.warn('[logo-loader] Warm-up failed (logo will attempt on first use):', e.message);
  }
})();

module.exports = { getLogoPNG, fetchSVG };
