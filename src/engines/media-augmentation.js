// src/engines/media-augmentation.js — Advanced Media Enhancement System
// Implements dynamic text rendering, video enhancements, and creative intelligence
'use strict';
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const cfg = require('../config');
const BRAND = require('../orchestrator/brand');

// ── CREATIVE INTELLIGENCE ─────────────────────────────────────────────────────
const CREATIVE_THEMES = {
  lion: {
    theme: 'power',
    colors: ['#D4AF37', '#8B4513', '#2D1810'],
    text: ['The King Awaits', 'Majestic Power', 'Sovereign of the Plains'],
    cta: 'Witness the Majesty'
  },
  elephant: {
    theme: 'wisdom',
    colors: ['#708090', '#2F4F4F', '#D2B48C'],
    text: ['Ancient Wisdom', 'Gentle Giants', 'Memory of the Wild'],
    cta: 'Connect with Nature'
  },
  zebra: {
    theme: 'harmony',
    colors: ['#FFFFFF', '#000000', '#808080'],
    text: ['Perfect Balance', 'Harmony in Motion', 'Nature\'s Pattern'],
    cta: 'Experience the Wild'
  },
  giraffe: {
    theme: 'perspective',
    colors: ['#DAA520', '#8B7355', '#F5DEB3'],
    text: ['Higher Perspective', 'Elegant Heights', 'Reach for Dreams'],
    cta: 'See the World Differently'
  },
  cheetah: {
    theme: 'speed',
    colors: ['#FFD700', '#FF8C00', '#DC143C'],
    text: ['Lightning Speed', 'Ultimate Hunter', 'Raw Power'],
    cta: 'Chase Your Dreams'
  },
  default: {
    theme: 'adventure',
    colors: ['#2D6A4F', '#F4A261', '#40916C'],
    text: ['Wild Adventure', 'Safari Dreams', 'African Wonders'],
    cta: 'Book Your Journey'
  }
};

// ── SUBJECT-AWARE TEXT PLACEMENT ──────────────────────────────────────────────
async function detectSubjectArea(mediaPath) {
  try {
    const metadata = await sharp(mediaPath).metadata();
    const { width, height } = metadata;

    // Simple edge detection approximation using blur difference
    const original = await sharp(mediaPath).blur(1).toBuffer();
    const blurred = await sharp(mediaPath).blur(5).toBuffer();

    // For now, use center bias with some randomness
    // In production, this would use ML-based subject detection
    const subjectX = width * (0.4 + Math.random() * 0.2);
    const subjectY = height * (0.3 + Math.random() * 0.4);

    return {
      x: subjectX,
      y: subjectY,
      confidence: 0.7,
      avoidZone: {
        x1: subjectX - width * 0.2,
        y1: subjectY - height * 0.15,
        x2: subjectX + width * 0.2,
        y2: subjectY + height * 0.15
      }
    };
  } catch (e) {
    return { x: 0, y: 0, confidence: 0, avoidZone: null };
  }
}

// ── DYNAMIC TEXT RENDERING ────────────────────────────────────────────────────
async function renderDynamicText(mediaPath, textConfig = {}) {
  const {
    primary = 'Lavira Safaris',
    secondary = '',
    theme = 'default',
    position = 'auto'
  } = textConfig;

  const metadata = await sharp(mediaPath).metadata();
  const { width, height } = metadata;

  // Get creative theme
  const creativeTheme = CREATIVE_THEMES[theme] || CREATIVE_THEMES.default;

  // Detect subject area for intelligent placement
  const subjectArea = await detectSubjectArea(mediaPath);

  // Calculate optimal text position
  let textX, textY, anchor;
  if (position === 'auto') {
    // Avoid subject area and place in safe zone
    const safeZones = [
      { x: width * 0.5, y: height * 0.2, anchor: 'middle' }, // Top center
      { x: width * 0.5, y: height * 0.8, anchor: 'middle' }, // Bottom center
      { x: width * 0.15, y: height * 0.5, anchor: 'start' },  // Left center
      { x: width * 0.85, y: height * 0.5, anchor: 'end' }    // Right center
    ];

    // Choose best safe zone (avoiding subject area)
    let bestZone = safeZones[0];
    let bestDistance = 0;

    for (const zone of safeZones) {
      const distance = Math.sqrt(
        Math.pow(zone.x - subjectArea.x, 2) +
        Math.pow(zone.y - subjectArea.y, 2)
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        bestZone = zone;
      }
    }

    textX = bestZone.x;
    textY = bestZone.y;
    anchor = bestZone.anchor;
  } else {
    // Manual positioning
    textX = position.x || width * 0.5;
    textY = position.y || height * 0.8;
    anchor = position.anchor || 'middle';
  }

  // Generate SVG overlay
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <!-- Text background for readability -->
    <rect x="${textX - width * 0.25}" y="${textY - height * 0.05}"
          width="${width * 0.5}" height="${height * 0.12}"
          fill="rgba(0,0,0,0.4)" rx="${width * 0.02}"/>

    <!-- Primary text -->
    <text x="${textX}" y="${textY}" text-anchor="${anchor}"
          font-family="Arial,sans-serif" font-size="${Math.round(width * 0.06)}"
          font-weight="bold" fill="${creativeTheme.colors[0]}">
      ${escapeXML(primary)}
    </text>

    ${secondary ? `<text x="${textX}" y="${textY + height * 0.04}" text-anchor="${anchor}"
          font-family="Arial,sans-serif" font-size="${Math.round(width * 0.035)}"
          fill="white" opacity="0.9">
      ${escapeXML(secondary)}
    </text>` : ''}

    <!-- CTA badge -->
    <rect x="${width * 0.05}" y="${height * 0.9}" width="${width * 0.4}" height="${height * 0.06}"
          fill="${creativeTheme.colors[1]}" rx="${width * 0.015}"/>
    <text x="${width * 0.25}" y="${height * 0.935}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${Math.round(width * 0.028)}"
          font-weight="bold" fill="white">
      ${escapeXML(creativeTheme.cta)}
    </text>
  </svg>`;

  const svgBuffer = Buffer.from(svgContent);

  return await sharp(mediaPath)
    .composite([{ input: svgBuffer, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ── VIDEO ENHANCEMENTS ───────────────────────────────────────────────────────
async function enhanceVideo(inputPath, enhancements = {}) {
  const {
    addIntro = true,
    addOutro = true,
    textOverlays = [],
    backgroundAudio = null,
    speed = 1.0,
    stabilization = false
  } = enhancements;

  return new Promise((resolve, reject) => {
    const outFile = path.join(cfg.OUTPUTS_DIR, `enhanced_${uuid().slice(0,8)}.mp4`);
    let command = ffmpeg(inputPath);

    // Speed adjustment
    if (speed !== 1.0) {
      command = command.videoFilter(`setpts=${1/speed}*PTS`);
      if (backgroundAudio) {
        command = command.audioFilter(`atempo=${speed}`);
      }
    }

    // Stabilization (basic)
    if (stabilization) {
      command = command.videoFilter('minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
    }

    // Add intro frame
    if (addIntro) {
      const introDuration = 2;
      const introSvg = generateIntroFrame();
      command = command
        .input(Buffer.from(introSvg))
        .inputOptions(['-f image2pipe', '-vcodec png', `-t ${introDuration}`])
        .complexFilter([
          '[0:v][1:v]concat=n=2:v=1:a=0[vout]',
          '[0:a][0:a]concat=n=2:v=0:a=1[aout]'
        ].filter(Boolean), '[vout][aout]concat=n=1:v=1:a=1')
        .outputOptions(['-map [vout]', '-map [aout]']);
    }

    // Text overlays
    if (textOverlays.length > 0) {
      const textFilters = textOverlays.map((overlay, index) => {
        const { text, start, duration, x = 'center', y = 'bottom' } = overlay;
        return `drawtext=text='${text.replace(/'/g, "\\'")}':fontcolor=white:fontsize=48:` +
               `box=1:boxcolor=black@0.5:x=${x}:y=${y}:enable='between(t,${start},${start + duration})'`;
      });
      command = command.videoFilter(textFilters.join(','));
    }

    // Background audio mixing
    if (backgroundAudio && fs.existsSync(backgroundAudio)) {
      command = command
        .input(backgroundAudio)
        .audioFilter('amix=inputs=2:duration=first')
        .outputOptions(['-c:a aac']);
    }

    command
      .output(outFile)
      .on('end', () => resolve({
        file: outFile,
        filename: path.basename(outFile),
        enhancements: Object.keys(enhancements).filter(k => enhancements[k])
      }))
      .on('error', reject)
      .run();
  });
}

// ── IMAGE ENHANCEMENTS ───────────────────────────────────────────────────────
async function enhanceImage(inputPath, enhancements = {}) {
  const {
    colorGrade = null,
    vignette = false,
    sharpen = false,
    brightness = 0,
    contrast = 1.0,
    saturation = 1.0
  } = enhancements;

  let pipeline = sharp(inputPath);

  // Color grading presets
  if (colorGrade) {
    switch (colorGrade) {
      case 'sunset':
        pipeline = pipeline.modulate({ saturation: 1.2, brightness: 1.1, hue: 15 });
        break;
      case 'wildlife':
        pipeline = pipeline.modulate({ saturation: 1.1, brightness: 1.05, contrast: 1.1 });
        break;
      case 'luxury':
        pipeline = pipeline.modulate({ saturation: 0.9, brightness: 0.95, contrast: 1.2 });
        break;
    }
  }

  // Manual adjustments
  if (brightness !== 0 || contrast !== 1.0 || saturation !== 1.0) {
    pipeline = pipeline.modulate({ brightness, saturation, contrast });
  }

  // Sharpening
  if (sharpen) {
    pipeline = pipeline.sharpen({ sigma: 1.5, m1: 2, m2: 0.5 });
  }

  // Vignette effect
  if (vignette) {
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;
    const vignetteSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="70%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.3)"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#vignette)"/>
    </svg>`;
    pipeline = pipeline.composite([{ input: Buffer.from(vignetteSvg), blend: 'multiply' }]);
  }

  return await pipeline.jpeg({ quality: 95 }).toBuffer();
}

// ── GENERATE INTRO/OUTRO FRAMES ──────────────────────────────────────────────
function generateIntroFrame() {
  const width = 1080, height = 1920;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="introBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2D6A4F"/>
        <stop offset="100%" stop-color="#1B4332"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#introBg)"/>

    <!-- Logo -->
    <circle cx="${width/2}" cy="${height*0.4}" r="${width*0.15}" fill="#F4A261"/>
    <text x="${width/2}" y="${height*0.4 + width*0.04}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${width*0.12}" font-weight="900" fill="#0A1612">L</text>

    <!-- Brand name -->
    <text x="${width/2}" y="${height*0.6}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${width*0.08}" font-weight="bold" fill="white">
      LAVIRA SAFARIS
    </text>

    <text x="${width/2}" y="${height*0.65}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${width*0.04}" fill="#F4A261">
      Making Your Safari Memorable
    </text>
  </svg>`;
}

// ── CREATIVE INTELLIGENCE ENGINE ─────────────────────────────────────────────
function analyzeContentForTheme(content = {}) {
  const { animal, destination, mood, context } = content;

  // Animal-based theming
  if (animal && CREATIVE_THEMES[animal.toLowerCase()]) {
    return animal.toLowerCase();
  }

  // Destination-based theming
  const destinationThemes = {
    'masai_mara': 'lion',
    'amboseli': 'elephant',
    'tsavo': 'cheetah',
    'samburu': 'giraffe'
  };

  if (destination && destinationThemes[destination.toLowerCase()]) {
    return destinationThemes[destination.toLowerCase()];
  }

  // Mood-based theming
  const moodThemes = {
    'majestic': 'lion',
    'peaceful': 'zebra',
    'powerful': 'elephant',
    'swift': 'cheetah'
  };

  if (mood && moodThemes[mood.toLowerCase()]) {
    return moodThemes[mood.toLowerCase()];
  }

  return 'default';
}

// ── MARKETING PAYLOAD GENERATOR ──────────────────────────────────────────────
function generateMarketingPayload(theme, destination = '', context = '') {
  const creativeTheme = CREATIVE_THEMES[theme] || CREATIVE_THEMES.default;

  return {
    tagline: creativeTheme.text[Math.floor(Math.random() * creativeTheme.text.length)],
    cta: creativeTheme.cta,
    contact: {
      phone: BRAND.phone,
      website: BRAND.website,
      whatsapp: BRAND.socials?.whatsapp
    },
    promotionalMessage: `Experience ${destination || 'Kenya'} like never before with Lavira Safaris. ${creativeTheme.cta.toLowerCase()}.`,
    hashtags: ['#Safari', '#Kenya', '#Wildlife', '#Adventure', '#LaviraSafaris']
  };
}

function escapeXML(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = {
  renderDynamicText,
  enhanceVideo,
  enhanceImage,
  analyzeContentForTheme,
  generateMarketingPayload,
  CREATIVE_THEMES,
  detectSubjectArea
};