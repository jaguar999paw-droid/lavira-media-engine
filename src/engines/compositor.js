// engines/compositor.js — Lavira branded overlay system v2
// Fixes: real logo PNG, lower-third hook (hero clear), w-relative fonts,
//        correct brand dark #1B2830, heading variants, sane opacity, dual output dirs.
'use strict';
const sharp  = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');
const BRAND  = require('../orchestrator/brand');
const { getLogoPNG } = require('./logo-loader');

// ── Brand palette (exact brand spec) ─────────────────────────────────────
const C = {
  green:      '#2D6A4F',
  greenDark:  '#1B4332',
  amber:      '#F4A261',
  amberDark:  '#E07A2F',
  white:      '#FFFFFF',
  dark:       '#1B2830',   // ← corrected from #0A1612
  cream:      '#F9F5F0',
};

// ── Heading variant helpers ───────────────────────────────────────────────
const USP_POOL = [
  'Expert Safari Guides',
  'Big Five Guaranteed',
  'Lifelong Memories Made',
  'Custom-Built Open Vehicles',
  'Personalized Itineraries',
  'Safe · Comfortable · Wild',
  'Sustainable Safari Tourism',
  'Nairobi to the Bush, Handled',
];
function pickUSP() { return USP_POOL[Math.floor(Date.now() / 3600000) % USP_POOL.length]; }

// headingStyle: 'brand' | 'destination' | 'package' | 'usp'
function resolveHeading(opts) {
  const style = opts.headingStyle || 'brand';
  switch (style) {
    case 'destination':
      return {
        line1: opts.destination ? opts.destination.toUpperCase() : BRAND.name,
        line2: 'by Lavira Safaris',
      };
    case 'package':
      return {
        line1: opts.packageName ? opts.packageName : BRAND.name,
        line2: opts.packageDuration ? `${opts.packageDuration} • Lavira Safaris` : BRAND.tagline,
      };
    case 'usp':
      return { line1: BRAND.name, line2: pickUSP() };
    default: // 'brand'
      return { line1: BRAND.name, line2: BRAND.tagline || 'Making Your Safari Memorable' };
  }
}

// ── XML escape ────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── SVG overlay builder ───────────────────────────────────────────────────
// Logo is composited separately as a PNG layer — SVG only handles text/bars.
// Layout (all % of h or w):
//   Top bar      0   – 10%    brand name + destination chip
//   Promo badge  10% – 14%    optional, top-left, small
//   HERO CLEAR   14% – 72%    ← nothing here; wildlife breathes
//   Hook band    72% – 82%    hook text + destination, lower-third
//   Gap          82% – 87%
//   Contact bar  87% – 100%   phone + website + optional Instagram
function buildOverlaySVG(w, h, opts = {}) {
  const {
    promoType   = '',
    destination = '',
    hook        = '',
    phone       = BRAND.phone,
    website     = BRAND.website,
    layout      = 'standard',
  } = opts;

  const heading = resolveHeading(opts);

  // Opacity by layout
  const topAlpha = layout === 'minimal' ? 0.65 : layout === 'story' ? 0.80 : 0.80;
  const botAlpha = layout === 'minimal' ? 0.65 : layout === 'story' ? 0.82 : 0.82;

  // Dimensions — all w-relative for consistent ratios across profiles
  const topBarH  = Math.round(h * 0.10);
  const botBarH  = Math.round(h * 0.13);
  const logoGap  = Math.round(w * 0.028);  // gap after logo image
  // Logo itself is composited externally; leave space: logoSize = topBarH * 0.70
  const logoSize = Math.round(topBarH * 0.70);
  const textX    = Math.round(w * 0.04) + logoSize + logoGap;

  // w-relative font sizes (consistent across all PROFILES)
  const brandFS  = Math.round(w * 0.034);   // brand name
  const tagFS    = Math.round(w * 0.020);   // tagline / USP
  const hookFS   = Math.round(w * 0.040);   // hook headline
  const destFS   = Math.round(w * 0.022);   // destination in hook band
  const contactFS= Math.round(w * 0.024);   // contact bar
  const badgeFS  = Math.round(w * 0.018);   // promo badge

  // Top bar
  const topBar = `
    <rect x="0" y="0" width="${w}" height="${topBarH}"
          fill="${C.dark}" opacity="${topAlpha}"/>
    <rect x="0" y="${topBarH - 2}" width="${w}" height="2"
          fill="${C.amber}" opacity="0.7"/>
    <text x="${textX}" y="${Math.round(topBarH * 0.50)}"
          dominant-baseline="middle"
          font-family="Arial Black,Arial,sans-serif" font-size="${brandFS}"
          font-weight="900" fill="${C.white}">${esc(heading.line1)}</text>
    <text x="${textX}" y="${Math.round(topBarH * 0.82)}"
          font-family="Arial,sans-serif" font-size="${tagFS}"
          fill="${C.amber}" opacity="0.92">${esc(heading.line2)}</text>`;

  // Destination chip — top-right of top bar (replaces clashing dateSection)
  const destChip = (destination && opts.headingStyle !== 'destination') ? `
    <rect x="${w - Math.round(w * 0.32)}" y="${Math.round(topBarH * 0.18)}"
          width="${Math.round(w * 0.28)}" height="${Math.round(topBarH * 0.60)}"
          rx="${Math.round(topBarH * 0.12)}"
          fill="${C.amber}" opacity="0.18"/>
    <text x="${w - Math.round(w * 0.18)}" y="${Math.round(topBarH * 0.54)}"
          dominant-baseline="middle" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${tagFS}" font-weight="bold"
          fill="${C.amber}" opacity="0.95">📍 ${esc(destination)}</text>` : '';

  // Promo badge — just below top bar, left-aligned, small
  const promoBadge = promoType ? `
    <rect x="${Math.round(w * 0.03)}" y="${topBarH + Math.round(h * 0.012)}"
          width="${Math.round(w * 0.28)}" height="${Math.round(h * 0.038)}"
          rx="${Math.round(h * 0.010)}" fill="${C.amber}"/>
    <text x="${Math.round(w * 0.03 + w * 0.14)}"
          y="${topBarH + Math.round(h * 0.012) + Math.round(h * 0.025)}"
          dominant-baseline="middle" text-anchor="middle"
          font-family="Arial Black,Arial,sans-serif" font-size="${badgeFS}"
          font-weight="900" fill="${C.dark}">${esc(promoType.toUpperCase())}</text>` : '';

  // Hook band — lower third (72%–82%), CLEAR of hero subject
  const hookBandY  = Math.round(h * 0.72);
  const hookBandH  = Math.round(h * 0.10);
  const hookTrimH  = hook && destination ? hookBandH + Math.round(h * 0.035) : hookBandH;

  const hookBand = hook ? `
    <rect x="0" y="${hookBandY}" width="${w}" height="${hookTrimH}"
          fill="${C.dark}" opacity="0.62"/>
    <rect x="0" y="${hookBandY}" width="${Math.round(w * 0.004)}" height="${hookTrimH}"
          fill="${C.amber}"/>
    <text x="${Math.round(w * 0.045)}" y="${hookBandY + Math.round(hookBandH * 0.60)}"
          dominant-baseline="middle"
          font-family="Arial Black,Arial,sans-serif" font-size="${hookFS}"
          font-weight="900" fill="${C.amber}">${esc(hook.slice(0, 52))}</text>
    ${destination ? `<text x="${Math.round(w * 0.045)}"
          y="${hookBandY + hookBandH + Math.round(h * 0.022)}"
          dominant-baseline="middle"
          font-family="Arial,sans-serif" font-size="${destFS}"
          fill="${C.white}" opacity="0.80">📍 ${esc(destination)}</text>` : ''}` : '';

  // Contact bar — bottom
  const botY = h - botBarH;
  const contactBar = `
    <rect x="0" y="${botY}" width="${w}" height="${botBarH}"
          fill="${C.dark}" opacity="${botAlpha}"/>
    <rect x="0" y="${botY}" width="${w}" height="2"
          fill="${C.amber}" opacity="0.55"/>
    <text x="${Math.round(w * 0.05)}" y="${botY + Math.round(botBarH * 0.42)}"
          dominant-baseline="middle"
          font-family="Arial,sans-serif" font-size="${contactFS}" font-weight="bold"
          fill="${C.amber}">📞 ${esc(phone)}</text>
    <text x="${Math.round(w * 0.05)}" y="${botY + Math.round(botBarH * 0.78)}"
          dominant-baseline="middle"
          font-family="Arial,sans-serif" font-size="${Math.round(contactFS * 0.88)}"
          fill="${C.white}" opacity="0.82">🌐 ${esc((website || '').replace('https://', ''))}</text>
    ${opts.instagram ? `
    <text x="${w - Math.round(w * 0.05)}" y="${botY + Math.round(botBarH * 0.60)}"
          dominant-baseline="middle" text-anchor="end"
          font-family="Arial,sans-serif" font-size="${Math.round(contactFS * 0.85)}"
          fill="${C.amber}" opacity="0.88">📸 ${esc(opts.instagram)}</text>` : ''}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  ${topBar}
  ${destChip}
  ${promoBadge}
  ${hookBand}
  ${contactBar}
</svg>`;
}

// ── Output directory resolver ─────────────────────────────────────────────
function resolveOutDir(source) {
  if (source === 'mcp') return cfg.MCP_OUTPUTS_DIR || path.join(cfg.OUTPUTS_DIR, 'mcp');
  if (source === 'ui')  return cfg.UI_OUTPUTS_DIR  || path.join(cfg.OUTPUTS_DIR, 'ui');
  return cfg.OUTPUTS_DIR;
}

// ── Profile specifications ────────────────────────────────────────────────
const PROFILES = {
  instagram_post:      { w:1080, h:1080 },
  instagram_story:     { w:1080, h:1920 },
  instagram_portrait:  { w:1080, h:1350 },
  facebook:            { w:1280, h:720  },
  twitter_card:        { w:1200, h:628  },
  tiktok:              { w:1080, h:1920 },
  youtube_thumb:       { w:1280, h:720  },
};

// ── Composite image ───────────────────────────────────────────────────────
async function compositeImage(inputPath, overlayOpts = {}, outputProfile = 'instagram_post') {
  const spec   = PROFILES[outputProfile] || PROFILES.instagram_post;
  const { w, h } = spec;
  const outDir = resolveOutDir(overlayOpts.source);
  fs.mkdirSync(outDir, { recursive: true });

  const opts = {
    ...overlayOpts,
    instagram: BRAND.socials?.instagram,
  };

  // Layer 1: base image resized to profile
  // Layer 2: SVG overlay (text bars, hook band)
  // Layer 3: real logo PNG top-left
  const svgBuf = Buffer.from(buildOverlaySVG(w, h, opts));

  // Logo sizing: fit inside top bar height with padding
  const topBarH   = Math.round(h * 0.10);
  const logoSize  = Math.round(topBarH * 0.70);
  const logoPadX  = Math.round(w * 0.030);
  const logoPadY  = Math.round((topBarH - logoSize) / 2);

  let logoPNG = null;
  try {
    logoPNG = await getLogoPNG(logoSize);
  } catch (e) {
    console.warn('[compositor] Logo unavailable, skipping:', e.message);
  }

  const layers = [{ input: svgBuf, blend: 'over' }];
  if (logoPNG) {
    layers.push({ input: logoPNG, blend: 'over', left: logoPadX, top: logoPadY });
  }

  const outFile = path.join(outDir, `lavira_post_${outputProfile}_${uuid().slice(0,8)}.jpg`);
  await sharp(inputPath)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .composite(layers)
    .jpeg({ quality: 93 })
    .toFile(outFile);

  const urlPath = outDir.includes('/mcp') ? `/outputs/mcp/${path.basename(outFile)}`
                : outDir.includes('/ui')  ? `/outputs/ui/${path.basename(outFile)}`
                : `/outputs/${path.basename(outFile)}`;

  return {
    file: outFile, filename: path.basename(outFile),
    resolution: `${w}x${h}`, downloadUrl: urlPath, type: 'ready_to_post',
  };
}

// ── Composite video (FFmpeg) ──────────────────────────────────────────────
async function compositeVideo(inputPath, overlayOpts = {}) {
  return new Promise(async (res, rej) => {
    const outDir = resolveOutDir(overlayOpts.source);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `lavira_post_vid_${uuid().slice(0,8)}.mp4`);

    const {
      title       = BRAND.name,
      destination = '',
      hook        = '',
      phone       = BRAND.phone,
      website     = BRAND.website,
      promoType   = '',
      headingStyle = 'brand',
    } = overlayOpts;

    const heading  = resolveHeading({ ...overlayOpts, headingStyle });
    const topText  = heading.line1;
    const tagText  = heading.line2;
    const botText  = `${phone}  •  ${(website||'').replace('https://','')}`;
    const hookText = hook ? hook.slice(0, 50) : '';

    // Safe escape for drawtext (escape single quotes and backslashes)
    const dte = s => String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/:/g,'\\:');

    // Soft bottom bar for logo space (top-left); real logo overlaid via input stream
    const filters = [
      // Top dark bar
      `drawbox=x=0:y=0:w=iw:h=ih*0.10:color=0x1B2830@0.80:t=fill`,
      // Amber accent line
      `drawbox=x=0:y=ih*0.10-2:w=iw:h=2:color=0xF4A261@0.70:t=fill`,
      // Brand name (w-relative font)
      `drawtext=text='${dte(topText)}':fontcolor=white:fontsize=w*0.034:fontweight=bold:x=iw*0.155:y=ih*0.032:shadowcolor=black@0.5:shadowx=1:shadowy=1`,
      // Tagline
      `drawtext=text='${dte(tagText)}':fontcolor=#F4A261:fontsize=w*0.020:x=iw*0.155:y=ih*0.068:shadowcolor=black@0.4:shadowx=1:shadowy=1`,
      // Destination chip right-side top bar
      destination ? `drawtext=text='📍 ${dte(destination)}':fontcolor=#F4A261:fontsize=w*0.019:x=iw*0.68:y=ih*0.045:shadowcolor=black@0.4:shadowx=1:shadowy=1` : null,
      // Promo badge
      promoType ? `drawtext=text='${dte(promoType.toUpperCase())}':fontcolor=#1B2830:fontsize=w*0.018:fontweight=bold:x=iw*0.03:y=ih*0.115:box=1:boxcolor=#F4A261:boxborderw=10` : null,
      // Hook band — lower third (72%–82%), not center
      hookText ? `drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.10:color=0x1B2830@0.62:t=fill` : null,
      hookText ? `drawbox=x=0:y=ih*0.72:w=4:h=ih*0.10:color=0xF4A261@1.0:t=fill` : null,
      hookText ? `drawtext=text='${dte(hookText)}':fontcolor=#F4A261:fontsize=w*0.038:fontweight=bold:x=iw*0.045:y=ih*0.750:box=1:boxcolor=black@0.35:boxborderw=8:shadowx=1:shadowy=1` : null,
      // Destination in hook band
      hookText && destination ? `drawtext=text='📍 ${dte(destination)}':fontcolor=white@0.80:fontsize=w*0.022:x=iw*0.045:y=ih*0.800:shadowx=1:shadowy=1` : null,
      // Bottom contact bar
      `drawbox=x=0:y=ih*0.87:w=iw:h=ih*0.13:color=0x1B2830@0.82:t=fill`,
      `drawbox=x=0:y=ih*0.87:w=iw:h=2:color=0xF4A261@0.55:t=fill`,
      `drawtext=text='📞 ${dte(phone)}':fontcolor=#F4A261:fontsize=w*0.024:fontweight=bold:x=iw*0.05:y=ih*0.907:shadowx=1:shadowy=1`,
      `drawtext=text='🌐 ${dte((website||'').replace('https://',''))}':fontcolor=white@0.82:fontsize=w*0.021:x=iw*0.05:y=ih*0.942:shadowx=1:shadowy=1`,
    ].filter(Boolean);

    // Try to get logo PNG and write to temp file for ffmpeg overlay
    let logoTmp = null;
    try {
      const logoPNG = await getLogoPNG(Math.round(80));
      logoTmp = path.join(os.tmpdir(), `lavira_logo_${uuid().slice(0,6)}.png`);
      fs.writeFileSync(logoTmp, logoPNG);
    } catch (_) {}

    const cmd = ffmpeg(inputPath);
    if (logoTmp) cmd.input(logoTmp);

    const vf = filters.join(',');
    if (logoTmp) {
      // Overlay logo PNG top-left inside top bar
      cmd.complexFilter([
        `[0:v]${vf}[base]`,
        `[base][1:v]overlay=x=iw*0.025:y=ih*0.015:shortest=1[out]`,
      ], 'out');
    } else {
      cmd.videoFilter(vf);
    }

    cmd
      .audioCodec('copy')
      .outputOptions(['-movflags +faststart', '-preset fast'])
      .output(outFile)
      .on('end', () => {
        if (logoTmp) try { fs.unlinkSync(logoTmp); } catch(_) {}
        const urlPath = outDir.includes('/mcp') ? `/outputs/mcp/${path.basename(outFile)}`
                      : outDir.includes('/ui')  ? `/outputs/ui/${path.basename(outFile)}`
                      : `/outputs/${path.basename(outFile)}`;
        res({ file:outFile, filename:path.basename(outFile), downloadUrl:urlPath, type:'ready_to_post_video' });
      })
      .on('error', e => {
        if (logoTmp) try { fs.unlinkSync(logoTmp); } catch(_) {}
        rej(e);
      })
      .run();
  });
}

// ── Build full ready-to-post package ─────────────────────────────────────
async function buildReadyToPostPackage(jobStatePath, overlayOpts = {}) {
  const state   = JSON.parse(fs.readFileSync(jobStatePath, 'utf8'));
  const results = state.results || [];
  const promo   = state.promo   || {};

  const opts = {
    title:        BRAND.name,
    promoType:    overlayOpts.promoType   || promo.relatedPackage?.name || '',
    destination:  overlayOpts.destination || state.destination || '',
    hook:         overlayOpts.hook        || promo.hook || '',
    headingStyle: overlayOpts.headingStyle || 'brand',
    packageName:  overlayOpts.packageName  || promo.relatedPackage?.name || '',
    packageDuration: overlayOpts.packageDuration || promo.relatedPackage?.duration || '',
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
