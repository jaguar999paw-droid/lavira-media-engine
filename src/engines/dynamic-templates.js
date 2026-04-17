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

// ── TEMPLATE REGISTRY ──────────────────────────────────────────────────────────
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

// ── USAGE HISTORY TRACKING ────────────────────────────────────────────────────
let templateUsageHistory = new Map();

function recordTemplateUsage(template, contentType, success = true) {
  const key = `${template}_${contentType}`;
  const current = templateUsageHistory.get(key) || { count: 0, success: 0 };
  current.count++;
  if (success) current.success++;
  templateUsageHistory.set(key, current);
}

// ── MEDIA ANALYSIS FOR AUTO-LAYOUT ────────────────────────────────────────────
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

// ── INTELLIGENT TEMPLATE SELECTION ────────────────────────────────────────────
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
  candidates = candidates.filter(c => !recentNames.includes(c.name));

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

// ── DYNAMIC TEXT POSITIONING ──────────────────────────────────────────────────
function calculateTextLayout(mediaAnalysis, textElements) {
  const { width, height, isDark, hasHighContrast } = mediaAnalysis;

  // Safe zones (avoid edges and busy areas)
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

// ── DYNAMIC TEMPLATE RENDERING ────────────────────────────────────────────────
async function renderDynamicTemplate(templateName, data, mediaPath = null, profile = 'instagram_post') {
  const template = TEMPLATE_REGISTRY[templateName];
  if (!template) throw new Error(`Unknown template: ${templateName}`);

  // Analyze media if provided
  const mediaAnalysis = mediaPath ? await analyzeMediaForLayout(mediaPath) : null;

  // Calculate dynamic layout
  const layout = mediaAnalysis ? calculateTextLayout(mediaAnalysis, data) : null;

  // Generate SVG with dynamic positioning
  const svgContent = generateDynamicSVG(templateName, data, mediaAnalysis, layout, profile);

  const svgBuffer = Buffer.from(svgContent);
  const outName = `dynamic_${templateName}_${profile}_${uuid().slice(0,8)}.jpg`;
  const outPath = path.join(cfg.OUTPUTS_DIR, outName);

  let pipeline;
  if (mediaPath && fs.existsSync(mediaPath)) {
    pipeline = sharp(mediaPath)
      .resize(mediaAnalysis.width, mediaAnalysis.height, { fit: 'cover' })
      .composite([{ input: svgBuffer, blend: 'over' }]);
  } else {
    // SVG-only with gradient background
    const baseBg = Buffer.from(generateBackgroundSVG(mediaAnalysis || { width: 1080, height: 1080 }, profile));
    pipeline = sharp(baseBg)
      .composite([{ input: svgBuffer, blend: 'over' }]);
  }

  await pipeline.jpeg({ quality: 95 }).toFile(outPath);

  // Record usage
  recordTemplateUsage(templateName, data.contentType || 'promo');

  return {
    file: outPath,
    filename: outName,
    template: templateName,
    profile,
    mediaAnalysis,
    downloadUrl: `/outputs/${outName}`
  };
}

// ── DYNAMIC SVG GENERATION ────────────────────────────────────────────────────
function generateDynamicSVG(templateName, data, mediaAnalysis, layout, profile) {
  const { width = 1080, height = 1080 } = mediaAnalysis || {};
  const { primaryText, secondaryText } = layout || {};

  // Template-specific content generation
  switch (templateName) {
    case 'hero_destination':
      return generateHeroDestinationSVG(data, width, height, primaryText, secondaryText);

    case 'wildlife_spotlight':
      return generateWildlifeSpotlightSVG(data, width, height, primaryText, secondaryText);

    case 'testimonial':
      return generateTestimonialSVG(data, width, height, primaryText, secondaryText);

    default:
      return generateHeroDestinationSVG(data, width, height, primaryText, secondaryText);
  }
}

// Template-specific SVG generators would go here...
function generateHeroDestinationSVG(data, w, h, primary, secondary) {
  // Implementation similar to existing but with dynamic positioning
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <!-- Dynamic gradient overlay -->
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,22,18,0)"/>
        <stop offset="60%" stop-color="rgba(10,22,18,0.6)"/>
        <stop offset="100%" stop-color="rgba(10,22,18,0.9)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <!-- Dynamic text positioning -->
    <text x="${primary?.x || w/2}" y="${primary?.y || h*0.7}" text-anchor="${primary?.anchor || 'middle'}"
          font-family="Arial,sans-serif" font-size="${Math.round(w*0.06)}" font-weight="bold" fill="#F4A261">
      ${escapeXML(data.title || data.destination || 'Lavira Safaris')}
    </text>

    ${data.subtitle ? `<text x="${secondary?.x || w/2}" y="${secondary?.y || h*0.78}" text-anchor="${secondary?.anchor || 'middle'}"
          font-family="Arial,sans-serif" font-size="${Math.round(w*0.035)}" fill="white">
      ${escapeXML(data.subtitle)}
    </text>` : ''}

    <!-- Contact bar -->
    <rect x="0" y="${h*0.9}" width="${w}" height="${h*0.1}" fill="rgba(10,22,18,0.9)"/>
    <text x="${w*0.05}" y="${h*0.945}" font-family="Arial,sans-serif" font-size="${Math.round(h*0.025)}" font-weight="bold" fill="#F4A261">
      📞 ${BRAND.phone}</text>
    <text x="${w*0.05}" y="${h*0.975}" font-family="Arial,sans-serif" font-size="${Math.round(h*0.02)}" fill="white">
      🌐 ${BRAND.website.replace("https://","")}</text>
  </svg>`;
}

function generateWildlifeSpotlightSVG(data, w, h, primary, secondary) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,22,18,0)"/>
        <stop offset="70%" stop-color="rgba(10,22,18,0.7)"/>
        <stop offset="100%" stop-color="rgba(10,22,18,0.95)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <!-- Animal badge -->
    <rect x="${w*0.05}" y="${h*0.65}" width="${w*0.5}" height="${h*0.08}" fill="#F4A261" rx="${w*0.02}"/>
    <text x="${w*0.3}" y="${h*0.695}" text-anchor="middle" font-family="Arial,sans-serif"
          font-size="${Math.round(w*0.06)}" font-weight="900" fill="#0A1612">
      ${escapeXML(data.animal || 'Wildlife')}
    </text>

    <!-- Dynamic fact positioning -->
    <text x="${w*0.05}" y="${h*0.78}" font-family="Arial,sans-serif"
          font-size="${Math.round(w*0.032)}" fill="white" opacity="0.9">
      ${escapeXML(data.fact || 'Amazing wildlife awaits')}
    </text>

    <text x="${w*0.05}" y="${h*0.82}" font-family="Arial,sans-serif"
          font-size="${Math.round(w*0.025)}" fill="#9fd3aa">
      📍 ${escapeXML(data.destination || 'Kenya')}
    </text>
  </svg>`;
}

function generateTestimonialSVG(data, w, h, primary, secondary) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="rgba(10,22,18,0.8)"/>

    <!-- Quote marks -->
    <text x="${w*0.1}" y="${h*0.25}" font-family="Arial,sans-serif" font-size="${w*0.08}" fill="#F4A261" opacity="0.5">"</text>

    <!-- Quote text -->
    <text x="${w*0.5}" y="${h*0.35}" text-anchor="middle" font-family="Arial,sans-serif"
          font-size="${Math.round(w*0.04)}" fill="white" font-style="italic">
      ${escapeXML(data.quote || 'Amazing experience!')}
    </text>

    <!-- Guest name -->
    <text x="${w*0.5}" y="${h*0.75}" text-anchor="middle" font-family="Arial,sans-serif"
          font-size="${Math.round(w*0.035)}" font-weight="bold" fill="#F4A261">
      — ${escapeXML(data.guestName || 'Happy Traveler')}
    </text>
  </svg>`;
}

function generateBackgroundSVG(mediaAnalysis, profile) {
  const { width = 1080, height = 1080 } = mediaAnalysis;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2D6A4F"/>
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
  recordTemplateUsage
};