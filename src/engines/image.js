// engines/image.js — v4: conservative processing, manual edit support, no forced tint
'use strict';
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const { v4: uuid } = require('uuid');
const cfg   = require('../config');
const BRAND = require('../orchestrator/brand');

const PROFILES = {
  instagram_post:    { w:1080, h:1080, label:'Instagram Post (1:1)'     },
  instagram_story:   { w:1080, h:1920, label:'Instagram Story (9:16)'   },
  instagram_portrait:{ w:1080, h:1350, label:'Instagram Portrait (4:5)' },
  facebook_feed:     { w:1200, h:630,  label:'Facebook Feed'            },
  facebook_story:    { w:1080, h:1920, label:'Facebook Story'           },
  twitter_card:      { w:1200, h:628,  label:'Twitter Card'             },
  youtube_thumb:     { w:1280, h:720,  label:'YouTube Thumbnail'        },
  linkedin:          { w:1200, h:627,  label:'LinkedIn Post'            },
  original:          { w:null, h:null, label:'Original Size'            },
};

// Manual edits applied before platform resize
async function applyManualEdits(sharpInstance, edits = {}) {
  let img = sharpInstance;
  // 1. Manual crop (pixel values from UI crop tool)
  if (edits.crop && edits.crop.width && edits.crop.height) {
    img = img.extract({
      left:   Math.round(edits.crop.x || 0),
      top:    Math.round(edits.crop.y || 0),
      width:  Math.round(edits.crop.width),
      height: Math.round(edits.crop.height),
    });
  }
  // 2. Rotate (degrees, 0/90/180/270 + free angle)
  if (edits.rotate && edits.rotate !== 0) {
    img = img.rotate(edits.rotate, { background: { r:0,g:0,b:0,alpha:0 } });
  }
  // 3. Flip / Mirror
  if (edits.flipH) img = img.flop();
  if (edits.flipV) img = img.flip();
  // 4. Color adjustments — conservative defaults, user controls each slider
  const hasColor = edits.brightness != null || edits.saturation != null ||
                   edits.hue != null || edits.contrast != null;
  if (hasColor) {
    img = img.modulate({
      brightness: edits.brightness != null ? edits.brightness : 1.0,  // 0.5–2.0, default 1.0
      saturation: edits.saturation != null ? edits.saturation : 1.0,  // 0–3, default 1.0
      hue:        edits.hue        != null ? edits.hue        : 0,    // -180–180, default 0
    });
    if (edits.contrast != null && edits.contrast !== 1.0) {
      // Contrast via linear function: output = contrast*(input - 128) + 128
      const c = parseFloat(edits.contrast);
      img = img.linear(c, -(128 * c - 128));
    }
  }
  // 5. Sharpen (boolean or strength 0.5–3)
  if (edits.sharpen) {
    const s = typeof edits.sharpen === 'number' ? edits.sharpen : 1;
    img = img.sharpen({ sigma: Math.min(s, 3) });
  }
  return img;
}

// Build brand watermark SVG overlay
function brandWatermark(w, h, destination = '') {
  const fontSize  = Math.round(w * 0.020);
  const barHeight = Math.round(h * 0.055);
  const website   = (BRAND.website || '').replace('https://', '').toUpperCase();
  const phone     = BRAND.phone || '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="${h - barHeight}" width="${w}" height="${barHeight}" fill="rgba(0,0,0,0.55)"/>
    <text x="${w/2}" y="${h - barHeight*0.52}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold"
          fill="white" opacity="0.92">${website} • ${phone}</text>
    ${destination ? `<text x="${w/2}" y="${h - barHeight*0.15}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${Math.round(fontSize*0.8)}"
          fill="#F4A261" opacity="0.9">${destination}</text>` : ''}
  </svg>`);
}

async function processImage(inputPath, profiles = ['instagram_post'], opts = {}) {
  const results = [], errors = [];
  const meta = await sharp(inputPath).metadata().catch(() => ({}));

  for (const p of profiles) {
    const spec = PROFILES[p];
    if (!spec) { errors.push({ profile:p, error:'unknown profile' }); continue; }
    try {
      const outFile = path.join(cfg.OUTPUTS_DIR, `lavira_${p}_${uuid().slice(0,8)}.jpg`);
      // Start with manual edits on original
      let img = await applyManualEdits(sharp(inputPath), opts.edits || {});

      // Platform resize — default fit:'contain' (no cropping) unless user chose cover
      if (spec.w && spec.h) {
        const fitMode = opts.fit || 'contain'; // 'contain' preserves full image, adds letterbox
        img = img.resize(spec.w, spec.h, {
          fit: fitMode,
          position: opts.position || 'centre',
          background: { r:27, g:40, b:48, alpha:1 }, // brand dark as letterbox
        });
      }

      // Brand watermark — light, bottom bar only, no colour tint unless opted-in
      if (opts.watermark !== false) {
        const finalMeta = await img.clone().metadata();
        const fw = spec.w || finalMeta.width || 1080;
        const fh = spec.h || finalMeta.height || 1080;
        const wm = brandWatermark(fw, fh, opts.destination || '');
        img = img.composite([{ input: wm, blend: 'over' }]);
      }

      // Optional very-light brand tint only if explicitly requested
      if (opts.brandTint === true) {
        img = img.modulate({ saturation: 1.08, brightness: 1.01 });
      }

      await img.jpeg({ quality: opts.quality || 92, mozjpeg: true }).toFile(outFile);
      results.push({
        profile: p, label: spec.label, file: outFile,
        filename: path.basename(outFile),
        resolution: spec.w ? `${spec.w}x${spec.h}` : `${meta.width}x${meta.height}`,
        downloadUrl: `/outputs/${path.basename(outFile)}`
      });
    } catch(e) { errors.push({ profile:p, error:e.message }); }
  }
  return { results, errors };
}

async function getImageInfo(filePath) {
  const meta = await sharp(filePath).metadata();
  return { width:meta.width, height:meta.height, format:meta.format, size:meta.size,
           hasAlpha:meta.hasAlpha, space:meta.space };
}

module.exports = { processImage, applyManualEdits, getImageInfo, PROFILES };
