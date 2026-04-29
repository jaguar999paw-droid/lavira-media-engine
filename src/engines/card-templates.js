const { getLogoPNG } = require('./logo-loader');
// src/engines/card-templates.js -- Lavira Card Template Engine v4 (Visual Intelligence Edition)
// Randomized layouts, dynamic colors, smart z-indexing, proper font scaling
// 3 Families × 10 Templates — each render is visually unique
'use strict';
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');
const BRAND  = require('../orchestrator/brand');
const { analyseImage, zoneToCoords, getDefaultAnalysis } = require('./image-vision');
const { resolvePostData } = require('./post-defaults');

// ── BRAND PALETTE SYSTEM ──────────────────────────────────────────────────────
// Multiple palette sets — one is picked randomly each render for visual variety
const PALETTES = [
  { // Forest Gold (original)
    primary:'#2D6A4F', primaryDark:'#1B4332', primaryLight:'#40916C',
    accent:'#F4A261',  accentDark:'#E07A2F',  accentLight:'#D4840A',
    dark:'#1B2830',    dark2:'#0F1C17',
    light:'#F5E6C8',   cream:'#FEF9EF',
    mid:'#9fd3aa',     dim:'#6B8F71',
  },
  { // Amber Dusk
    primary:'#6B4226',  primaryDark:'#3E1F0D', primaryLight:'#9C6644',
    accent:'#E9C46A',   accentDark:'#F4A261',  accentLight:'#B87D0A',
    dark:'#1A1208',     dark2:'#100C05',
    light:'#EFD9A8',    cream:'#FFF3D4',
    mid:'#D4A96A',      dim:'#8B6E4E',
  },
  { // Savannah Blue
    primary:'#1D3557',  primaryDark:'#0D1B2A', primaryLight:'#457B9D',
    accent:'#E63946',   accentDark:'#C1121F',  accentLight:'#C23850',
    dark:'#0D1B2A',     dark2:'#06101A',
    light:'#D8EDD5',    cream:'#F8FFF8',
    mid:'#A8DADC',      dim:'#457B9D',
  },
  { // Night Safari
    primary:'#4A1942',  primaryDark:'#2D0E28', primaryLight:'#7B2D74',
    accent:'#F2C14E',   accentDark:'#C8982A',  accentLight:'#B88020',
    dark:'#120D11',     dark2:'#0A070A',
    light:'#EFD8A5',    cream:'#FDF5E0',
    mid:'#D4A8D0',      dim:'#8B5E88',
  },
  { // Earth Rust
    primary:'#8B4513',  primaryDark:'#5C2D09', primaryLight:'#CD853F',
    accent:'#90EE90',   accentDark:'#3CB371',  accentLight:'#2E8B57',
    dark:'#1C0F08',     dark2:'#110A05',
    light:'#F0DEB8',    cream:'#FFF5E0',
    mid:'#C2A07A',      dim:'#8B6347',
  },
];

// Font stacks — randomized per render
const FONT_STACKS = [
  '"Arial Black",Arial,sans-serif',
  '"Georgia",serif',
  '"Impact",Haettenschweiler,sans-serif',
  '"Trebuchet MS",sans-serif',
  '"Arial Black",Impact,sans-serif',
];
const BODY_FONTS = [
  'Arial,sans-serif',
  '"Verdana",Geneva,sans-serif',
  '"Trebuchet MS",sans-serif',
  'Georgia,serif',
  '"Lucida Sans Unicode",sans-serif',
];

// Decoration styles
const DECORATION_STYLES = ['underline','line-through','none','none','none']; // weighted towards none
const TEXT_TRANSFORMS = ['uppercase','capitalize','none','none'];

// ── RANDOM HELPERS ────────────────────────────────────────────────────────────
function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rndFloat(min, max) { return Math.random() * (max - min) + min; }
function chance(p) { return Math.random() < p; } // p = 0..1

// Pick a session palette (changes per render)
function getPalette() { return rnd(PALETTES); }
function getHeadFont() { return rnd(FONT_STACKS); }
function getBodyFont() { return rnd(BODY_FONTS); }

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function wrap(text, max) {
  const ws = String(text||'').split(' '), ls = []; let l = '';
  for (const w of ws) {
    if ((l+' '+w).trim().length > max) { if(l) ls.push(l.trim()); l=w; }
    else l = (l+' '+w).trim();
  }
  if (l) ls.push(l.trim()); return ls;
}

// ── DYNAMIC GRADIENT SYSTEM ───────────────────────────────────────────────────
function makeGrad(w, h, C, opts) {
  opts = opts || {};
  const id     = 'g' + uuid().slice(0,6);
  const angle  = opts.angle || rnd(['0,0,0,1','1,0,0,0','1,1,0,0','0,1,1,0']);
  const str    = opts.strength != null ? opts.strength : rndFloat(0.70, 0.92);
  const color  = opts.color || C.dark2;
  // Parse angle into x1,y1,x2,y2
  const [x1,y1,x2,y2] = angle.split(',').map(Number);
  const midStop = Math.round(rndFloat(0.35, 0.60) * 100);
  return `<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
    <stop offset="0%" stop-color="${color}" stop-opacity="0"/>
    <stop offset="${midStop}%" stop-color="${color}" stop-opacity="${(str*0.4).toFixed(2)}"/>
    <stop offset="100%" stop-color="${color}" stop-opacity="${str.toFixed(2)}"/>
  </linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
}

// Noise/texture overlay (subtle grain effect)
function noiseTex(w, h, opacity) {
  opacity = opacity || rndFloat(0.02, 0.04);
  const id = 'n'+uuid().slice(0,4);
  return `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="${rndFloat(0.65,0.85).toFixed(2)}" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="multiply"/></filter><rect width="${w}" height="${h}" filter="url(#${id})" opacity="${opacity.toFixed(2)}"/>`;
}
// ── Real Lavira Logo as base64 data URI (embedded in SVG <image>) ──────────
let _cachedLogoB64 = null;
function getLogoDataURI(sizePx) {
  // Returns a promise resolving to a base64 PNG data URI, or null on failure
  return getLogoPNG(sizePx || 80).then(buf => {
    const b64 = buf.toString('base64');
    return 'data:image/png;base64,' + b64;
  }).catch(() => null);
}

// Synchronous cache-aware wrapper (call after warmup)
function logoSVGImage(x, y, size, uri) {
  if (!uri) return '';
  return '<image href="' + uri + '" x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" preserveAspectRatio="xMidYMid meet"/>';
}



// ── SMART FONT SIZING ─────────────────────────────────────────────────────────
// Scales font size based on canvas dimensions AND text length (prevents overflow)
function smartFont(w, baseFraction, textLen, maxLen) {
  maxLen = maxLen || 20;
  const base = Math.round(w * baseFraction);
  if (!textLen || textLen <= maxLen) return base;
  const scale = Math.max(0.60, maxLen / textLen);
  return Math.max(Math.round(base * scale), Math.round(base * 0.55));
}

// ── LAYOUT ZONES ─────────────────────────────────────────────────────────────
// Returns randomized safe-zone y positions for text blocks
function getLayoutZone(h, safeTextZone) {
  const zones = {
    top_left:     { y: rndFloat(0.08, 0.18), anchor: 'left'   },
    top_center:   { y: rndFloat(0.08, 0.18), anchor: 'middle' },
    center:       { y: rndFloat(0.38, 0.52), anchor: 'middle' },
    bottom_left:  { y: rndFloat(0.60, 0.72), anchor: 'left'   },
    bottom_center:{ y: rndFloat(0.60, 0.72), anchor: 'middle' },
    bottom_right: { y: rndFloat(0.60, 0.72), anchor: 'right'  },
  };
  const key = safeTextZone && zones[safeTextZone] ? safeTextZone : rnd(Object.keys(zones));
  return { y: Math.round(h * zones[key].y), anchor: zones[key].anchor };
}

// ── BRAND MARK VARIANTS ───────────────────────────────────────────────────────
const BN = BRAND.name    || 'Lavira Safaris';
const PH = BRAND.phone   || '+254 721 757 387';
const WB = (BRAND.website || 'https://lavirasafaris.com').replace('https://','');
const IG = (BRAND.socials && BRAND.socials.instagram) || '@lavirasafaris';

function brandBadge(w, h, C, headFont) {
  const style = rndInt(1, 4);
  const r  = Math.round(h * 0.022);
  const px = Math.round(w * 0.04);
  const py = Math.round(h * 0.025);

  if (style === 1) {
    // Pill with dot
    const pillW = Math.round(w * 0.42);
    const pillH = r * 2 + Math.round(r * 0.5);
    const cx = px + r, cy = py + r;
    return `<rect x="${px}" y="${py}" width="${pillW}" height="${pillH}" rx="${r}" fill="${C.dark}" opacity="0.72"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.accent}"/>
    <text x="${cx}" y="${cy + Math.round(r*0.38)}" text-anchor="middle" font-family="${headFont}" font-size="${Math.round(r*1.1)}" font-weight="900" fill="${C.dark}">L</text>
    <text x="${cx+r+Math.round(w*0.014)}" y="${cy + Math.round(r*0.38)}" font-family="${headFont}" font-size="${Math.round(r*0.82)}" font-weight="900" fill="${C.light}" letter-spacing="0.5">${esc(BN)}</text>`;
  } else if (style === 2) {
    // Corner block
    const bw = Math.round(w * 0.38), bh = Math.round(h * 0.055);
    const fs  = Math.round(bh * 0.48);
    return `<rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="0" fill="${C.accent}"/>
    <text x="${px + Math.round(bw*0.06)}" y="${py + Math.round(bh*0.70)}" font-family="${headFont}" font-size="${fs}" font-weight="900" fill="${C.dark}">${esc(BN.toUpperCase())}</text>`;
  } else if (style === 3) {
    // Minimal text only
    const fs = Math.round(w * 0.026);
    return `<text x="${px}" y="${py + fs}" font-family="${headFont}" font-size="${fs}" font-weight="900" fill="${C.accent}" opacity="0.92" letter-spacing="2">${esc(BN.toUpperCase())}</text>
    <line x1="${px}" y1="${py + fs + 4}" x2="${px + Math.round(w * 0.28)}" y2="${py + fs + 4}" stroke="${C.accent}" stroke-width="2"/>`;
  } else {
    // Circle mark
    const cx = px + r + 2, cy = py + r + 2;
    const fs  = Math.round(r * 0.85);
    return `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="${C.accent}"/>
    <text x="${cx}" y="${cy + Math.round(r*0.4)}" text-anchor="middle" font-family="${headFont}" font-size="${Math.round(r*1.2)}" font-weight="900" fill="${C.dark}">L</text>
    <text x="${cx + r + Math.round(w*0.016)}" y="${cy + Math.round(r*0.4)}" font-family="${headFont}" font-size="${fs}" font-weight="900" fill="${C.light}">${esc(BN)}</text>`;
  }
}

function contactFooter(w, h, C, bodyFont) {
  const style = rndInt(1, 3);
  const sh = Math.round(h * 0.048);
  const y  = h - sh;
  const fs = Math.round(sh * 0.48);

  if (style === 1) {
    // Dark strip with amber phone
    return `<rect x="0" y="${y}" width="${w}" height="${sh}" fill="${C.dark}" opacity="0.82"/>
    <rect x="0" y="${y}" width="${Math.round(w * 0.003)}" height="${sh}" fill="${C.accent}"/>
    <text x="${Math.round(w*0.04)}" y="${y + Math.round(sh*0.70)}" font-family="${bodyFont}" font-size="${fs}" fill="${C.accent}">${esc(PH)}</text>
    <text x="${w - Math.round(w*0.04)}" y="${y + Math.round(sh*0.70)}" text-anchor="end" font-family="${bodyFont}" font-size="${fs}" fill="${C.light}" opacity="0.78">${esc(WB)}</text>`;
  } else if (style === 2) {
    // Accent strip
    return `<rect x="0" y="${y}" width="${w}" height="${sh}" fill="${C.accent}"/>
    <text x="${Math.round(w*0.04)}" y="${y + Math.round(sh*0.70)}" font-family="${bodyFont}" font-size="${fs}" font-weight="bold" fill="${C.dark}">${esc(PH)}</text>
    <text x="${w - Math.round(w*0.04)}" y="${y + Math.round(sh*0.70)}" text-anchor="end" font-family="${bodyFont}" font-size="${fs}" fill="${C.dark}">${esc(WB)}</text>`;
  } else {
    // Capsule pill centered
    const pw = Math.round(w * 0.82), ph2 = Math.round(sh * 1.4);
    const px = Math.round((w - pw) / 2), py2 = h - ph2 - Math.round(h * 0.018);
    return `<rect x="${px}" y="${py2}" width="${pw}" height="${ph2}" rx="${Math.round(ph2 * 0.5)}" fill="${C.dark}" opacity="0.78"/>
    <text x="${w/2}" y="${py2 + Math.round(ph2 * 0.65)}" text-anchor="middle" font-family="${bodyFont}" font-size="${fs}" fill="${C.accent}">${esc(PH)}  ·  ${esc(WB)}  ·  ${esc(IG)}</text>`;
  }
}

function ctaButton(w, h, C, headFont, label) {
  label = label || 'BOOK YOUR SAFARI';
  const bh = Math.round(h * 0.10);
  const y  = h - bh;
  const fs1 = Math.round(bh * 0.30);
  const fs2 = Math.round(bh * 0.20);
  const style = rndInt(1, 3);

  if (style === 1) {
    return `<rect x="0" y="${y}" width="${w}" height="${bh}" fill="${C.primary}"/>
    <text x="${w/2}" y="${y + Math.round(bh*0.42)}" text-anchor="middle" font-family="${headFont}" font-size="${fs1}" font-weight="900" fill="${C.light}">${esc(label)}</text>
    <text x="${w/2}" y="${y + Math.round(bh*0.74)}" text-anchor="middle" font-family="${bodyFont||'Arial,sans-serif'}" font-size="${fs2}" fill="${C.cream}">WhatsApp ${esc(PH)}</text>`;
  } else if (style === 2) {
    // Angled slash accent
    return `<rect x="0" y="${y}" width="${w}" height="${bh}" fill="${C.accent}"/>
    <polygon points="${Math.round(w*0.42)},${y} ${Math.round(w*0.48)},${y} ${Math.round(w*0.44)},${y+bh} ${Math.round(w*0.38)},${y+bh}" fill="${C.accentDark}" opacity="0.35"/>
    <text x="${w/2}" y="${y + Math.round(bh*0.42)}" text-anchor="middle" font-family="${headFont}" font-size="${fs1}" font-weight="900" fill="${C.dark}">${esc(label)}</text>
    <text x="${w/2}" y="${y + Math.round(bh*0.74)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs2}" fill="${C.dark}" opacity="0.80">WhatsApp ${esc(PH)}</text>`;
  } else {
    // Split: dark | accent
    const half = Math.round(w * 0.5);
    return `<rect x="0" y="${y}" width="${half}" height="${bh}" fill="${C.dark}"/>
    <rect x="${half}" y="${y}" width="${w - half}" height="${bh}" fill="${C.accent}"/>
    <text x="${Math.round(half*0.5)}" y="${y + Math.round(bh*0.58)}" text-anchor="middle" font-family="${headFont}" font-size="${Math.round(fs1*0.82)}" font-weight="900" fill="${C.light}">${esc(label)}</text>
    <text x="${half + Math.round((w-half)*0.5)}" y="${y + Math.round(bh*0.58)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(fs2*1.1)}" fill="${C.dark}" font-weight="bold">${esc(PH)}</text>`;
  }
}

// ── SIZES ─────────────────────────────────────────────────────────────────────
const SIZES = {
  instagram_post:[1080,1080], instagram_story:[1080,1920],
  instagram_portrait:[1080,1350], facebook:[1200,628],
  facebook_story:[1080,1920], twitter_card:[1200,628],
  tiktok:[1080,1920], whatsapp:[1080,1080], youtube_thumb:[1280,720],
};

// ── TEMPLATES ─────────────────────────────────────────────────────────────────

function T1(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const zone = getLayoutZone(h, d._safeZone || 'bottom_left');
  const destination = d.destination || 'Masai Mara';
  const hook = d.hook || '';
  const highlight = d.highlight || '';

  const cardW  = Math.round(w * rndFloat(0.78, 0.92));
  const cardH  = Math.round(h * rndFloat(0.24, 0.32));
  const cardX  = Math.round(w * 0.05);
  const cardY  = Math.min(zone.y, h - cardH - Math.round(h * 0.08));
  const rx     = rndInt(0, Math.round(w * 0.025));
  const dfs    = smartFont(w, 0.072, destination.length, 16);
  const hfs    = smartFont(w, 0.036, hook.length, 40);
  const sfs    = Math.round(w * 0.022);
  const hl     = wrap(hook, 38).slice(0, 2);
  const accentBar = chance(0.5) ? `<rect x="${cardX}" y="${cardY}" width="${Math.round(w*0.006)}" height="${cardH}" fill="${C.accent}"/>` : `<rect x="${cardX}" y="${cardY + cardH - Math.round(h*0.004)}" width="${cardW}" height="${Math.round(h*0.004)}" fill="${C.accent}"/>`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += makeGrad(w, h, C, { strength: rndFloat(0.80,0.92) });
  if (chance(0.4)) svg += noiseTex(w, h);
  svg += brandBadge(w, h, C, HF);
  svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${rx}" fill="${C.dark}" opacity="${rndFloat(0.68, 0.80).toFixed(2)}"/>`;
  svg += accentBar;
  const tx = cardX + Math.round(w * 0.045);
  svg += `<text x="${tx}" y="${cardY + Math.round(cardH * 0.33)}" font-family="${HF}" font-size="${dfs}" font-weight="900" fill="${C.accent}" letter-spacing="${rndInt(0,3)}">${esc(destination.toUpperCase())}</text>`;
  hl.forEach((l, i) => {
    svg += `<text x="${tx}" y="${cardY + Math.round(cardH * 0.33) + dfs * 0.3 + hfs * 1.6 * (i+1)}" font-family="${BF}" font-size="${hfs}" fill="${C.light}" opacity="0.94">${esc(l)}</text>`;
  });
  if (highlight) svg += `<text x="${tx}" y="${cardY + cardH - Math.round(cardH * 0.10)}" font-family="${BF}" font-size="${sfs}" fill="${C.mid}">${esc(highlight.slice(0,70))}</text>`;
  svg += contactFooter(w, h, C, BF);
  svg += '</svg>';
  return svg;
}

function T2(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const pn   = d.packageName || 'Safari Package';
  const dur  = d.duration || '3 days';
  const dests= (d.destinations || []);
  const hls  = d.highlights || [];
  const dest = d.destination || '';
  const topH = Math.round(h * rndFloat(0.08, 0.12));
  const bh2  = Math.round(h * 0.10);
  const mh   = h - topH - bh2;
  const divX = Math.round(w * rndFloat(0.44, 0.56));
  const pfs  = smartFont(w, 0.048, pn.length, 22);
  const hfs  = Math.round(w * 0.027);
  const dfs  = Math.round(w * 0.026);
  const allD = [dest, ...dests].filter((x,i,a) => x && a.indexOf(x) === i);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark2}"/>`;
  // Top header bar
  svg += `<rect x="0" y="0" width="${w}" height="${topH}" fill="${C.primary}" opacity="0.92"/>`;
  svg += `<rect x="0" y="${topH}" width="${w}" height="3" fill="${C.accent}"/>`;
  // Left accent line
  svg += `<rect x="0" y="${topH}" width="${Math.round(w*0.005)}" height="${h-topH}" fill="${C.accent}"/>`;
  const headerLabel = chance(0.5) ? 'SAFARI PACKAGES' : BN.toUpperCase();
  svg += `<text x="${Math.round(w*0.06)}" y="${Math.round(topH*0.68)}" font-family="${HF}" font-size="${Math.round(topH*0.42)}" font-weight="900" fill="${C.accent}">${esc(headerLabel)}</text>`;
  svg += `<text x="${Math.round(w*0.06)}" y="${topH + Math.round(mh*0.15)}" font-family="${HF}" font-size="${pfs}" font-weight="900" fill="${C.accent}">${esc(pn)}</text>`;
  svg += `<text x="${Math.round(w*0.06)}" y="${topH + Math.round(mh*0.25)}" font-family="${BF}" font-size="${dfs}" fill="${C.mid}">${esc(dur)}</text>`;
  allD.slice(0,3).forEach((dd,i) => {
    svg += `<text x="${Math.round(w*0.06)}" y="${topH + Math.round(mh*0.36) + i*Math.round(dfs*1.8)}" font-family="${BF}" font-size="${dfs}" fill="${C.light}" opacity="0.86">${esc(dd)}</text>`;
  });
  // Divider
  svg += `<line x1="${divX}" y1="${topH + Math.round(mh*0.05)}" x2="${divX}" y2="${h - bh2 - Math.round(mh*0.05)}" stroke="${C.accent}" stroke-width="1" opacity="0.28"/>`;
  svg += `<text x="${divX + Math.round(w*0.04)}" y="${topH + Math.round(mh*0.10)}" font-family="${BF}" font-size="${Math.round(hfs*0.88)}" fill="${C.accent}" font-weight="bold">HIGHLIGHTS</text>`;
  hls.slice(0,6).forEach((hl,i) => {
    svg += `<text x="${divX + Math.round(w*0.04)}" y="${topH + Math.round(mh*0.18) + i*Math.round(hfs*2.1)}" font-family="${BF}" font-size="${hfs}" fill="${C.light}" opacity="0.92">• ${esc(hl)}</text>`;
  });
  svg += ctaButton(w, h, C, HF, 'BOOK THIS SAFARI');
  svg += '</svg>';
  return svg;
}

function T3(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const quote = d.quote || 'An unforgettable adventure with Lavira Safaris.';
  const guest = d.guest || 'Verified Guest';
  const highlight = d.highlight || '';
  const destination = d.destination || '';
  const qfs = smartFont(w, 0.040, quote.length, 80);
  const nfs = Math.round(w * 0.028);
  const ql  = wrap(quote, 34).slice(0, 5);
  const qy  = Math.round(h * rndFloat(0.24, 0.34));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark}"/>`;
  svg += makeGrad(w, h, C, { strength: 0.45, angle: '0,0,0,1' });
  if (chance(0.5)) svg += noiseTex(w, h, 0.05);
  // Big decorative quote mark
  svg += `<text x="${Math.round(w*0.06)}" y="${qy - Math.round(w*0.02)}" font-family="Georgia,serif" font-size="${Math.round(w*0.16)}" fill="${C.accent}" opacity="0.10">"</text>`;
  // Accent top bar
  if (chance(0.5)) svg += `<rect x="${Math.round(w*0.08)}" y="${Math.round(h*0.06)}" width="${Math.round(w*0.04)}" height="${Math.round(h*0.005)}" fill="${C.accent}"/>`;
  ql.forEach((l, i) => {
    svg += `<text x="${Math.round(w*0.10)}" y="${qy + qfs * 1.55 * i}" font-family="Georgia,serif" font-size="${qfs}" fill="${C.light}" opacity="0.96" font-style="italic">${esc(l)}</text>`;
  });
  // Stars
  svg += `<text x="${Math.round(w*0.10)}" y="${qy + qfs*1.55*ql.length + Math.round(nfs*1.4)}" font-family="Arial,sans-serif" font-size="${Math.round(nfs*1.1)}" fill="${C.accent}">★★★★★</text>`;
  svg += `<text x="${Math.round(w*0.10)}" y="${qy + qfs*1.55*ql.length + Math.round(nfs*2.8)}" font-family="${BF}" font-size="${nfs}" font-weight="bold" fill="${C.mid}">— ${esc(guest||'Verified Guest')}${destination?' · '+esc(destination):''}</text>`;
  if (highlight) svg += `<text x="${Math.round(w*0.10)}" y="${qy + qfs*1.55*ql.length + Math.round(nfs*3.8)}" font-family="${BF}" font-size="${Math.round(nfs*0.85)}" fill="${C.light}" opacity="0.60">${esc(highlight.slice(0,65))}</text>`;
  svg += brandBadge(w, h, C, HF);
  svg += contactFooter(w, h, C, BF);
  svg += '</svg>';
  return svg;
}

function T4(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const animal  = d.animal || 'Lion';
  const fact    = d.fact || '';
  const destination = d.destination || 'Masai Mara';
  const hook    = d.hook || '';
  const emoji   = d.emoji || '';
  const zone    = getLayoutZone(h, d._safeZone || 'bottom_left');
  const by      = Math.min(zone.y, Math.round(h * 0.55));
  const afs     = smartFont(w, 0.088, animal.length, 10);
  const hfs     = Math.round(w * 0.036);
  const ffs     = Math.round(w * 0.026);
  const fl      = wrap(fact, 40).slice(0, 4);
  const badgeW  = Math.round(w * rndFloat(0.58, 0.72));
  const rx2     = rndInt(0, Math.round(afs * 0.35));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += makeGrad(w, h, C, { strength: rndFloat(0.84, 0.92) });
  svg += brandBadge(w, h, C, HF);
  // Animal badge
  svg += `<rect x="${Math.round(w*0.06)}" y="${by}" width="${badgeW}" height="${Math.round(afs*1.65)}" fill="${C.accent}" rx="${rx2}"/>`;
  if (emoji) svg += `<text x="${Math.round(w*0.06)+Math.round(w*0.06)}" y="${by+Math.round(afs*1.18)}" font-family="Arial,sans-serif" font-size="${Math.round(afs*0.90)}">${esc(emoji)}</text>`;
  const textX = emoji ? Math.round(w*0.06)+Math.round(afs*1.1) : Math.round(w*0.06)+Math.round(badgeW*0.08);
  svg += `<text x="${textX}" y="${by+Math.round(afs*1.15)}" font-family="${HF}" font-size="${afs}" font-weight="900" fill="${C.dark}" letter-spacing="${rndInt(0,2)}">${esc(animal.toUpperCase())}</text>`;
  if (hook) svg += `<text x="${Math.round(w*0.06)}" y="${by+Math.round(afs*1.65)+Math.round(hfs*1.6)}" font-family="${BF}" font-size="${hfs}" font-weight="bold" fill="${C.light}">${esc(hook.slice(0,50))}</text>`;
  svg += `<text x="${Math.round(w*0.06)}" y="${by+Math.round(afs*1.65)+hfs*3.4}" font-family="${BF}" font-size="${ffs}" fill="${C.mid}">📍 ${esc(destination)}</text>`;
  fl.forEach((l, i) => {
    svg += `<text x="${Math.round(w*0.06)}" y="${Math.round(h*0.82)+ffs*1.7*i}" font-family="${BF}" font-size="${ffs}" fill="${C.light}" opacity="0.80">${esc(l)}</text>`;
  });
  svg += contactFooter(w, h, C, BF);
  svg += '</svg>';
  return svg;
}

function T5(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const d1 = d.destination1||'Masai Mara', d2 = d.destination2||'Amboseli';
  const h1 = d.hook1||'', h2 = d.hook2||'', pn = d.packageName||'';
  const hl1 = d.highlights1||[], hl2 = d.highlights2||[];
  const topH = Math.round(h * rndFloat(0.08, 0.12));
  const bh2  = Math.round(h * 0.10);
  const mh   = h - topH - bh2;
  const split= Math.round(w * rndFloat(0.44, 0.56));
  const dfs  = smartFont(w, 0.048, Math.max(d1.length, d2.length), 16);
  const hfs  = Math.round(w * 0.030);
  const lfs  = Math.round(w * 0.024);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark2}"/>`;
  svg += `<rect x="0" y="0" width="${w}" height="${topH}" fill="${C.dark}" opacity="0.90"/>`;
  svg += `<rect x="0" y="${topH}" width="${w}" height="3" fill="${C.accent}"/>`;
  svg += `<rect x="0" y="${topH}" width="${Math.round(w*0.004)}" height="${h-topH}" fill="${C.accent}"/>`;
  svg += `<text x="${Math.round(w*0.06)}" y="${Math.round(topH*0.68)}" font-family="${HF}" font-size="${Math.round(topH*0.40)}" font-weight="900" fill="${C.accent}">${esc((pn||'DUAL SAFARI').toUpperCase())}</text>`;
  // Left panel
  svg += `<rect x="0" y="${topH}" width="${split}" height="${mh}" fill="${C.primary}" opacity="${rndFloat(0.10,0.20).toFixed(2)}"/>`;
  svg += `<text x="${Math.round(w*0.05)}" y="${topH+Math.round(mh*0.16)}" font-family="${HF}" font-size="${dfs}" font-weight="900" fill="${C.accent}">${esc(d1)}</text>`;
  if (h1) svg += `<text x="${Math.round(w*0.05)}" y="${topH+Math.round(mh*0.26)}" font-family="${BF}" font-size="${hfs}" fill="${C.light}" opacity="0.90">${esc(h1.slice(0,28))}</text>`;
  hl1.slice(0,4).forEach((hl,i) => {
    svg += `<text x="${Math.round(w*0.05)}" y="${topH+Math.round(mh*0.38)+i*Math.round(lfs*2.1)}" font-family="${BF}" font-size="${lfs}" fill="${C.light}" opacity="0.80">• ${esc(hl)}</text>`;
  });
  // Divider
  svg += `<line x1="${split}" y1="${topH+Math.round(mh*0.05)}" x2="${split}" y2="${h-bh2-Math.round(mh*0.05)}" stroke="${C.accent}" stroke-width="1.5" opacity="0.30"/>`;
  // Right panel
  svg += `<rect x="${split}" y="${topH}" width="${w-split}" height="${mh}" fill="${C.primary}" opacity="${rndFloat(0.08,0.14).toFixed(2)}"/>`;
  svg += `<text x="${split+Math.round(w*0.04)}" y="${topH+Math.round(mh*0.16)}" font-family="${HF}" font-size="${dfs}" font-weight="900" fill="${C.accent}">${esc(d2)}</text>`;
  if (h2) svg += `<text x="${split+Math.round(w*0.04)}" y="${topH+Math.round(mh*0.26)}" font-family="${BF}" font-size="${hfs}" fill="${C.light}" opacity="0.90">${esc(h2.slice(0,28))}</text>`;
  hl2.slice(0,4).forEach((hl,i) => {
    svg += `<text x="${split+Math.round(w*0.04)}" y="${topH+Math.round(mh*0.38)+i*Math.round(lfs*2.1)}" font-family="${BF}" font-size="${lfs}" fill="${C.light}" opacity="0.80">• ${esc(hl)}</text>`;
  });
  svg += ctaButton(w, h, C, HF, 'BOOK DUAL SAFARI');
  svg += '</svg>';
  return svg;
}

function T6(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const act  = d.activity||'Hot Air Balloon', dest = d.destination||'Masai Mara';
  const hook = d.hook||'', hls = d.highlights||[], emoji = d.emoji||'';
  const zone = getLayoutZone(h, d._safeZone || 'center');
  const cy   = Math.min(zone.y, Math.round(h * 0.48));
  const afs  = smartFont(w, 0.054, act.length, 20);
  const hfs  = Math.round(w * 0.034), lfs = Math.round(w * 0.026);
  const al   = wrap(act, 22).slice(0, 2);
  const anchor = zone.anchor || 'middle';
  const tx   = anchor === 'left' ? Math.round(w*0.08) : (anchor === 'right' ? w - Math.round(w*0.08) : w/2);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark2}"/>`;
  svg += makeGrad(w, h, C, { strength: 0.60 });
  if (chance(0.4)) svg += noiseTex(w, h);
  svg += brandBadge(w, h, C, HF);
  if (emoji) svg += `<text x="${tx}" y="${cy - Math.round(afs*1.5)}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="${Math.round(w*0.10)}" opacity="0.85">${esc(emoji)}</text>`;
  al.forEach((l, i) => {
    svg += `<text x="${tx}" y="${cy + afs*1.3*i}" text-anchor="${anchor}" font-family="${HF}" font-size="${afs}" font-weight="900" fill="${C.accent}">${esc(l.toUpperCase())}</text>`;
  });
  svg += `<text x="${tx}" y="${cy + afs*1.3*al.length + Math.round(hfs*1.2)}" text-anchor="${anchor}" font-family="${BF}" font-size="${hfs}" fill="${C.light}">📍 ${esc(dest)}</text>`;
  if (hook) svg += `<text x="${tx}" y="${cy + afs*1.3*al.length + hfs*2.8}" text-anchor="${anchor}" font-family="${BF}" font-size="${Math.round(hfs*0.86)}" fill="${C.mid}">${esc(hook.slice(0,52))}</text>`;
  hls.slice(0,3).forEach((hl,i) => {
    svg += `<text x="${Math.round(w*0.08)}" y="${Math.round(h*0.73)+i*Math.round(lfs*2.1)}" font-family="${BF}" font-size="${lfs}" fill="${C.light}" opacity="0.80">• ${esc(hl)}</text>`;
  });
  svg += ctaButton(w, h, C, HF, 'BOOK EXPERIENCE');
  svg += '</svg>';
  return svg;
}

function T7(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const headline = d.headline||'', body = d.body||'', hook = d.hook||'', cta = d.cta||'Book Your Safari';
  const zone = getLayoutZone(h, d._safeZone || 'center');
  const hfs  = smartFont(w, 0.068, (headline||hook).length, 18);
  const bfs  = Math.round(w * 0.034), cfs = Math.round(w * 0.036);
  const hl   = wrap(headline||hook, 18).slice(0,3);
  const bl   = wrap(body, 32).slice(0,5);
  const hy   = Math.min(zone.y, Math.round(h * 0.38));
  const by2  = hy + hfs*1.3*hl.length + Math.round(hfs);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += makeGrad(w, h, C, { strength: rndFloat(0.88, 0.95) });
  svg += brandBadge(w, h, C, HF);
  hl.forEach((l, i) => {
    svg += `<text x="${w/2}" y="${hy + hfs*1.3*i}" text-anchor="middle" font-family="${HF}" font-size="${hfs}" font-weight="900" fill="${C.accent}" letter-spacing="${rndInt(0,3)}">${esc(l)}</text>`;
  });
  bl.forEach((l, i) => {
    svg += `<text x="${w/2}" y="${by2 + bfs*1.6*i}" text-anchor="middle" font-family="${BF}" font-size="${bfs}" fill="${C.light}" opacity="0.90">${esc(l)}</text>`;
  });
  // CTA button
  const btnY = h - Math.round(h*0.13) - Math.round(cfs*2.8);
  svg += `<rect x="${Math.round(w*0.12)}" y="${btnY}" width="${Math.round(w*0.76)}" height="${Math.round(cfs*2.6)}" fill="${C.accent}" rx="${rndInt(0,Math.round(cfs*0.8))}"/>`;
  svg += `<text x="${w/2}" y="${btnY + Math.round(cfs*1.78)}" text-anchor="middle" font-family="${HF}" font-size="${cfs}" font-weight="900" fill="${C.dark}">${esc(cta)}</text>`;
  svg += contactFooter(w, h, C, BF);
  svg += '</svg>';
  return svg;
}

function T8(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const stats = d.stats||[], quote = d.quote||'', destination = d.destination||'';
  const topH = Math.round(h * rndFloat(0.08,0.12));
  const bh2  = Math.round(h * 0.10), mh = h - topH - bh2;
  const nfs  = Math.round(w * 0.072), lfs = Math.round(w * 0.026), qfs = Math.round(w * 0.028);
  const items = stats.slice(0,3), cols = items.length || 3;
  const cw   = Math.round((w * 0.88) / cols);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark2}"/>`;
  svg += `<rect x="0" y="0" width="${w}" height="${topH}" fill="${C.primary}" opacity="0.94"/>`;
  svg += `<rect x="0" y="${topH}" width="${w}" height="3" fill="${C.accent}"/>`;
  svg += `<rect x="0" y="${topH}" width="${Math.round(w*0.004)}" height="${h-topH}" fill="${C.accent}"/>`;
  svg += `<text x="${Math.round(w*0.06)}" y="${Math.round(topH*0.68)}" font-family="${HF}" font-size="${Math.round(topH*0.40)}" font-weight="900" fill="${C.accent}">${esc(destination||'BY THE NUMBERS')}</text>`;
  items.forEach((st, i) => {
    const cx  = Math.round(w*0.06) + i*cw + Math.round(cw*0.5);
    const sy  = topH + Math.round(mh*0.22);
    const rx3 = rndInt(0, Math.round(w*0.025));
    svg += `<rect x="${Math.round(w*0.06)+i*cw}" y="${sy - Math.round(nfs*0.2)}" width="${Math.round(cw*0.90)}" height="${Math.round(nfs*3)}" fill="${C.primary}" opacity="0.20" rx="${rx3}"/>`;
    svg += `<text x="${cx}" y="${sy+nfs}" text-anchor="middle" font-family="${HF}" font-size="${nfs}" font-weight="900" fill="${C.accent}">${esc(st.value||'')}</text>`;
    svg += `<text x="${cx}" y="${sy+nfs+Math.round(lfs*1.6)}" text-anchor="middle" font-family="${BF}" font-size="${lfs}" fill="${C.light}" opacity="0.82">${esc((st.label||'').toUpperCase())}</text>`;
  });
  if (quote) svg += `<text x="${w/2}" y="${topH + Math.round(mh*0.78)}" text-anchor="middle" font-family="Georgia,serif" font-size="${qfs}" fill="${C.mid}" font-style="italic">"${esc(quote.slice(0,60))}"</text>`;
  svg += ctaButton(w, h, C, HF);
  svg += '</svg>';
  return svg;
}

function T9(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const packageName = d.packageName||'', days = d.days||[], destination = d.destination||'';
  const topH = Math.round(h * rndFloat(0.08,0.12));
  const bh2  = Math.round(h * 0.10), mh = h - topH - bh2;
  const dfs  = Math.round(w * 0.030), afs = Math.round(w * 0.026);
  const items= days.slice(0,5), rh = Math.round(mh / Math.max(items.length+1, 5));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark2}"/>`;
  svg += `<rect x="0" y="0" width="${w}" height="${topH}" fill="${C.primaryDark}" opacity="0.95"/>`;
  svg += `<rect x="0" y="${topH}" width="${w}" height="3" fill="${C.accent}"/>`;
  svg += `<rect x="0" y="${topH}" width="${Math.round(w*0.004)}" height="${h-topH}" fill="${C.accent}"/>`;
  svg += `<text x="${Math.round(w*0.06)}" y="${Math.round(topH*0.68)}" font-family="${HF}" font-size="${Math.round(topH*0.40)}" font-weight="900" fill="${C.accent}">${esc((packageName||'SAFARI ITINERARY').toUpperCase())}</text>`;
  if (destination) svg += `<text x="${Math.round(w*0.07)}" y="${topH + Math.round(rh*0.7)}" font-family="${BF}" font-size="${afs}" fill="${C.mid}">${esc(destination)}</text>`;
  const rowColors = [C.primary, C.accent, C.primaryLight, C.accentDark, C.primaryLight];
  items.forEach((dy, i) => {
    const ry = topH + rh*(i+1);
    const rowBg = i%2===0 ? C.primary : C.accent;
    svg += `<rect x="${Math.round(w*0.04)}" y="${ry}" width="${Math.round(w*0.92)}" height="${Math.round(rh*0.82)}" fill="${i%2===0?'rgba(45,106,79,0.15)':'rgba(244,162,97,0.07)'}" rx="${Math.round(w*0.015)}"/>`;
    svg += `<rect x="${Math.round(w*0.04)}" y="${ry}" width="${Math.round(w*0.005)}" height="${Math.round(rh*0.82)}" fill="${i%2===0?C.accent:C.primary}"/>`;
    svg += `<text x="${Math.round(w*0.07)}" y="${ry + Math.round(rh*0.50)}" font-family="${HF}" font-size="${dfs}" font-weight="900" fill="${C.accent}">DAY ${esc(dy.day||i+1)}</text>`;
    svg += `<text x="${Math.round(w*0.21)}" y="${ry + Math.round(rh*0.50)}" font-family="${BF}" font-size="${afs}" fill="${C.light}" opacity="0.90">${esc((dy.activity||'').slice(0,42))}</text>`;
  });
  svg += ctaButton(w, h, C, HF);
  svg += '</svg>';
  return svg;
}

function T10(w, h, d) {
  const C = getPalette(), HF = getHeadFont(), BF = getBodyFont();
  const offerTitle = d.offerTitle||'Special Offer', price = d.price||'';
  const duration = d.duration||'', inclusions = d.inclusions||[];
  const destination = d.destination||'', urgency = d.urgency||'';
  const zone = getLayoutZone(h, d._safeZone || 'top_left');
  const cy   = Math.min(zone.y, Math.round(h * 0.30));
  const tfs  = smartFont(w, 0.056, offerTitle.length, 18);
  const pfs  = Math.round(w * 0.072), ifs = Math.round(w * 0.026), ufs = Math.round(w * 0.028);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="${C.dark2}"/>`;
  svg += makeGrad(w, h, C, { strength: 0.72 });
  if (chance(0.4)) svg += noiseTex(w, h);
  svg += brandBadge(w, h, C, HF);
  svg += `<text x="${Math.round(w*0.06)}" y="${cy}" font-family="${HF}" font-size="${tfs}" font-weight="900" fill="${C.light}">${esc(offerTitle.toUpperCase())}</text>`;
  if (destination) svg += `<text x="${Math.round(w*0.06)}" y="${cy + Math.round(tfs*1.4)}" font-family="${BF}" font-size="${ifs}" fill="${C.mid}">${esc(destination)}${duration?' · '+esc(duration):''}</text>`;
  if (price) {
    const priceW = Math.round(w * 0.52), priceH = Math.round(pfs*1.7);
    const priceY = cy + Math.round(tfs*2.0);
    svg += `<rect x="${Math.round(w*0.06)}" y="${priceY}" width="${priceW}" height="${priceH}" fill="${C.primary}" rx="${rndInt(0,Math.round(priceH*0.3))}"/>`;
    svg += `<text x="${Math.round(w*0.06)+Math.round(priceW*0.5)}" y="${priceY+Math.round(pfs*1.22)}" text-anchor="middle" font-family="${HF}" font-size="${pfs}" font-weight="900" fill="${C.light}">${esc(price)}</text>`;
    svg += `<text x="${Math.round(w*0.06)+Math.round(priceW*0.5)}" y="${priceY+Math.round(pfs*1.22)+Math.round(ifs*1.5)}" text-anchor="middle" font-family="${BF}" font-size="${ifs}" fill="${C.cream}">per person</text>`;
  }
  inclusions.slice(0,5).forEach((inc, i) => {
    svg += `<text x="${Math.round(w*0.06)}" y="${Math.round(h*0.60)+i*Math.round(ifs*2.0)}" font-family="${BF}" font-size="${ifs}" fill="${C.light}" opacity="0.88">✓ ${esc(inc)}</text>`;
  });
  if (urgency) {
    svg += `<rect x="${Math.round(w*0.06)}" y="${Math.round(h*0.83)}" width="${Math.round(w*0.88)}" height="${Math.round(ufs*2.4)}" fill="${C.accent}" rx="${rndInt(0,Math.round(ufs*0.6))}"/>`;
    svg += `<text x="${w/2}" y="${Math.round(h*0.83)+Math.round(ufs*1.65)}" text-anchor="middle" font-family="${HF}" font-size="${ufs}" font-weight="900" fill="${C.dark}">${esc(urgency)}</text>`;
  }
  svg += contactFooter(w, h, C, BF);
  svg += '</svg>';
  return svg;
}

// ── TEMPLATE MAP ──────────────────────────────────────────────────────────────
const TEMPLATE_MAP = {
  hero_destination:T1, package:T2, package_promo:T2, safari_package:T2,
  testimonial:T3, wildlife_spotlight:T4,
  twin_destination:T5, dual_destination:T5,
  activity:T6, story:T7,
  stats:T8, conservation:T8, guide_spotlight:T8,
  itinerary:T9, offer:T10, pricing:T10, promo_flash:T10,
};

// ── RENDER PIPELINE ───────────────────────────────────────────────────────────
async function renderCard(opts) {
  opts = opts || {};
  const template        = opts.template        || 'hero_destination';
  const data            = opts.data            || {};
  const backgroundImage = opts.backgroundImage || null;
  const profile         = opts.profile         || 'instagram_post';
  const [w, h] = SIZES[profile] || [1080, 1080];

  let imageAnalysis = getDefaultAnalysis();
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    try { imageAnalysis = await analyseImage(backgroundImage); } catch(e) {}
  }

  let resolvedData = data;
  try { resolvedData = await resolvePostData(data.destination || null, template, data, imageAnalysis); } catch(e) {}

  // Pass safe zone hint from image analysis
  resolvedData._safeZone = imageAnalysis.safeTextZone || null;
  resolvedData._textAnchor = zoneToCoords(imageAnalysis.safeTextZone || 'bottom_left', w, h);

  const fn     = TEMPLATE_MAP[template] || T1;
  const svgBuf = Buffer.from(fn(w, h, resolvedData));
  const outName= 'lavira_card_' + template + '_' + profile + '_' + uuid().slice(0,8) + '.jpg';
  const outPath= path.join(cfg.OUTPUTS_DIR, outName);
  fs.mkdirSync(cfg.OUTPUTS_DIR, { recursive: true });

  let pipeline;
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    pipeline = sharp(backgroundImage)
      .resize(w, h, { fit:'cover', position:'centre' })
      .modulate({ saturation: rndFloat(1.05, 1.20) }) // randomize sat
      .composite([{ input: svgBuf, blend:'over' }]);
  } else {
    // Solid gradient background from palette
    const palette = ['#1B4332','#0F1C17','#1D3557','#120D11','#1A1208'];
    const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${rnd(palette)}"/></svg>`);
    pipeline = sharp(bg).composite([{ input: svgBuf, blend:'over' }]);
  }

  // ── REAL LOGO COMPOSITE: always stamp the official Lavira logo ──────────
  let logoLayer = null;
  try {
    const logoSize = Math.round(Math.min(w, h) * 0.09); // 9% of shortest side
    const logoBuf  = await getLogoPNG(logoSize);
    if (logoBuf) {
      const padX = Math.round(w * 0.03);
      const padY = Math.round(h * 0.015);
      logoLayer = { input: logoBuf, blend: 'over', left: padX, top: padY };
    }
  } catch(_e) {}

  const layers = logoLayer ? [logoLayer] : [];
  await pipeline.composite(layers).jpeg({ quality: 94 }).toFile(outPath);
  return {
    filename: outName, path: outPath, downloadUrl: '/outputs/' + outName,
    resolution: w + 'x' + h, template, profile,
    imageAnalysis: imageAnalysis.analysed ? {
      mood:imageAnalysis.mood, timeOfDay:imageAnalysis.timeOfDay,
      safeTextZone:imageAnalysis.safeTextZone, entities:imageAnalysis.entities,
    } : null,
  };
}

async function renderAllProfiles(template, data, backgroundImage, profiles) {
  profiles = profiles || ['instagram_post','instagram_story','facebook'];
  const results = [];
  for (let i = 0; i < profiles.length; i++) {
    try { results.push(await renderCard({ template, data, backgroundImage, profile:profiles[i] })); }
    catch(e) { results.push({ profile:profiles[i], error:e.message }); }
  }
  return results;
}

function buildDefaultData(destination, template) {
  const dest = destination || 'Masai Mara';
  const prof = (BRAND.destination_profiles || {})[dest] || {};
  const pkgs = BRAND.safari_packages || [];
  const pkg  = pkgs.find(p => p.destinations && p.destinations.includes(dest)) || {};
  const testi= BRAND.testimonials || [];
  const t    = testi[Math.floor(Math.random() * testi.length)] || {};
  const wildlife = prof.wildlife || ['Elephant','Lion','Cheetah'];
  const dests= BRAND.destinations || [];
  switch (template) {
    case 'hero_destination': return { destination:dest, hook:prof.highlight||'Discover '+dest, highlight:prof.headline||'', packageName:pkg.name||'' };
    case 'safari_package': case 'package': case 'package_promo': return { packageName:pkg.name||dest+' Safari', duration:pkg.duration||'3 days', destinations:pkg.destinations||[dest], highlights:pkg.highlights||wildlife.slice(0,4), destination:dest };
    case 'testimonial': return { quote:t.quote||'An absolutely unforgettable experience with Lavira Safaris.', guest:t.guest||'Safari Guest', highlight:t.highlight||'', destination:dest };
    case 'wildlife_spotlight': return { animal:(wildlife[0]||'Elephant'), fact:prof.highlight||'Spot the Big Five in '+dest, destination:dest, hook:'This week in '+dest, emoji:'🦁' };
    case 'dual_destination': case 'twin_destination': { const d2=dests.find(d=>d!==dest)||'Amboseli', p2=(BRAND.destination_profiles||{})[d2]||{}; return { destination1:dest, destination2:d2, hook1:(prof.highlight||'').slice(0,30), hook2:(p2.highlight||'').slice(0,30), highlights1:(prof.wildlife||[]).slice(0,3), highlights2:(p2.wildlife||[]).slice(0,3), packageName:dest+' & '+d2+' Safari' }; }
    case 'activity': return { activity:(prof.activities&&prof.activities[0])||'Game Drive', destination:dest, hook:prof.highlight||'Discover '+dest, highlights:prof.activities||wildlife.slice(0,3), emoji:'🦁' };
    case 'story': return { headline:BRAND.tagline||'Making Your Safari Experience Memorable', body:prof.highlight||'The ultimate African wildlife experience.', hook:prof.headline||'', cta:'Book Your Safari', destination:dest };
    case 'stats': case 'guide_spotlight': case 'conservation': return { destination:dest, stats:[{value:'13+',label:'Destinations'},{value:'14',label:'Packages'},{value:'⭐4.9',label:'Guest Rating'}], quote:prof.highlight||'' };
    case 'promo_flash': case 'offer': case 'pricing': return { destination:dest, hook:'This Week — '+dest+' Safari', price:'', inclusions:pkg.highlights||wildlife.slice(0,4), urgency:'Limited Spots — Book Now on WhatsApp' };
    default: return { destination:dest, hook:'Experience '+dest+' with Lavira Safaris' };
  }
}

module.exports = { renderCard, renderAllProfiles, buildDefaultData, TEMPLATE_MAP, SIZES };
