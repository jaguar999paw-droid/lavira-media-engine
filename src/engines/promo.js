// engines/promo.js — Zero-media autonomous promo generator
// Creates a full branded post without ANY user-uploaded media.
// Pipeline: pick destination + theme → search Pexels stock → download →
//           Sharp brand treatment → Claude caption → return complete post package.
'use strict';
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const sharp   = require('sharp');
const { v4: uuid } = require('uuid');
const cfg     = require('../config');
const BRAND   = require('../orchestrator/brand');
const { generatePromoPackage } = require('../content/ai-captions');
const { resolvePostData } = require('./post-defaults');
const mediaLib = require('./media-library');

const OUTPUTS_DIR = cfg.OUTPUTS_DIR;

// ── IMAGE PROFILES for zero-media posts ──────────────────────────────────────
const POST_PROFILES = {
  instagram_post:   { w:1080, h:1080 },
  instagram_story:  { w:1080, h:1920 },
  facebook:         { w:1280, h:720  },
  twitter_card:     { w:1200, h:628  },
};

// ── PEXELS SEARCH ─────────────────────────────────────────────────────────────
async function searchPexels(query, perPage = 5) {
  const key = process.env.PEXELS_API_KEY || cfg.PEXELS_KEY || '';
  if (!key) return { photos: [] };

  return new Promise((res, rej) => {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
    https.get(url, { headers: { Authorization: key } }, resp => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { res(JSON.parse(data)); } catch { res({ photos: [] }); }
      });
    }).on('error', () => res({ photos: [] }));
  });
}

// ── DOWNLOAD IMAGE ────────────────────────────────────────────────────────────
function downloadImage(url, destPath) {
  return new Promise((res, rej) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);
    proto.get(url, resp => {
      if (resp.statusCode === 301 || resp.statusCode === 302) {
        file.close();
        return downloadImage(resp.headers.location, destPath).then(res).catch(rej);
      }
      resp.pipe(file);
      file.on('finish', () => { file.close(); res(destPath); });
    }).on('error', err => { fs.unlink(destPath, () => {}); rej(err); });
  });
}

// ── SVG FALLBACK GRAPHIC ──────────────────────────────────────────────────────
// If no stock image found, generate a branded SVG-based graphic
function generateFallbackSVG(destination, theme, width = 1080, height = 1080) {
  const colors = { bg: BRAND.colors.primary, accent: BRAND.colors.accent, text: '#FFFFFF' };
  const dest   = (BRAND.destination_profiles[destination] || {}).headline || destination;

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.bg}"/>
      <stop offset="100%" stop-color="#1B2830"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="0" y="${height*0.55}" width="${width}" height="${height*0.45}" fill="rgba(0,0,0,0.45)"/>
  <text x="${width/2}" y="${height*0.18}" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="${Math.round(width*0.06)}" font-weight="bold" fill="${colors.accent}">
    LAVIRA SAFARIS
  </text>
  <text x="${width/2}" y="${height*0.72}" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="${Math.round(width*0.05)}" font-weight="bold" fill="${colors.text}">
    ${destination}
  </text>
  <text x="${width/2}" y="${height*0.82}" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="${Math.round(width*0.025)}" fill="${colors.accent}">
    ${dest.slice(0, 60)}
  </text>
  <text x="${width/2}" y="${height*0.92}" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="${Math.round(width*0.022)}" fill="rgba(255,255,255,0.7)">
    ${BRAND.website.replace("https://","")} | ${BRAND.phone}
  </text>
</svg>`;
  return Buffer.from(svg);
}

// ── APPLY BRAND TREATMENT ─────────────────────────────────────────────────────
async function brandImage(inputPath, profile = 'instagram_post', destination = '') {
  const spec    = POST_PROFILES[profile] || POST_PROFILES.instagram_post;
  const outFile = path.join(OUTPUTS_DIR, `lavira_auto_${profile}_${uuid().slice(0,6)}.jpg`);

  const wmSvg = Buffer.from(
    `<svg width="${spec.w}" height="${spec.h}">
      <rect x="0" y="${spec.h-60}" width="${spec.w}" height="60" fill="rgba(0,0,0,0.55)"/>
      <text x="${spec.w/2}" y="${spec.h-35}" text-anchor="middle" font-family="Arial,sans-serif"
            font-size="${Math.round(spec.w*0.022)}" fill="white" opacity="0.9">${BRAND.website.replace("https://","").toUpperCase()} | ${BRAND.phone}</text>
      <text x="${spec.w/2}" y="${spec.h-14}" text-anchor="middle" font-family="Arial,sans-serif"
            font-size="${Math.round(spec.w*0.018)}" fill="${BRAND.colors.accent}" opacity="0.9">${destination}</text>
    </svg>`
  );

  await sharp(inputPath)
    .resize(spec.w, spec.h, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: 1.15, brightness: 1.02 })
    .composite([{ input: wmSvg, blend: 'over' }])
    .jpeg({ quality: 90 })
    .toFile(outFile);

  return { file: outFile, filename: path.basename(outFile), profile, resolution: `${spec.w}x${spec.h}` };
}

// ── MAIN: ZERO-MEDIA PROMO ────────────────────────────────────────────────────
async function generateAutoPromo({ destination, theme, context, profiles, recentCaptions } = {}) {
  const dest     = destination || BRAND.destinations[Math.floor(Math.random() * BRAND.destinations.length)];
  const thm      = theme || 'wildlife_spotlight';
  const queries  = BRAND.pexels_queries[dest] || BRAND.pexels_queries.default;
  const query    = queries[Math.floor(Math.random() * queries.length)];
  const outProfs = profiles || ['instagram_post', 'instagram_story', 'facebook'];

  // 1. Fetch promo package (caption, hook, hashtags) in parallel with image search
  const [promoResult, pexelsResult] = await Promise.all([
    generatePromoPackage({ destination: dest, mediaType: 'auto', context: context || `${thm} post for ${dest}`, recentCaptions: recentCaptions || [] }),
    searchPexels(query, 5)
  ]);

  // 2. Pick best image
  const photo    = pexelsResult.photos?.[0];
  const imgUrl   = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
  const tmpPath  = path.join(OUTPUTS_DIR, `tmp_stock_${uuid().slice(0,6)}.jpg`);

  let sourceImg = tmpPath;
  let stockCredit = null;

  if (imgUrl) {
    try {
      await downloadImage(imgUrl, tmpPath);
      stockCredit = { 
        photographer: photo.photographer, 
        url: photo.url, 
        source: 'Pexels',
        pexelsSrc: {
          large2x: photo.src?.large2x,
          large: photo.src?.large,
          medium: photo.src?.medium,
          small: photo.src?.small
        },
        stockPhotoUrl: photo.url
      };
    } catch {
      // Fall back to SVG if download fails
      const svg = generateFallbackSVG(dest, thm);
      await sharp(svg).jpeg({ quality: 90 }).toFile(tmpPath);
    }
  } else {
    // No Pexels key or no results — generate branded SVG graphic
    const svg = generateFallbackSVG(dest, thm);
    await sharp(svg).jpeg({ quality: 90 }).toFile(tmpPath);
  }

  // 3. Apply brand treatment for all profiles
  const imageResults = [];
  for (const prof of outProfs) {
    try {
      const branded = await brandImage(sourceImg, prof, dest);
      imageResults.push({ ...branded, downloadUrl: `/outputs/${branded.filename}` });
    } catch (e) {
      imageResults.push({ profile: prof, error: e.message });
    }
  }

  // 4. Cleanup temp file
  try { fs.unlinkSync(tmpPath); } catch {}

  // Enrich return with smart defaults (hook, highlight, season, CTA)
  let resolvedDefaults = {};
  try { resolvedDefaults = await resolvePostData(dest, thm, {}, {}); } catch(_) {}

  return {
    destination:  dest,
    hook:         resolvedDefaults.hook || '',
    highlight:    resolvedDefaults.highlight || '',
    seasonLine:   resolvedDefaults.seasonLine || '',
    cta:          resolvedDefaults.cta || '',
    theme:        thm,
    query,
    stockCredit,
    promo:        promoResult,
    results:      imageResults,
    mediaType:    'auto',
    generatedAt:  new Date().toISOString()
  };
}

module.exports = { generateAutoPromo, searchPexels, brandImage, generateFallbackSVG, POST_PROFILES };
