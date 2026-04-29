// engines/image-enhanced.js — Lavira Image Intelligence Engine v2
// Capabilities: search, edit, process, analyse, customize, compare, metadata, OCR, smart-crop
'use strict';
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');
const BRAND  = require('../orchestrator/brand');

// ── METADATA EXTRACTION ──────────────────────────────────────────────────────
async function extractMetadata(filePath) {
  const meta = await sharp(filePath).metadata();
  const stat = fs.statSync(filePath);
  return {
    width: meta.width, height: meta.height,
    format: meta.format, channels: meta.channels,
    hasAlpha: meta.hasAlpha, colorSpace: meta.space,
    density: meta.density, exif: meta.exif ? '[EXIF present]' : null,
    icc: meta.icc ? '[ICC profile present]' : null,
    fileSizeBytes: stat.size,
    fileSizeMB: (stat.size / 1024 / 1024).toFixed(2),
    aspectRatio: meta.width && meta.height ? `${meta.width}:${meta.height}` : null,
    isPortrait: meta.height > meta.width,
    isLandscape: meta.width > meta.height,
    isSquare: meta.width === meta.height,
    megapixels: meta.width && meta.height ? ((meta.width * meta.height) / 1e6).toFixed(1) : null,
  };
}

// ── SMART CROP (subject-aware) ────────────────────────────────────────────────
// Uses attention-based crop: finds the brightest/most-complex region and crops to it
async function smartCrop(filePath, targetW, targetH, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_smartcrop_${uuid().slice(0,6)}.jpg`);
  // Use sharp's entropy-based attention crop
  await sharp(filePath)
    .resize(targetW, targetH, { fit: 'cover', position: sharp.strategy.entropy })
    .jpeg({ quality: 92 })
    .toFile(outputPath);
  return { file: outputPath, filename: path.basename(outputPath), resolution: `${targetW}x${targetH}`,
           downloadUrl: '/outputs/' + path.basename(outputPath), method: 'entropy_smart_crop' };
}

// ── COMPARE TWO IMAGES ────────────────────────────────────────────────────────
// Returns side-by-side composite for A/B visual comparison
async function compareImages(filePathA, filePathB, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_compare_${uuid().slice(0,6)}.jpg`);
  const metaA = await sharp(filePathA).metadata();
  const metaB = await sharp(filePathB).metadata();
  const h = Math.max(metaA.height || 800, metaB.height || 800);
  const resizedA = await sharp(filePathA).resize(540, h, { fit: 'contain', background: { r:27, g:40, b:48, alpha:1 } }).toBuffer();
  const resizedB = await sharp(filePathB).resize(540, h, { fit: 'contain', background: { r:27, g:40, b:48, alpha:1 } }).toBuffer();
  // Label SVG
  const label = Buffer.from(`<svg width="1080" height="40" xmlns="http://www.w3.org/2000/svg">
    <rect width="540" height="40" fill="#2D6A4F"/><rect x="540" width="540" height="40" fill="#F4A261"/>
    <text x="270" y="28" text-anchor="middle" font-family="Arial" font-size="18" fill="white">A</text>
    <text x="810" y="28" text-anchor="middle" font-family="Arial" font-size="18" fill="#1B2830">B</text>
  </svg>`);
  await sharp({ create: { width: 1080, height: h + 40, channels: 3, background: { r:27, g:40, b:48 } } })
    .composite([
      { input: resizedA, left: 0, top: 40 },
      { input: resizedB, left: 540, top: 40 },
      { input: label, left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toFile(outputPath);
  return { file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath), layout: 'side_by_side' };
}

// ── OCR (text extraction) ─────────────────────────────────────────────────────
// Pre-processes image for OCR readability and extracts text regions via contrast analysis
async function prepareForOCR(filePath, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_ocr_ready_${uuid().slice(0,6)}.png`);
  await sharp(filePath)
    .greyscale()
    .normalise()
    .sharpen({ sigma: 1.5 })
    .threshold(128)
    .png()
    .toFile(outputPath);
  return {
    file: outputPath, filename: path.basename(outputPath),
    downloadUrl: '/outputs/' + path.basename(outputPath),
    note: 'Image pre-processed for OCR (greyscale, normalised, threshold). Feed to Tesseract or Google Vision for text extraction.',
    tesseractCmd: `tesseract ${outputPath} stdout`,
  };
}

// ── DOMINANT COLOR ANALYSIS ───────────────────────────────────────────────────
async function analyzeColors(filePath) {
  // Downsample to 50x50 and get stats
  const { data, info } = await sharp(filePath)
    .resize(50, 50, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    r += data[i]; g += data[i+1]; b += data[i+2];
  }
  r = Math.round(r / pixels); g = Math.round(g / pixels); b = Math.round(b / pixels);
  const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return {
    dominantColor: hex,
    dominantRGB: { r, g, b },
    brightness: Math.round(brightness),
    isDark: brightness < 128,
    isLight: brightness >= 128,
    recommendedTextColor: brightness < 128 ? '#FFFFFF' : '#1B2830',
    recommendedOverlayOpacity: brightness < 80 ? 0.3 : brightness < 140 ? 0.5 : 0.65,
    mood: brightness < 80 ? 'dramatic_dark' : brightness < 140 ? 'balanced' : 'bright_vibrant',
  };
}

// ── PLATFORM-SPECIFIC EXPORT ──────────────────────────────────────────────────
const PLATFORM_SPECS = {
  whatsapp:         { w: 1080, h: 1080, format: 'jpeg', quality: 85, maxKB: 5000 },
  instagram_post:   { w: 1080, h: 1080, format: 'jpeg', quality: 92 },
  instagram_story:  { w: 1080, h: 1920, format: 'jpeg', quality: 92 },
  instagram_portrait:{ w: 1080, h: 1350, format: 'jpeg', quality: 92 },
  facebook:         { w: 1280, h: 720,  format: 'jpeg', quality: 90 },
  twitter_card:     { w: 1200, h: 628,  format: 'jpeg', quality: 90 },
  tiktok_thumb:     { w: 1080, h: 1920, format: 'jpeg', quality: 88 },
  youtube_thumb:    { w: 1280, h: 720,  format: 'jpeg', quality: 92 },
  telegram:         { w: 1080, h: 1080, format: 'jpeg', quality: 85 },
};

async function exportForPlatform(filePath, platform, outputDir) {
  const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.instagram_post;
  outputDir = outputDir || cfg.OUTPUTS_DIR;
  const outName = `lavira_${platform}_${uuid().slice(0,6)}.jpg`;
  const outPath = path.join(outputDir, outName);
  fs.mkdirSync(outputDir, { recursive: true });
  let pipe = sharp(filePath).resize(spec.w, spec.h, { fit: 'cover', position: sharp.strategy.entropy });
  if (spec.format === 'jpeg') pipe = pipe.jpeg({ quality: spec.quality || 90, mozjpeg: true });
  else pipe = pipe.png({ compressionLevel: 8 });
  await pipe.toFile(outPath);
  const stat = fs.statSync(outPath);
  return {
    platform, file: outPath, filename: outName,
    resolution: `${spec.w}x${spec.h}`,
    downloadUrl: '/outputs/' + outName,
    sizeMB: (stat.size / 1024 / 1024).toFixed(2),
    sizeKB: Math.round(stat.size / 1024),
  };
}

// ── BATCH PLATFORM EXPORT ─────────────────────────────────────────────────────
async function exportAllPlatforms(filePath, platforms, outputDir) {
  platforms = platforms || Object.keys(PLATFORM_SPECS);
  const results = [];
  for (const p of platforms) {
    try { results.push(await exportForPlatform(filePath, p, outputDir)); }
    catch(e) { results.push({ platform: p, error: e.message }); }
  }
  return results;
}

// ── BRAND OVERLAY APPLICATION ─────────────────────────────────────────────────
function buildBrandOverlaySVG(w, h, opts = {}) {
  const { destination = '', hook = '', phone = BRAND.phone, website = (BRAND.website || '').replace('https://','') } = opts;
  const barH = Math.round(h * 0.055), hookH = Math.round(h * 0.10);
  const topH = Math.round(h * 0.068);
  const fs1 = Math.round(w * 0.022), fs2 = Math.round(w * 0.016), fsH = Math.round(w * 0.032);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <!-- Top brand bar -->
    <rect x="0" y="0" width="${w}" height="${topH}" fill="rgba(27,40,48,0.82)"/>
    <rect x="0" y="${topH}" width="${w}" height="3" fill="#F4A261"/>
    <text x="${Math.round(w*0.05)}" y="${Math.round(topH*0.72)}" font-family="Arial Black,Arial,sans-serif" font-size="${Math.round(topH*0.48)}" font-weight="900" fill="#F4A261">LAVIRA SAFARIS</text>
    ${destination ? `<text x="${w - Math.round(w*0.04)}" y="${Math.round(topH*0.72)}" text-anchor="end" font-family="Arial,sans-serif" font-size="${Math.round(topH*0.38)}" fill="white" opacity="0.9">${destination}</text>` : ''}
    <!-- Hook band (lower third) -->
    ${hook ? `<rect x="0" y="${Math.round(h*0.72)}" width="${w}" height="${hookH}" fill="rgba(27,40,48,0.85)"/>
    <rect x="0" y="${Math.round(h*0.72)}" width="${Math.round(w*0.004)}" height="${hookH}" fill="#F4A261"/>
    <text x="${Math.round(w*0.04)}" y="${Math.round(h*0.72) + Math.round(hookH*0.62)}" font-family="Arial,sans-serif" font-size="${fsH}" fill="white">${hook.slice(0,55)}</text>` : ''}
    <!-- Contact footer -->
    <rect x="0" y="${h - barH}" width="${w}" height="${barH}" fill="rgba(27,40,48,0.88)"/>
    <text x="${Math.round(w*0.05)}" y="${h - Math.round(barH*0.30)}" font-family="Arial,sans-serif" font-size="${fs1}" fill="#F4A261">${phone}</text>
    <text x="${w - Math.round(w*0.04)}" y="${h - Math.round(barH*0.30)}" text-anchor="end" font-family="Arial,sans-serif" font-size="${fs2}" fill="white" opacity="0.85">${website}</text>
  </svg>`);
}

async function applyBrandOverlay(filePath, opts, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_branded_${uuid().slice(0,6)}.jpg`);
  const meta = await sharp(filePath).metadata();
  const w = meta.width || 1080, h = meta.height || 1080;
  const svg = buildBrandOverlaySVG(w, h, opts);
  await sharp(filePath)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);
  return { file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath) };
}

// ── COLLAGE BUILDER ───────────────────────────────────────────────────────────
// Builds a 2×2 grid from up to 4 images
async function buildCollage(imagePaths, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_collage_${uuid().slice(0,6)}.jpg`);
  const size = 540, total = 1080;
  const paths = imagePaths.slice(0, 4);
  while (paths.length < 4) paths.push(paths[0]); // duplicate if fewer than 4
  const resized = await Promise.all(paths.map(p =>
    sharp(p).resize(size, size, { fit: 'cover', position: sharp.strategy.entropy }).toBuffer()
  ));
  await sharp({ create: { width: total, height: total, channels: 3, background: { r: 27, g: 40, b: 48 } } })
    .composite([
      { input: resized[0], left: 0, top: 0 },
      { input: resized[1], left: size, top: 0 },
      { input: resized[2], left: 0, top: size },
      { input: resized[3], left: size, top: size },
    ])
    .jpeg({ quality: 90 })
    .toFile(outputPath);
  return { file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath), layout: '2x2_grid', sourceImages: paths.length };
}

module.exports = {
  extractMetadata, smartCrop, compareImages, prepareForOCR, analyzeColors,
  exportForPlatform, exportAllPlatforms, applyBrandOverlay, buildCollage,
  PLATFORM_SPECS, buildBrandOverlaySVG,
};
