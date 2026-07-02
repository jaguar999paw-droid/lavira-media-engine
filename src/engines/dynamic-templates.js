// src/engines/dynamic-templates.js — Intelligent Template Selection & Auto-Layout System
// Transforms static card templates into dynamic, media-aware content generation
'use strict';
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const cfg = require('../config');
const BRAND = require('../orchestrator/brand');
const { log } = require('../orchestrator/memory');
const logoLoader = require('./logo-loader');

// ── TEMPLATE REGISTRY ────────────────────────────────────────────────────
const TEMPLATE_REGISTRY = {
  hero_destination: {
    contentTypes: ['promo', 'storytelling', 'informational'],
    layouts: ['standard', 'story', 'minimal'],
    priority: 1,
    mediaAware: true,
    description: 'Large destination showcase with hook and highlights'
  },
  package_promo: {
    contentTypes: ['promo', 'informational'],
    layouts: ['standard'],
    priority: 2,
    mediaAware: false,
    description: 'Package details with highlights and CTA'
  },
  testimonial: {
    contentTypes: ['storytelling', 'social_proof'],
    layouts: ['standard'],
    priority: 3,
    mediaAware: true,
    description: 'Guest experience with quote and rating'
  },
  wildlife_spotlight: {
    contentTypes: ['educational', 'storytelling'],
    layouts: ['story'],
    priority: 4,
    mediaAware: true,
    description: 'Animal focus with facts and destination'
  },
  activity_highlight: {
    contentTypes: ['promo', 'storytelling'],
    layouts: ['standard', 'story'],
    priority: 5,
    mediaAware: true,
    description: 'Safari activity showcase'
  }
};

// ── PER-PLATFORM OUTPUT DIMENSIONS ──────────────────────────────────────
// Implementation TODO #1 / Section F: each platform target gets its own
// aspect ratio and layout pass — never one image naively squeezed into
// several shapes. This is the actual render target, independent of
// whatever size the source stock/user media happens to be.
const PLATFORM_SPECS = {
  instagram_post:   { w: 1080, h: 1080 },
  instagram_story:  { w: 1080, h: 1920 },
  facebook_feed:    { w: 1200, h: 630  },
  facebook:         { w: 1200, h: 630  },
  tiktok:           { w: 1080, h: 1920 },
  whatsapp:         { w: 1080, h: 1920 },
  twitter_card:     { w: 1200, h: 628  },
};

function resolvePlatformSpec(profile) {
  return PLATFORM_SPECS[profile] || PLATFORM_SPECS.instagram_post;
}

// ── USAGE HISTORY TRACKING ──────────────────────────────────────────────
let templateUsageHistory = new Map();

function recordTemplateUsage(template, contentType, success = true) {
  const key = `${template}_${contentType}`;
  const current = templateUsageHistory.get(key) || { count: 0, success: 0 };
  current.count++;
  if (success) current.success++;
  templateUsageHistory.set(key, current);
}

// ── MEDIA ANALYSIS FOR AUTO-LAYOUT ──────────────────────────────────────
async function analyzeMediaForLayout(mediaPath) {
  try {
    const metadata = await sharp(mediaPath).metadata();
    const stats = await sharp(mediaPath).stats();

    // Detect dominant colors and brightness
    const { dominant } = stats;
    const brightness = (dominant.r + dominant.g + dominant.b) / 3;
    const isDark = brightness < 128;

    // Detect edges/texture (simple approximation)
    const hasHighContrast = (Math.max(dominant.r, dominant.g, dominant.b) - Math.min(dominant.r, dominant.g, dominant.b)) > 100;

    return {
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.width / metadata.height,
      isPortrait: metadata.height > metadata.width,
      isDark,
      hasHighContrast,
      brightness,
      format: metadata.format
    };
  } catch (e) {
    return { width: 1080, height: 1080, aspectRatio: 1, isPortrait: false, isDark: false, hasHighContrast: false, brightness: 128, format: 'unknown' };
  }
}

// ── INTELLIGENT TEMPLATE SELECTION ──────────────────────────────────────
function selectTemplate(contentType, mediaAnalysis = null, userIntent = '', recentTemplates = []) {
  let candidates = Object.entries(TEMPLATE_REGISTRY)
    .filter(([name, config]) => config.contentTypes.includes(contentType))
    .map(([name, config]) => ({ name, ...config }));

  // Filter by media compatibility
  if (mediaAnalysis) {
    candidates = candidates.filter(template => {
      if (template.mediaAware && mediaAnalysis.isPortrait) return true;
      if (!template.mediaAware && !mediaAnalysis.isPortrait) return true;
      return template.layouts.includes(mediaAnalysis.isPortrait ? 'story' : 'standard');
    });
  }

  // Avoid recent repetition
  const recentNames = recentTemplates.slice(-3);
  let filtered = candidates.filter(c => !recentNames.includes(c.name));
  if (filtered.length) candidates = filtered; // only apply if it doesn't wipe out every candidate

  // Score by usage history and priority
  candidates.forEach(candidate => {
    const key = `${candidate.name}_${contentType}`;
    const history = templateUsageHistory.get(key) || { count: 0, success: 0 };
    const successRate = history.count > 0 ? history.success / history.count : 0.5;

    candidate.score = (candidate.priority * 0.4) + (successRate * 0.6);
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.name || 'hero_destination';
}

// ── DYNAMIC TEXT POSITIONING ─────────────────────────────────────────────
function calculateTextLayout(mediaAnalysis, textElements) {
  const { width, height, isDark, hasHighContrast } = mediaAnalysis;

  // Safe zones (avoid platform UI overlap: IG story top/bottom ~14%, feed margins)
  const safeZone = {
    top: height * 0.15,
    bottom: height * 0.85,
    left: width * 0.08,
    right: width * 0.92
  };

  // Position text based on media characteristics
  let textY;
  if (isDark) {
    textY = height * 0.25; // Higher for dark images
  } else if (hasHighContrast) {
    textY = height * 0.35; // Middle for busy images
  } else {
    textY = height * 0.65; // Lower third for clean images
  }

  return {
    primaryText: { x: width * 0.5, y: textY, anchor: 'middle' },
    secondaryText: { x: width * 0.5, y: textY + height * 0.08, anchor: 'middle' },
    safeZone
  };
}

// ── LOGO CORNER → PIXEL POSITION ─────────────────────────────────────────
// Computes a brand-safe top-left position for the logo raster given the
// canvas size and a target logo width. Corners are chosen to never overlap
// the contact bar (bottom strip) or the hook/title text band.
function logoCornerPosition(corner, w, h, logoW, logoH) {
  const margin = Math.round(w * 0.04);
  switch (corner) {
    case 'top_right':
      return { left: w - logoW - margin, top: margin };
    case 'bottom_left_above_bar':
      // contact bar occupies the bottom ~10% — sit just above it
      return { left: margin, top: Math.round(h * 0.90) - logoH - margin };
    case 'top_left':
    default:
      return { left: margin, top: margin };
  }
}

// ── DYNAMIC TEMPLATE RENDERING ───────────────────────────────────────────
// `variation` (optional) is the object returned by variation-engine's
// resolveVariation(): { palette, logoCorner, fontPairing, layout, ... }
async function renderDynamicTemplate(templateName, data, mediaPath = null, profile = 'instagram_post', variation = null) {
  const template = TEMPLATE_REGISTRY[templateName];
  if (!template) throw new Error(`Unknown template: ${templateName}`);

  const spec = resolvePlatformSpec(profile);

  // Analyze source media for tone (dark/contrast) only — actual render
  // dimensions always come from the platform spec, not the source file.
  const sourceAnalysis = mediaPath ? await analyzeMediaForLayout(mediaPath) : null;
  const mediaAnalysis = {
    width: spec.w,
    height: spec.h,
    isDark: sourceAnalysis ? sourceAnalysis.isDark : true,
    hasHighContrast: sourceAnalysis ? sourceAnalysis.hasHighContrast : false,
  };

  const layout = calculateTextLayout(mediaAnalysis, data);

  const palette = (variation && variation.palette) || { bg:'#2D6A4F', accent:'#F4A261', text:'#F9F5F0', overlay:'rgba(27,40,48,0.62)', name:'ForestGold' };
  const fontPairing = (variation && variation.fontPairing) || { display: 'Arial, sans-serif', body: 'Arial, sans-serif' };
  const logoCorner = (variation && variation.logoCorner) || 'top_left';

  const svgContent = generateDynamicSVG(templateName, data, mediaAnalysis, layout, profile, palette, fontPairing);
  const svgBuffer = Buffer.from(svgContent);

  const outName = `dynamic_${templateName}_${profile}_${uuid().slice(0,8)}.jpg`;
  const outPath = path.join(cfg.OUTPUTS_DIR, outName);

  // Logo raster, sized relative to canvas width, composited at the chosen corner
  const logoW = Math.round(spec.w * 0.16);
  let logoPng = null, logoMeta = null;
  try {
    logoPng = await logoLoader.getLogoPNG(logoW);
    logoMeta = await sharp(logoPng).metadata();
  } catch (_) { /* logo unavailable — post still ships with brand name text from the SVG */ }

  const compositeLayers = [{ input: svgBuffer, blend: 'over' }];
  if (logoPng && logoMeta) {
    const pos = logoCornerPosition(logoCorner, spec.w, spec.h, logoMeta.width, logoMeta.height);
    compositeLayers.push({ input: logoPng, left: pos.left, top: pos.top, blend: 'over' });
  }

  let pipeline;
  if (mediaPath && fs.existsSync(mediaPath)) {
    pipeline = sharp(mediaPath)
      .resize(spec.w, spec.h, { fit: 'cover', position: 'centre' })
      .composite(compositeLayers);
  } else {
    const baseBg = Buffer.from(generateBackgroundSVG(mediaAnalysis, profile, palette));
    pipeline = sharp(baseBg).composite(compositeLayers);
  }

  await pipeline.jpeg({ quality: 95 }).toFile(outPath);

  recordTemplateUsage(templateName, data.contentType || 'promo');

  return {
    file: outPath,
    filename: outName,
    template: templateName,
    layout: (variation && variation.layout) || null,
    palette: palette.name,
    logoCorner,
    profile,
    resolution: `${spec.w}x${spec.h}`,
    mediaAnalysis,
    downloadUrl: `/outputs/${outName}`
  };
}

// ── DYNAMIC SVG GENERATION ────────────────────────────────────────────────
function generateDynamicSVG(templateName, data, mediaAnalysis, layout, profile, palette, fontPairing) {
  const { width = 1080, height = 1080 } = mediaAnalysis || {};
  const { primaryText, secondaryText } = layout || {};

  switch (templateName) {
    case 'hero_destination':
      return generateHeroDestinationSVG(data, width, height, primaryText, secondaryText, palette, fontPairing);
    case 'wildlife_spotlight':
      return generateWildlifeSpotlightSVG(data, width, height, primaryText, secondaryText, palette, fontPairing);
    case 'testimonial':
      return generateTestimonialSVG(data, width, height, primaryText, secondaryText, palette, fontPairing);
    case 'package_promo':
      return generatePackagePromoSVG(data, width, height, primaryText, secondaryText, palette, fontPairing);
    case 'activity_highlight':
      return generateActivityHighlightSVG(data, width, height, primaryText, secondaryText, palette, fontPairing);
    default:
      return generateHeroDestinationSVG(data, width, height, primaryText, secondaryText, palette, fontPairing);
  }
}

// ── Shared contact bar (brand name + phone + website + CTA) ──────────────
// Pulled from the live BRAND dictionary — never hard-coded per Section B.
function contactBarSVG(w, h, palette) {
  const phone = BRAND.phone || '';
  const site  = (BRAND.website || '').replace('https://', '');
  return `
    <rect x="0" y="${h*0.90}" width="${w}" height="${h*0.10}" fill="rgba(10,22,18,0.92)"/>
    <text x="${w*0.05}" y="${h*0.935}" font-family="Arial,sans-serif" font-weight="bold"
          font-size="${Math.round(h*0.028)}" fill="${palette.accent}">${escapeXML(BRAND.name || 'Lavira Safaris')}</text>
    <text x="${w*0.05}" y="${h*0.965}" font-family="Arial,sans-serif"
          font-size="${Math.round(h*0.02)}" fill="${palette.text}" opacity="0.9">📞 ${escapeXML(phone)}  ·  🌐 ${escapeXML(site)}</text>`;
}

function ctaSVG(w, h, cta, palette, y) {
  if (!cta) return '';
  return `<text x="${w*0.5}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="${Math.round(w*0.03)}" font-weight="bold" fill="${palette.accent}">${escapeXML(cta)}</text>`;
}

function generateHeroDestinationSVG(data, w, h, primary, secondary, palette, fontPairing) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,22,18,0)"/>
        <stop offset="60%" stop-color="${palette.overlay}"/>
        <stop offset="100%" stop-color="rgba(10,22,18,0.9)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <text x="${primary?.x || w/2}" y="${primary?.y || h*0.62}" text-anchor="${primary?.anchor || 'middle'}"
          font-family="${fontPairing.display}" font-size="${Math.round(w*0.06)}" font-weight="bold" fill="${palette.accent}">
      ${escapeXML(data.hook || data.title || data.destination || 'Lavira Safaris')}
    </text>

    ${data.destination ? `<text x="${secondary?.x || w/2}" y="${secondary?.y || h*0.70}" text-anchor="${secondary?.anchor || 'middle'}"
          font-family="${fontPairing.body}" font-size="${Math.round(w*0.035)}" fill="${palette.text}">
      📍 ${escapeXML(data.destination)}${data.highlight ? ' — ' + escapeXML(data.highlight) : ''}
    </text>` : ''}

    ${ctaSVG(w, h, data.cta, palette, h*0.86)}
    ${contactBarSVG(w, h, palette)}
  </svg>`;
}

function generateWildlifeSpotlightSVG(data, w, h, primary, secondary, palette, fontPairing) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,22,18,0)"/>
        <stop offset="70%" stop-color="${palette.overlay}"/>
        <stop offset="100%" stop-color="rgba(10,22,18,0.95)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <rect x="${w*0.05}" y="${h*0.60}" width="${w*0.5}" height="${h*0.06}" fill="${palette.accent}" rx="${w*0.02}"/>
    <text x="${w*0.3}" y="${h*0.638}" text-anchor="middle" font-family="${fontPairing.display}"
          font-size="${Math.round(w*0.05)}" font-weight="900" fill="#0A1612">
      ${escapeXML(data.animal || 'Wildlife')}
    </text>

    <text x="${w*0.05}" y="${h*0.72}" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.032)}" fill="${palette.text}" opacity="0.9">
      ${escapeXML((data.hook || data.fact || 'Amazing wildlife awaits').slice(0, 80))}
    </text>

    <text x="${w*0.05}" y="${h*0.76}" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.025)}" fill="${palette.accent}">
      📍 ${escapeXML(data.destination || 'Kenya')}
    </text>

    ${ctaSVG(w, h, data.cta, palette, h*0.86)}
    ${contactBarSVG(w, h, palette)}
  </svg>`;
}

function generateTestimonialSVG(data, w, h, primary, secondary, palette, fontPairing) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${palette.overlay}"/>

    <text x="${w*0.1}" y="${h*0.25}" font-family="${fontPairing.display}" font-size="${w*0.08}" fill="${palette.accent}" opacity="0.5">"</text>

    <text x="${w*0.5}" y="${h*0.35}" text-anchor="middle" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.04)}" fill="${palette.text}" font-style="italic">
      ${escapeXML((data.quote || 'Amazing experience!').slice(0, 110))}
    </text>

    <text x="${w*0.5}" y="${h*0.60}" text-anchor="middle" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.035)}" font-weight="bold" fill="${palette.accent}">
      — ${escapeXML(data.guestName || data.guest || 'Happy Traveler')}
    </text>

    ${ctaSVG(w, h, data.cta, palette, h*0.86)}
    ${contactBarSVG(w, h, palette)}
  </svg>`;
}

function generatePackagePromoSVG(data, w, h, primary, secondary, palette, fontPairing) {
  const highlights = (data.highlights || []).slice(0, 4);
  const highlightLines = highlights.map((hl, i) =>
    `<text x="${w*0.08}" y="${h*0.50 + i * h*0.045}" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.03)}" fill="${palette.text}">✓ ${escapeXML(String(hl))}</text>`
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${palette.overlay}"/>

    <text x="${w*0.5}" y="${h*0.30}" text-anchor="middle" font-family="${fontPairing.display}"
          font-size="${Math.round(w*0.055)}" font-weight="bold" fill="${palette.accent}">
      ${escapeXML(data.packageName || (data.destination ? data.destination + ' Safari' : 'Safari Package'))}
    </text>
    ${data.duration ? `<text x="${w*0.5}" y="${h*0.37}" text-anchor="middle" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.03)}" fill="${palette.text}">${escapeXML(data.duration)}</text>` : ''}

    ${highlightLines}

    ${ctaSVG(w, h, data.cta, palette, h*0.82)}
    ${contactBarSVG(w, h, palette)}
  </svg>`;
}

function generateActivityHighlightSVG(data, w, h, primary, secondary, palette, fontPairing) {
  const activity = data.activity || (data.activities && data.activities[0]) || 'Safari Adventure';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,22,18,0)"/>
        <stop offset="65%" stop-color="${palette.overlay}"/>
        <stop offset="100%" stop-color="rgba(10,22,18,0.92)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <text x="${primary?.x || w/2}" y="${primary?.y || h*0.66}" text-anchor="${primary?.anchor || 'middle'}"
          font-family="${fontPairing.display}" font-size="${Math.round(w*0.052)}" font-weight="bold" fill="${palette.accent}">
      ${escapeXML(activity)}
    </text>

    ${data.hook ? `<text x="${w*0.5}" y="${h*0.73}" text-anchor="middle" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.03)}" fill="${palette.text}">${escapeXML(data.hook)}</text>` : ''}

    ${data.destination ? `<text x="${w*0.5}" y="${h*0.78}" text-anchor="middle" font-family="${fontPairing.body}"
          font-size="${Math.round(w*0.026)}" fill="${palette.accent}">📍 ${escapeXML(data.destination)}</text>` : ''}

    ${ctaSVG(w, h, data.cta, palette, h*0.86)}
    ${contactBarSVG(w, h, palette)}
  </svg>`;
}

function generateBackgroundSVG(mediaAnalysis, profile, palette) {
  const { width = 1080, height = 1080 } = mediaAnalysis;
  const p = palette || { bg: '#2D6A4F', accent: '#1B4332' };
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.bg}"/>
        <stop offset="100%" stop-color="#1B4332"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
  </svg>`;
}

function escapeXML(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = {
  selectTemplate,
  renderDynamicTemplate,
  analyzeMediaForLayout,
  TEMPLATE_REGISTRY,
  PLATFORM_SPECS,
  recordTemplateUsage
};
