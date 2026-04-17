// engines/compositor.js — Ready-to-post branded overlay system
// Composites brand elements directly onto media: logo bar, title, promo info, contacts
'use strict';
const sharp  = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const fs     = require('fs');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');
const BRAND  = require('../orchestrator/brand');

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  green:      '#2D6A4F', greenDark: '#1B4332', amber: '#F4A261',
  white:      '#FFFFFF', dark:      '#0A1612', overlay: 'rgba(10,22,18,0.72)',
};

// ── SVG layout builder ────────────────────────────────────────────────────────
function buildOverlaySVG(w, h, opts = {}) {
  const {
    title       = BRAND.name,
    promoType   = '',       // e.g. "Safari Package", "Wildlife Spotlight"
    destination = '',
    hook        = '',
    dateStr     = '',
    phone       = BRAND.phone,
    website     = BRAND.website,
    logoText    = 'L',      // fallback text logo if no image logo
    layout      = 'standard', // 'standard' | 'story' | 'minimal'
  } = opts;

  const isStory    = (layout === 'story') || (h > w * 1.3);
  const topBarH    = Math.round(h * 0.11);
  const botBarH    = Math.round(h * 0.13);
  const logoSize   = Math.round(topBarH * 0.65);
  const logoX      = Math.round(w * 0.04);
  const logoY      = Math.round((topBarH - logoSize) / 2);
  const titleX     = logoX + logoSize + Math.round(w * 0.025);
  const titleFSize = Math.round(topBarH * 0.32);
  const subFSize   = Math.round(titleFSize * 0.62);
  const botFSize   = Math.round(botBarH * 0.26);
  const hookFSize  = Math.round(w * 0.038);

  // Hook text in middle — only if there's content and room
  const hookSection = hook ? `
    <rect x="0" y="${Math.round(h*0.42)}" width="${w}" height="${Math.round(h*0.15)}"
          fill="rgba(10,22,18,0.60)" rx="0"/>
    <text x="${w/2}" y="${Math.round(h*0.50)}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${hookFSize}" font-weight="bold"
          fill="${C.amber}">${escXML(hook.slice(0,55))}</text>
  ` : '';

  const destSection = destination ? `
    <text x="${w/2}" y="${Math.round(h*0.56)}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${Math.round(hookFSize*0.7)}"
          fill="white" opacity="0.85">📍 ${escXML(destination)}</text>
  ` : '';

  const promoSection = promoType ? `
    <rect x="${Math.round(w*0.03)}" y="${Math.round(topBarH + h*0.01)}"
          width="${Math.round(w*0.35)}" height="${Math.round(subFSize*1.6)}"
          fill="${C.amber}" rx="${Math.round(subFSize*0.4)}"/>
    <text x="${Math.round(w*0.03 + w*0.175)}"
          y="${Math.round(topBarH + h*0.01 + subFSize*1.15)}"
          text-anchor="middle" font-family="Arial,sans-serif"
          font-size="${subFSize}" font-weight="bold" fill="${C.dark}">
      ${escXML(promoType.toUpperCase())}
    </text>
  ` : '';

  const dateSection = dateStr ? `
    <text x="${w - Math.round(w*0.04)}" y="${Math.round(topBarH + subFSize*1.8)}"
          text-anchor="end" font-family="Arial,sans-serif"
          font-size="${Math.round(subFSize*0.85)}" fill="white" opacity="0.7">
      ${escXML(dateStr)}
    </text>
  ` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <!-- TOP BAR: Logo + Brand Name -->
  <rect x="0" y="0" width="${w}" height="${topBarH}" fill="rgba(10,22,18,0.85)"/>
  <!-- Circular logo bg -->
  <circle cx="${logoX + logoSize/2}" cy="${logoY + logoSize/2}" r="${logoSize/2}"
          fill="${C.amber}"/>
  <text x="${logoX + logoSize/2}" y="${logoY + logoSize/2 + titleFSize*0.38}"
        text-anchor="middle" font-family="Arial,sans-serif"
        font-size="${Math.round(titleFSize*1.1)}" font-weight="900"
        fill="${C.dark}">${logoText}</text>
  <!-- Brand name -->
  <text x="${titleX}" y="${Math.round(topBarH*0.48)}"
        font-family="Arial,sans-serif" font-size="${titleFSize}" font-weight="bold"
        fill="white">${escXML(title)}</text>
  <text x="${titleX}" y="${Math.round(topBarH*0.78)}"
        font-family="Arial,sans-serif" font-size="${subFSize}"
        fill="${C.amber}" opacity="0.9">${escXML(BRAND.tagline || 'Making Your Safari Memorable')}</text>

  ${promoSection}
  ${dateSection}
  ${hookSection}
  ${destSection}

  <!-- BOTTOM BAR: Contacts -->
  <rect x="0" y="${h - botBarH}" width="${w}" height="${botBarH}"
        fill="rgba(10,22,18,0.88)"/>
  <text x="${Math.round(w*0.05)}" y="${h - Math.round(botBarH*0.55)}"
        font-family="Arial,sans-serif" font-size="${botFSize}" font-weight="bold"
        fill="${C.amber}">📞 ${escXML(phone)}</text>
  <text x="${Math.round(w*0.05)}" y="${h - Math.round(botBarH*0.15)}"
        font-family="Arial,sans-serif" font-size="${Math.round(botFSize*0.9)}"
        fill="white" opacity="0.85">🌐 ${escXML(website)}</text>
  ${opts.email ? `<text x="${w - Math.round(w*0.05)}" y="${h - Math.round(botBarH*0.55)}"
        text-anchor="end" font-family="Arial,sans-serif" font-size="${Math.round(botFSize*0.85)}"
        fill="white" opacity="0.75">📧 ${escXML(opts.email)}</text>` : ''}
  ${opts.instagram ? `<text x="${w - Math.round(w*0.05)}" y="${h - Math.round(botBarH*0.15)}"
        text-anchor="end" font-family="Arial,sans-serif" font-size="${Math.round(botFSize*0.85)}"
        fill="${C.amber}" opacity="0.85">📸 ${escXML(opts.instagram)}</text>` : ''}
</svg>`;
}

function escXML(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Profile specifications for resizing ────────────────────────────────────────
const PROFILES = {
  instagram_post:   { w:1080, h:1080 },
  instagram_story:  { w:1080, h:1920 },
  facebook:         { w:1280, h:720  },
  twitter_card:     { w:1200, h:628  },
};

// ── Apply overlay to an image ─────────────────────────────────────────────────
async function compositeImage(inputPath, overlayOpts = {}, outputProfile = 'instagram_post') {
  const meta = await sharp(inputPath).metadata();
  const spec = PROFILES[outputProfile] || PROFILES.instagram_post;
  
  // Resize to profile dimensions if input doesn't match the expected dimensions
  // This ensures that Pexels images (940x627, etc.) are properly resized to square/standard profiles
  let w = spec.w;
  let h = spec.h;
  
  // Use sharp to resize + composite together for efficiency
  const svgBuf  = Buffer.from(buildOverlaySVG(w, h, {
    ...overlayOpts,
    email:     BRAND.email,
    instagram: BRAND.socials?.instagram,
  }));

  const outFile = path.join(cfg.OUTPUTS_DIR, `lavira_post_${outputProfile}_${uuid().slice(0,8)}.jpg`);
  await sharp(inputPath)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .composite([{ input: svgBuf, blend: 'over' }])
    .jpeg({ quality: 93 })
    .toFile(outFile);

  return { file: outFile, filename: path.basename(outFile), resolution: `${w}x${h}`,
           downloadUrl: `/outputs/${path.basename(outFile)}`, type: 'ready_to_post' };
}

// ── Apply overlay to a video (FFmpeg drawtext + overlay) ────────────────────
function compositeVideo(inputPath, overlayOpts = {}) {
  return new Promise((res, rej) => {
    const outFile = path.join(cfg.OUTPUTS_DIR, `lavira_post_vid_${uuid().slice(0,8)}.mp4`);
    const {
      title = BRAND.name, destination = '', hook = '', phone = BRAND.phone,
      website = BRAND.website, promoType = '',
    } = overlayOpts;

    // Build drawtext filters for top bar + bottom bar
    const topText    = `${title} | ${BRAND.tagline || 'Safari Experts'}`;
    const bottomText = `${phone}  •  ${website}`;
    const hookText   = hook ? hook.slice(0,50) : '';

    const filters = [
      // Top dark bar
      `drawbox=x=0:y=0:w=iw:h=ih*0.09:color=black@0.80:t=fill`,
      // Top text
      `drawtext=text='${topText.replace(/'/g,"\\'")}':fontcolor=white:fontsize=w*0.028:x=iw*0.04:y=ih*0.035:shadowcolor=black:shadowx=1:shadowy=1`,
      // Promo type badge (amber)
      promoType ? `drawtext=text='${promoType.toUpperCase()}':fontcolor=#F4A261:fontsize=w*0.022:x=iw*0.04:y=ih*0.065:shadowcolor=black:shadowx=1:shadowy=1` : null,
      // Hook overlay in middle
      hookText ? `drawbox=x=0:y=ih*0.42:w=iw:h=ih*0.13:color=black@0.65:t=fill` : null,
      hookText ? `drawtext=text='${hookText.replace(/'/g,"\\'")}':fontcolor=#F4A261:fontsize=w*0.036:fontweight=bold:x=(iw-text_w)/2:y=ih*0.47:shadowcolor=black:shadowx=2:shadowy=2` : null,
      // Destination
      destination ? `drawtext=text='${destination}':fontcolor=white:fontsize=w*0.025:x=(iw-text_w)/2:y=ih*0.555:shadowcolor=black:shadowx=1:shadowy=1` : null,
      // Bottom bar
      `drawbox=x=0:y=ih*0.89:w=iw:h=ih*0.11:color=black@0.82:t=fill`,
      `drawtext=text='${bottomText.replace(/'/g,"\\'")}':fontcolor=white:fontsize=w*0.023:x=iw*0.04:y=ih*0.935:shadowcolor=black:shadowx=1:shadowy=1`,
    ].filter(Boolean).join(',');

    ffmpeg(inputPath)
      .videoFilter(filters)
      .audioCodec('copy')
      .outputOptions(['-movflags +faststart', '-preset fast'])
      .output(outFile)
      .on('end', () => res({ file:outFile, filename:path.basename(outFile),
                             downloadUrl:`/outputs/${path.basename(outFile)}`, type:'ready_to_post_video' }))
      .on('error', rej)
      .run();
  });
}

// ── Build a full post-ready package from any processed job ───────────────────
async function buildReadyToPostPackage(jobStatePath, overlayOpts = {}) {
  const state  = JSON.parse(fs.readFileSync(jobStatePath, 'utf8'));
  const results = state.results || [];
  const promo   = state.promo  || {};

  const opts = {
    title:       BRAND.name,
    promoType:   overlayOpts.promoType || promo.relatedPackage?.name || '',
    destination: overlayOpts.destination || state.destination || '',
    hook:        overlayOpts.hook || promo.hook || '',
    dateStr:     overlayOpts.dateStr || new Date().toLocaleDateString('en-KE', { day:'numeric',month:'long',year:'numeric' }),
    ...overlayOpts,
  };

  const postReady = [];
  for (const r of results) {
    if (!r.filename) continue;
    const filePath = path.join(cfg.OUTPUTS_DIR, r.filename);
    if (!fs.existsSync(filePath)) continue;
    const ext = path.extname(r.filename).toLowerCase();
    try {
      if (['.jpg','.jpeg','.png','.webp'].includes(ext)) {
        const out = await compositeImage(filePath, opts, r.profile || 'instagram_post');
        postReady.push({ ...out, sourceFile: r.filename, platform: r.profile || r.platform });
      } else if (ext === '.mp4') {
        const out = await compositeVideo(filePath, opts);
        postReady.push({ ...out, sourceFile: r.filename, platform: r.platform });
      }
    } catch(e) { postReady.push({ error: e.message, sourceFile: r.filename }); }
  }
  return { postReady, caption: promo.caption || '', hook: promo.hook || '', destination: state.destination };
}

module.exports = { compositeImage, compositeVideo, buildReadyToPostPackage, buildOverlaySVG };
