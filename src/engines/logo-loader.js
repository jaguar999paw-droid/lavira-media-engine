// src/engines/logo-loader.js
// Downloads, caches and serves the real Lavira logo as a sized PNG buffer.
// sharp can render SVG natively (librsvg) — no ImageMagick dependency.
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
const PNG_CACHE  = path.join(CACHE_DIR, 'logo_300.png');  // warm-up pre-render

fs.mkdirSync(CACHE_DIR, { recursive: true });

let _svgBuf = null;  // in-process memory cache

// ── Fetch SVG (network → file cache → memory) ─────────────────────────────
function fetchSVG() {
  if (_svgBuf) return Promise.resolve(_svgBuf);
  if (fs.existsSync(SVG_CACHE)) {
    _svgBuf = fs.readFileSync(SVG_CACHE);
    return Promise.resolve(_svgBuf);
  }
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

// ── Render SVG → PNG at given pixel width ─────────────────────────────────
async function getLogoPNG(width = 120) {
  const svgBuf = await fetchSVG();
  // Use density to hint rasterisation quality; resize to exact width
  const png = await sharp(svgBuf, { density: 192 })
    .resize(width, null, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
    .png()
    .toBuffer();
  return png;
}

// ── Warm cache at module-load time (non-blocking) ─────────────────────────
// Also pre-renders a 300px PNG so first real composite is fast.
(async () => {
  try {
    const svgBuf = await fetchSVG();
    if (!fs.existsSync(PNG_CACHE)) {
      const png300 = await sharp(svgBuf, { density: 192 })
        .resize(300, null, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
        .png()
        .toBuffer();
      fs.writeFileSync(PNG_CACHE, png300);
      console.log('[logo-loader] Logo cached → assets/brand/logo_300.png');
    }
  } catch (e) {
    console.warn('[logo-loader] Warm-up failed (logo will render on first use):', e.message);
  }
})();

module.exports = { getLogoPNG, fetchSVG };
