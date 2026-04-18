// src/engines/card-templates.js -- Lavira Card Template Engine v3
// Family A (T1,T4,T7): Minimal Float
// Family B (T2,T5,T8,T9): Split Panel
// Family C (T3,T6,T10): Immersive Overlay
'use strict';
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');
const BRAND  = require('../orchestrator/brand');
const { analyseImage, zoneToCoords, getDefaultAnalysis } = require('./image-vision');
const { resolvePostData } = require('./post-defaults');

const C = {
  green:'#2D6A4F', greenDark:'#1B4332', greenLight:'#40916C',
  amber:'#F4A261', amberDark:'#E07A2F', amberLight:'#FBBF77',
  dark:'#0A1612',  dark2:'#0F1C17',
  white:'#FFFFFF',  cream:'#FEF9EF',
  grayMid:'#9fd3aa', grayDim:'#6B8F71',
};
const BN = BRAND.name    || 'Lavira Safaris';
const PH = BRAND.phone   || '+254 721 757 387';
const WB = (BRAND.website || 'https://lavirasafaris.com').replace('https://','');
const IG = (BRAND.socials && BRAND.socials.instagram) || '@lavirasafaris';

const SIZES = {
  instagram_post:[1080,1080], instagram_story:[1080,1920],
  instagram_portrait:[1080,1350], facebook:[1200,628],
  facebook_story:[1080,1920], twitter_card:[1200,628],
  tiktok:[1080,1920], whatsapp:[1080,1080], youtube_thumb:[1280,720],
};

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function wrap(text,max){ const ws=String(text||'').split(' '),ls=[]; let l=''; for(const w of ws){ if((l+' '+w).trim().length>max){if(l)ls.push(l.trim());l=w;}else l=(l+' '+w).trim(); } if(l)ls.push(l.trim()); return ls; }

// ---- FAMILY A HELPERS: Minimal Float ----
function logoPill(w, h) {
  const r = Math.round(h * 0.022);
  const cx = Math.round(w * 0.06) + r;
  const cy = Math.round(h * 0.038) + r;
  const pillW = Math.round(w * 0.40);
  const pillH = r * 2 + Math.round(r * 0.4);
  return '<rect x="' + Math.round(w*0.04) + '" y="' + Math.round(h*0.025) + '" width="' + pillW + '" height="' + pillH + '" rx="' + r + '" fill="' + C.dark + '" opacity="0.82"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + C.amber + '"/>' +
    '<text x="' + cx + '" y="' + (cy+Math.round(r*0.38)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + Math.round(r*1.1) + '" font-weight="900" fill="' + C.dark + '">L</text>' +
    '<text x="' + (cx+r+Math.round(w*0.014)) + '" y="' + (cy+Math.round(r*0.38)) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + Math.round(r*0.85) + '" font-weight="900" fill="' + C.white + '" letter-spacing="0.5">' + esc(BN) + '</text>';
}

function thinStrip(w, h) {
  const sh = Math.round(h * 0.045);
  const y  = h - sh;
  const fs = Math.round(sh * 0.52);
  return '<rect x="0" y="' + y + '" width="' + w + '" height="' + sh + '" fill="' + C.dark + '" opacity="0.78"/>' +
    '<text x="' + Math.round(w*0.04) + '" y="' + (y+Math.round(sh*0.72)) + '" font-family="Arial,sans-serif" font-size="' + fs + '" fill="' + C.amber + '">' + esc(PH) + '</text>' +
    '<text x="' + (w-Math.round(w*0.04)) + '" y="' + (y+Math.round(sh*0.72)) + '" text-anchor="end" font-family="Arial,sans-serif" font-size="' + fs + '" fill="' + C.white + '" opacity="0.80">' + esc(WB) + '</text>';
}

function frostedCard(w, h, d, textAnchor) {
  const destination = d.destination || '';
  const hook = d.hook || '';
  const highlight = d.highlight || '';
  const cardH  = Math.round(h * 0.28);
  const cardW  = Math.round(w * 0.86);
  const cardX  = Math.round(w * 0.06);
  const cardY  = Math.min(textAnchor.y, h - cardH - Math.round(h * 0.07));
  const dfs    = Math.round(w * 0.068);
  const hfs    = Math.round(w * 0.036);
  const sfs    = Math.round(w * 0.022);
  const hl     = wrap(hook, 40).slice(0, 2);
  let svg = '<rect x="' + cardX + '" y="' + cardY + '" width="' + cardW + '" height="' + cardH + '" rx="' + Math.round(w*0.018) + '" fill="' + C.dark + '" opacity="0.72"/>' +
    '<rect x="' + cardX + '" y="' + cardY + '" width="' + Math.round(w*0.005) + '" height="' + cardH + '" fill="' + C.amber + '"/>' +
    '<text x="' + (cardX+Math.round(w*0.04)) + '" y="' + (cardY+Math.round(cardH*0.30)) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + dfs + '" font-weight="900" fill="' + C.amber + '" letter-spacing="1">' + esc(destination.toUpperCase()) + '</text>';
  hl.forEach(function(l,i){
    svg += '<text x="' + (cardX+Math.round(w*0.04)) + '" y="' + (cardY+Math.round(cardH*0.30)+dfs*0.4+hfs*1.55*(i+1)) + '" font-family="Arial,sans-serif" font-size="' + hfs + '" fill="' + C.white + '" opacity="0.95">' + esc(l) + '</text>';
  });
  if (highlight) svg += '<text x="' + (cardX+Math.round(w*0.04)) + '" y="' + (cardY+cardH-Math.round(cardH*0.12)) + '" font-family="Arial,sans-serif" font-size="' + sfs + '" fill="' + C.grayMid + '">' + esc(highlight.slice(0,68)) + '</text>';
  return svg;
}

// ---- FAMILY B HELPERS: Split Panel ----
function verticalBrand(w, h, topH) {
  return '<rect x="0" y="' + topH + '" width="' + Math.round(w*0.005) + '" height="' + (h-topH) + '" fill="' + C.amber + '"/>';
}

function familyBHeader(w, h, topH, label) {
  return '<rect x="0" y="0" width="' + w + '" height="' + topH + '" fill="' + C.dark + '" opacity="0.95"/>' +
    '<rect x="0" y="' + topH + '" width="' + w + '" height="3" fill="' + C.amber + '" opacity="0.8"/>' +
    '<text x="' + Math.round(w*0.07) + '" y="' + Math.round(topH*0.68) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + Math.round(topH*0.40) + '" font-weight="900" fill="' + C.amber + '">' + esc(label) + '</text>';
}

function ctaBand(w, h) {
  const bh  = Math.round(h * 0.12);
  const y   = h - bh;
  const fs1 = Math.round(bh * 0.28);
  const fs2 = Math.round(bh * 0.20);
  return '<rect x="0" y="' + y + '" width="' + w + '" height="' + bh + '" fill="' + C.green + '"/>' +
    '<text x="' + (w/2) + '" y="' + (y+Math.round(bh*0.42)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + fs1 + '" font-weight="900" fill="' + C.white + '">BOOK THIS SAFARI</text>' +
    '<text x="' + (w/2) + '" y="' + (y+Math.round(bh*0.73)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + fs2 + '" fill="' + C.cream + '">WhatsApp ' + esc(PH) + ' - ' + esc(WB) + '</text>';
}

// ---- FAMILY C HELPERS: Immersive Overlay ----
function logoMark(w, h, corner) {
  corner = corner || 'top-right';
  const r   = Math.round(w * 0.038);
  const pad = Math.round(w * 0.04);
  const cx  = corner.indexOf('right') >= 0 ? w - pad - r : pad + r;
  const cy  = corner.indexOf('bottom') >= 0 ? h - pad - r : pad + r;
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + C.amber + '" opacity="0.92"/>' +
    '<text x="' + cx + '" y="' + (cy+Math.round(r*0.38)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + Math.round(r*1.1) + '" font-weight="900" fill="' + C.dark + '">L</text>';
}

function overlayContact(w, h) {
  const ph  = Math.round(h * 0.042);
  const pw  = Math.round(w * 0.88);
  const px  = Math.round((w - pw) / 2);
  const py  = h - ph - Math.round(h * 0.025);
  const fs  = Math.round(ph * 0.50);
  return '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="' + Math.round(ph*0.5) + '" fill="' + C.dark + '" opacity="0.76"/>' +
    '<text x="' + (w/2) + '" y="' + (py+Math.round(ph*0.70)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + fs + '" fill="' + C.amber + '">' + esc(PH) + '  -  ' + esc(WB) + '  -  ' + esc(IG) + '</text>';
}

function grad(w, h, s) {
  s = s || 0.88;
  const s40 = Math.round(s*0.4*100)/100;
  const id = 'g' + w + 'x' + h;
  return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="rgba(10,22,18,0)"/>' +
    '<stop offset="45%" stop-color="rgba(10,22,18,' + s40 + ')"/>' +
    '<stop offset="100%" stop-color="rgba(10,22,18,' + s + ')"/>' +
    '</linearGradient></defs><rect width="' + w + '" height="' + h + '" fill="url(#' + id + ')"/>';
}

// ---- TEMPLATES ----
function T1(w, h, d) {
  d = d || {};
  const ta = d._textAnchor || { x: Math.round(w*0.06), y: Math.round(h*0.62) };
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    grad(w,h,0.85) + logoPill(w,h) + frostedCard(w,h,d,ta) + thinStrip(w,h) + '</svg>';
}

function T2(w, h, d) {
  d = d || {};
  const pn = d.packageName || 'Safari Package';
  const dur = d.duration || '3 days';
  const dests = (d.destinations || []);
  const hls = d.highlights || [];
  const dest = d.destination || '';
  const topH=Math.round(h*0.10), bh=Math.round(h*0.12), mh=h-topH-bh;
  const pfs=Math.round(w*0.046), hfs=Math.round(w*0.027), dfs=Math.round(w*0.026);
  const dx=Math.round(w*0.5);
  const allD = [dest].concat(dests).filter(function(x,i,a){ return x && a.indexOf(x)===i; });
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark2 + '"/>' +
    verticalBrand(w,h,topH) + familyBHeader(w,h,topH,'Safari Packages') +
    '<text x="' + Math.round(w*0.06) + '" y="' + (topH+Math.round(mh*0.16)) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + pfs + '" font-weight="900" fill="' + C.amber + '">' + esc(pn) + '</text>' +
    '<text x="' + Math.round(w*0.06) + '" y="' + (topH+Math.round(mh*0.26)) + '" font-family="Arial,sans-serif" font-size="' + dfs + '" fill="' + C.grayMid + '">' + esc(dur) + '</text>';
  allD.slice(0,3).forEach(function(dd,i){
    svg += '<text x="' + Math.round(w*0.06) + '" y="' + (topH+Math.round(mh*0.36)+i*Math.round(dfs*1.8)) + '" font-family="Arial,sans-serif" font-size="' + dfs + '" fill="' + C.white + '" opacity="0.85">' + esc(dd) + '</text>';
  });
  svg += '<rect x="' + dx + '" y="' + (topH+Math.round(mh*0.05)) + '" width="1" height="' + Math.round(mh*0.88) + '" fill="' + C.amber + '" opacity="0.25"/>' +
    '<text x="' + (dx+Math.round(w*0.04)) + '" y="' + (topH+Math.round(mh*0.10)) + '" font-family="Arial,sans-serif" font-size="' + Math.round(hfs*0.9) + '" fill="' + C.amber + '" font-weight="bold">HIGHLIGHTS</text>';
  hls.slice(0,6).forEach(function(hl,i){
    svg += '<text x="' + (dx+Math.round(w*0.04)) + '" y="' + (topH+Math.round(mh*0.18)+i*Math.round(hfs*2.1)) + '" font-family="Arial,sans-serif" font-size="' + hfs + '" fill="' + C.white + '" opacity="0.92">* ' + esc(hl) + '</text>';
  });
  svg += ctaBand(w,h) + '</svg>';
  return svg;
}

function T3(w, h, d) {
  d = d || {};
  const quote = d.quote || '';
  const guest = d.guest || '';
  const highlight = d.highlight || '';
  const destination = d.destination || '';
  const qfs=Math.round(w*0.038), nfs=Math.round(w*0.028), sfs=Math.round(w*0.040);
  const ql=wrap(quote,36).slice(0,5), qy=Math.round(h*0.30);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark + '"/>' + grad(w,h,0.50) + logoMark(w,h,'top-right') +
    '<text x="' + Math.round(w*0.06) + '" y="' + (qy-Math.round(w*0.01)) + '" font-family="Georgia,serif" font-size="' + Math.round(w*0.14) + '" fill="' + C.amber + '" opacity="0.12">"</text>';
  ql.forEach(function(l,i){
    svg += '<text x="' + Math.round(w*0.10) + '" y="' + (qy+qfs*1.55*i) + '" font-family="Georgia,serif" font-size="' + qfs + '" fill="' + C.white + '" opacity="0.96" font-style="italic">' + esc(l) + '</text>';
  });
  svg += '<text x="' + Math.round(w*0.10) + '" y="' + (qy+qfs*1.55*ql.length+Math.round(sfs*1.3)) + '" font-family="Arial,sans-serif" font-size="' + sfs + '" fill="' + C.amber + '">*****</text>' +
    '<text x="' + Math.round(w*0.10) + '" y="' + (qy+qfs*1.55*ql.length+Math.round(sfs*2.5)) + '" font-family="Arial,sans-serif" font-size="' + nfs + '" font-weight="bold" fill="' + C.grayMid + '">-- ' + esc(guest||'Verified Guest') + (destination?' - '+esc(destination):'') + '</text>';
  if (highlight) svg += '<text x="' + Math.round(w*0.10) + '" y="' + (qy+qfs*1.55*ql.length+Math.round(sfs*3.3)) + '" font-family="Arial,sans-serif" font-size="' + Math.round(nfs*0.88) + '" fill="' + C.white + '" opacity="0.65">' + esc(highlight.slice(0,65)) + '</text>';
  svg += overlayContact(w,h) + '</svg>';
  return svg;
}

function T4(w, h, d) {
  d = d || {};
  const animal = d.animal || 'Lion';
  const fact = d.fact || '';
  const destination = d.destination || 'Masai Mara';
  const hook = d.hook || '';
  const emoji = d.emoji || '';
  const ta = d._textAnchor || { x: Math.round(w*0.06), y: Math.round(h*0.48) };
  const by = Math.min(ta.y, Math.round(h*0.55));
  const afs=Math.round(w*0.088), hfs=Math.round(w*0.036), ffs=Math.round(w*0.026);
  const fl=wrap(fact,40).slice(0,4);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    grad(w,h,0.88) + logoPill(w,h) +
    '<rect x="' + Math.round(w*0.06) + '" y="' + by + '" width="' + Math.round(w*0.64) + '" height="' + Math.round(afs*1.55) + '" fill="' + C.amber + '" rx="' + Math.round(afs*0.22) + '"/>' +
    '<text x="' + (Math.round(w*0.06)+Math.round(w*0.32)) + '" y="' + (by+Math.round(afs*1.12)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + afs + '" font-weight="900" fill="' + C.dark + '">' + (emoji?esc(emoji)+' ':'') + esc(animal.toUpperCase()) + '</text>';
  if (hook) svg += '<text x="' + Math.round(w*0.06) + '" y="' + (by+Math.round(afs*1.55)+Math.round(hfs*1.6)) + '" font-family="Arial,sans-serif" font-size="' + hfs + '" font-weight="bold" fill="' + C.white + '">' + esc(hook.slice(0,50)) + '</text>';
  svg += '<text x="' + Math.round(w*0.06) + '" y="' + (by+Math.round(afs*1.55)+hfs*3.4) + '" font-family="Arial,sans-serif" font-size="' + ffs + '" fill="' + C.grayMid + '">' + esc(destination) + '</text>';
  fl.forEach(function(l,i){
    svg += '<text x="' + Math.round(w*0.06) + '" y="' + (Math.round(h*0.82)+ffs*1.7*i) + '" font-family="Arial,sans-serif" font-size="' + ffs + '" fill="' + C.white + '" opacity="0.80">' + esc(l) + '</text>';
  });
  svg += thinStrip(w,h) + '</svg>';
  return svg;
}

function T5(w, h, d) {
  d = d || {};
  const d1=d.destination1||'Masai Mara', d2=d.destination2||'Amboseli';
  const h1=d.hook1||'', h2=d.hook2||'', pn=d.packageName||'';
  const hl1=d.highlights1||[], hl2=d.highlights2||[];
  const topH=Math.round(h*0.10), bh=Math.round(h*0.12), mh=h-topH-bh, half=Math.round(w*0.5);
  const dfs=Math.round(w*0.048), hfs=Math.round(w*0.030), lfs=Math.round(w*0.024);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark2 + '"/>' +
    verticalBrand(w,h,topH) + familyBHeader(w,h,topH,pn||'Dual Destination Safari') +
    '<rect x="0" y="' + topH + '" width="' + half + '" height="' + mh + '" fill="rgba(45,106,79,0.14)"/>' +
    '<text x="' + Math.round(w*0.05) + '" y="' + (topH+Math.round(mh*0.16)) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + dfs + '" font-weight="900" fill="' + C.amber + '">' + esc(d1) + '</text>';
  if (h1) svg += '<text x="' + Math.round(w*0.05) + '" y="' + (topH+Math.round(mh*0.26)) + '" font-family="Arial,sans-serif" font-size="' + hfs + '" fill="' + C.white + '" opacity="0.90">' + esc(h1.slice(0,28)) + '</text>';
  hl1.slice(0,4).forEach(function(hl,i){
    svg += '<text x="' + Math.round(w*0.05) + '" y="' + (topH+Math.round(mh*0.38)+i*Math.round(lfs*2.1)) + '" font-family="Arial,sans-serif" font-size="' + lfs + '" fill="' + C.white + '" opacity="0.80">* ' + esc(hl) + '</text>';
  });
  svg += '<rect x="' + (half-1) + '" y="' + (topH+Math.round(mh*0.05)) + '" width="2" height="' + Math.round(mh*0.90) + '" fill="' + C.amber + '" opacity="0.35"/>' +
    '<rect x="' + half + '" y="' + topH + '" width="' + (w-half) + '" height="' + mh + '" fill="rgba(244,162,97,0.07)"/>' +
    '<text x="' + (half+Math.round(w*0.04)) + '" y="' + (topH+Math.round(mh*0.16)) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + dfs + '" font-weight="900" fill="' + C.amberLight + '">' + esc(d2) + '</text>';
  if (h2) svg += '<text x="' + (half+Math.round(w*0.04)) + '" y="' + (topH+Math.round(mh*0.26)) + '" font-family="Arial,sans-serif" font-size="' + hfs + '" fill="' + C.white + '" opacity="0.90">' + esc(h2.slice(0,28)) + '</text>';
  hl2.slice(0,4).forEach(function(hl,i){
    svg += '<text x="' + (half+Math.round(w*0.04)) + '" y="' + (topH+Math.round(mh*0.38)+i*Math.round(lfs*2.1)) + '" font-family="Arial,sans-serif" font-size="' + lfs + '" fill="' + C.white + '" opacity="0.80">* ' + esc(hl) + '</text>';
  });
  svg += ctaBand(w,h) + '</svg>';
  return svg;
}

function T6(w, h, d) {
  d = d || {};
  const act=d.activity||'Hot Air Balloon', dest=d.destination||'Masai Mara';
  const hook=d.hook||'', hls=d.highlights||[], emoji=d.emoji||'';
  const ta=d._textAnchor||{x:w/2,y:Math.round(h*0.38),anchor:'middle'};
  const afs=Math.round(w*0.052), hfs=Math.round(w*0.034), lfs=Math.round(w*0.026);
  const al=wrap(act,24).slice(0,2);
  const cy=Math.min(ta.y,Math.round(h*0.45));
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark2 + '"/>' + grad(w,h,0.60) + logoMark(w,h,'top-right');
  if (emoji) svg += '<text x="' + (w/2) + '" y="' + (cy-Math.round(afs*1.4)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.round(w*0.10) + '" opacity="0.85">' + esc(emoji) + '</text>';
  al.forEach(function(l,i){
    svg += '<text x="' + (w/2) + '" y="' + (cy+afs*1.3*i) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + afs + '" font-weight="900" fill="' + C.amber + '">' + esc(l.toUpperCase()) + '</text>';
  });
  svg += '<text x="' + (w/2) + '" y="' + (cy+afs*1.3*al.length+Math.round(hfs*1.2)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + hfs + '" fill="' + C.white + '">' + esc(dest) + '</text>';
  if (hook) svg += '<text x="' + (w/2) + '" y="' + (cy+afs*1.3*al.length+hfs*2.8) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.round(hfs*0.88) + '" fill="' + C.grayMid + '">' + esc(hook.slice(0,52)) + '</text>';
  hls.slice(0,3).forEach(function(hl,i){
    svg += '<text x="' + (w/2) + '" y="' + (Math.round(h*0.72)+i*Math.round(lfs*2.1)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + lfs + '" fill="' + C.white + '" opacity="0.80">* ' + esc(hl) + '</text>';
  });
  svg += '<rect x="' + Math.round(w*0.18) + '" y="' + Math.round(h*0.84) + '" width="' + Math.round(w*0.64) + '" height="' + Math.round(lfs*2.5) + '" fill="' + C.green + '" rx="' + Math.round(lfs*0.7) + '"/>' +
    '<text x="' + (w/2) + '" y="' + (Math.round(h*0.84)+Math.round(lfs*1.7)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.round(lfs*1.05) + '" font-weight="bold" fill="' + C.white + '">WhatsApp - ' + esc(PH) + '</text>' +
    overlayContact(w,h) + '</svg>';
  return svg;
}

function T7(w, h, d) {
  d = d || {};
  const headline=d.headline||'', body=d.body||'', hook=d.hook||'', cta=d.cta||'Book Your Safari';
  const ta=d._textAnchor||{x:w/2,y:Math.round(h*0.28),anchor:'middle'};
  const hfs=Math.round(w*0.068), bfs=Math.round(w*0.034), cfs=Math.round(w*0.036);
  const hl=wrap(headline||hook,20).slice(0,3), bl=wrap(body,32).slice(0,5);
  const hy=Math.min(ta.y,Math.round(h*0.35));
  const by2=hy+hfs*1.3*hl.length+Math.round(hfs);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    grad(w,h,0.90) + logoPill(w,h);
  hl.forEach(function(l,i){
    svg += '<text x="' + (w/2) + '" y="' + (hy+hfs*1.3*i) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + hfs + '" font-weight="900" fill="' + C.amber + '">' + esc(l) + '</text>';
  });
  bl.forEach(function(l,i){
    svg += '<text x="' + (w/2) + '" y="' + (by2+bfs*1.6*i) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + bfs + '" fill="' + C.white + '" opacity="0.90">' + esc(l) + '</text>';
  });
  svg += '<rect x="' + Math.round(w*0.12) + '" y="' + (h-Math.round(h*0.13)-Math.round(cfs*2.8)) + '" width="' + Math.round(w*0.76) + '" height="' + Math.round(cfs*2.6) + '" fill="' + C.amber + '" rx="' + Math.round(cfs*0.7) + '"/>' +
    '<text x="' + (w/2) + '" y="' + (h-Math.round(h*0.13)-Math.round(cfs*2.8)+Math.round(cfs*1.8)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + cfs + '" font-weight="900" fill="' + C.dark + '">' + esc(cta) + '</text>' +
    thinStrip(w,h) + '</svg>';
  return svg;
}

function T8(w, h, d) {
  d = d || {};
  const stats=d.stats||[], quote=d.quote||'', destination=d.destination||'';
  const topH=Math.round(h*0.10), bh=Math.round(h*0.12), mh=h-topH-bh;
  const nfs=Math.round(w*0.070), lfs=Math.round(w*0.026), qfs=Math.round(w*0.028);
  const items=stats.slice(0,3), cols=items.length||3, cw=Math.round((w*0.88)/cols);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark2 + '"/>' +
    verticalBrand(w,h,topH) + familyBHeader(w,h,topH,destination?esc(destination)+' Stats':'Safari by the Numbers');
  items.forEach(function(st,i){
    const cx=Math.round(w*0.06)+i*cw+Math.round(cw*0.5), sy=topH+Math.round(mh*0.22);
    svg += '<rect x="' + (Math.round(w*0.06)+i*cw) + '" y="' + (sy-Math.round(nfs*0.2)) + '" width="' + Math.round(cw*0.92) + '" height="' + Math.round(nfs*3) + '" fill="rgba(45,106,79,0.18)" rx="' + Math.round(w*0.02) + '"/>' +
      '<text x="' + cx + '" y="' + (sy+nfs) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + nfs + '" font-weight="900" fill="' + C.amber + '">' + esc(st.value||'') + '</text>' +
      '<text x="' + cx + '" y="' + (sy+nfs+Math.round(lfs*1.6)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + lfs + '" fill="' + C.white + '" opacity="0.80">' + esc((st.label||'').toUpperCase()) + '</text>';
  });
  if (quote) svg += '<text x="' + (w/2) + '" y="' + (topH+Math.round(mh*0.78)) + '" text-anchor="middle" font-family="Georgia,serif" font-size="' + qfs + '" fill="' + C.grayMid + '" font-style="italic">"' + esc(quote.slice(0,60)) + '"</text>';
  svg += ctaBand(w,h) + '</svg>';
  return svg;
}

function T9(w, h, d) {
  d = d || {};
  const packageName=d.packageName||'', days=d.days||[], destination=d.destination||'';
  const topH=Math.round(h*0.10), bh=Math.round(h*0.12), mh=h-topH-bh;
  const dfs=Math.round(w*0.030), afs=Math.round(w*0.026);
  const items=days.slice(0,5), rh=Math.round(mh/Math.max(items.length+1,5));
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark2 + '"/>' +
    verticalBrand(w,h,topH) + familyBHeader(w,h,topH,packageName||'Safari Itinerary');
  if (destination) svg += '<text x="' + Math.round(w*0.07) + '" y="' + (topH+Math.round(rh*0.7)) + '" font-family="Arial,sans-serif" font-size="' + afs + '" fill="' + C.grayMid + '">' + esc(destination) + '</text>';
  items.forEach(function(dy,i){
    const ry=topH+rh*(i+1), ev=i%2===0;
    svg += '<rect x="' + Math.round(w*0.04) + '" y="' + ry + '" width="' + Math.round(w*0.92) + '" height="' + Math.round(rh*0.82) + '" fill="' + (ev?'rgba(45,106,79,0.15)':'rgba(244,162,97,0.07)') + '" rx="' + Math.round(w*0.015) + '"/>' +
      '<rect x="' + Math.round(w*0.04) + '" y="' + ry + '" width="' + Math.round(w*0.005) + '" height="' + Math.round(rh*0.82) + '" fill="' + (ev?C.amber:C.green) + '"/>' +
      '<text x="' + Math.round(w*0.07) + '" y="' + (ry+Math.round(rh*0.50)) + '" font-family="Arial Black,Arial,sans-serif" font-size="' + dfs + '" font-weight="900" fill="' + C.amber + '">DAY ' + esc(dy.day||i+1) + '</text>' +
      '<text x="' + Math.round(w*0.21) + '" y="' + (ry+Math.round(rh*0.50)) + '" font-family="Arial,sans-serif" font-size="' + afs + '" fill="' + C.white + '" opacity="0.90">' + esc((dy.activity||'').slice(0,42)) + '</text>';
  });
  svg += ctaBand(w,h) + '</svg>';
  return svg;
}

function T10(w, h, d) {
  d = d || {};
  const offerTitle=d.offerTitle||'Special Offer', price=d.price||'';
  const duration=d.duration||'', inclusions=d.inclusions||[];
  const destination=d.destination||'', urgency=d.urgency||'';
  const ta=d._textAnchor||{x:Math.round(w*0.06),y:Math.round(h*0.30)};
  const tfs=Math.round(w*0.056), pfs=Math.round(w*0.070), ifs=Math.round(w*0.026), ufs=Math.round(w*0.028);
  const cy=Math.min(ta.y,Math.round(h*0.35));
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="' + C.dark2 + '"/>' + grad(w,h,0.70) + logoMark(w,h,'top-right') +
    '<text x="' + Math.round(w*0.06) + '" y="' + cy + '" font-family="Arial Black,Arial,sans-serif" font-size="' + tfs + '" font-weight="900" fill="' + C.white + '">' + esc(offerTitle.toUpperCase()) + '</text>';
  if (destination) svg += '<text x="' + Math.round(w*0.06) + '" y="' + (cy+Math.round(tfs*1.4)) + '" font-family="Arial,sans-serif" font-size="' + ifs + '" fill="' + C.grayMid + '">' + esc(destination) + (duration?' - '+esc(duration):'') + '</text>';
  if (price) svg += '<rect x="' + Math.round(w*0.06) + '" y="' + (cy+Math.round(tfs*2.0)) + '" width="' + Math.round(w*0.50) + '" height="' + Math.round(pfs*1.7) + '" fill="' + C.green + '" rx="' + Math.round(w*0.02) + '"/>' +
    '<text x="' + (Math.round(w*0.06)+Math.round(w*0.25)) + '" y="' + (cy+Math.round(tfs*2.0)+Math.round(pfs*1.22)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + pfs + '" font-weight="900" fill="' + C.white + '">' + esc(price) + '</text>' +
    '<text x="' + (Math.round(w*0.06)+Math.round(w*0.25)) + '" y="' + (cy+Math.round(tfs*2.0)+Math.round(pfs*1.22)+Math.round(ifs*1.5)) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + ifs + '" fill="' + C.cream + '">per person</text>';
  inclusions.slice(0,5).forEach(function(inc,i){
    svg += '<text x="' + Math.round(w*0.06) + '" y="' + (Math.round(h*0.60)+i*Math.round(ifs*2.0)) + '" font-family="Arial,sans-serif" font-size="' + ifs + '" fill="' + C.white + '" opacity="0.88">+ ' + esc(inc) + '</text>';
  });
  if (urgency) svg += '<rect x="' + Math.round(w*0.06) + '" y="' + Math.round(h*0.82) + '" width="' + Math.round(w*0.88) + '" height="' + Math.round(ufs*2.4) + '" fill="' + C.amberDark + '" rx="' + Math.round(ufs*0.5) + '"/>' +
    '<text x="' + (w/2) + '" y="' + (Math.round(h*0.82)+Math.round(ufs*1.65)) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="' + ufs + '" font-weight="900" fill="' + C.white + '">' + esc(urgency) + '</text>';
  svg += overlayContact(w,h) + '</svg>';
  return svg;
}

const TEMPLATE_MAP = {
  hero_destination:T1, package:T2, package_promo:T2, safari_package:T2,
  testimonial:T3, wildlife_spotlight:T4,
  twin_destination:T5, dual_destination:T5,
  activity:T6, story:T7,
  stats:T8, conservation:T8, guide_spotlight:T8,
  itinerary:T9, offer:T10, pricing:T10, promo_flash:T10,
};

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

  resolvedData._textAnchor = zoneToCoords(imageAnalysis.safeTextZone || 'bottom_left', w, h);

  const fn     = TEMPLATE_MAP[template] || T1;
  const svgBuf = Buffer.from(fn(w, h, resolvedData));
  const outName = 'lavira_card_' + template + '_' + profile + '_' + uuid().slice(0,8) + '.jpg';
  const outPath = path.join(cfg.OUTPUTS_DIR, outName);
  fs.mkdirSync(cfg.OUTPUTS_DIR, { recursive: true });

  let pipeline;
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    pipeline = sharp(backgroundImage).resize(w, h, { fit:'cover', position:'centre' }).modulate({ saturation:1.12 }).composite([{ input:svgBuf, blend:'over' }]);
  } else {
    const bg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#0F1C17"/></svg>');
    pipeline = sharp(bg).composite([{ input:svgBuf, blend:'over' }]);
  }

  await pipeline.jpeg({ quality: 94 }).toFile(outPath);
  return {
    filename: outName, path: outPath, downloadUrl: '/outputs/' + outName,
    resolution: w + 'x' + h, template, profile,
    imageAnalysis: imageAnalysis.analysed ? { mood:imageAnalysis.mood, timeOfDay:imageAnalysis.timeOfDay, season:imageAnalysis.season, safeTextZone:imageAnalysis.safeTextZone, entities:imageAnalysis.entities, confidence:imageAnalysis.confidence } : null,
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
  const pkg  = pkgs.find(function(p){ return p.destinations && p.destinations.includes(dest); }) || {};
  const testi = BRAND.testimonials || [];
  const t = testi[Math.floor(Math.random() * testi.length)] || {};
  const wildlife = prof.wildlife || ['elephant','lion','cheetah'];
  const dests = BRAND.destinations || [];
  switch (template) {
    case 'hero_destination': return { destination:dest, hook:prof.highlight||'Discover '+dest, highlight:prof.headline||'', packageName:pkg.name||'', packageDuration:pkg.duration||'' };
    case 'safari_package': case 'package': case 'package_promo': return { packageName:pkg.name||dest+' Safari', duration:pkg.duration||'3 days', destinations:pkg.destinations||[dest], highlights:pkg.highlights||wildlife.slice(0,4), destination:dest };
    case 'testimonial': return { quote:t.quote||'An absolutely unforgettable experience with Lavira Safaris.', guest:t.guest||'Safari Guest', highlight:t.highlight||'', destination:dest };
    case 'wildlife_spotlight': return { animal:(wildlife[0]||'Elephant'), fact:prof.highlight||'Spot the Big Five in '+dest, destination:dest, hook:'This week in '+dest, emoji:'' };
    case 'dual_destination': case 'twin_destination': { const d2=dests.find(function(d){return d!==dest;})||'Amboseli', p2=(BRAND.destination_profiles||{})[d2]||{}; return { destination1:dest, destination2:d2, hook1:(prof.highlight||'').slice(0,30), hook2:(p2.highlight||'').slice(0,30), highlights1:(prof.wildlife||[]).slice(0,3), highlights2:(p2.wildlife||[]).slice(0,3), packageName:dest+' & '+d2+' Safari' }; }
    case 'activity': return { activity:(prof.activities&&prof.activities[0])||'Game Drive', destination:dest, hook:prof.highlight||'Discover '+dest, highlights:prof.activities||wildlife.slice(0,3), emoji:'🦁' };
    case 'story': return { headline:BRAND.tagline||'Making Your Safari Experience Memorable', body:prof.highlight||'The ultimate African wildlife experience.', hook:prof.headline||'', cta:'Book Your Safari', destination:dest };
    case 'stats': case 'guide_spotlight': case 'conservation': return { destination:dest, stats:[{value:'13+',label:'Destinations'},{value:'14',label:'Packages'},{value:'⭐4.9',label:'Guest Rating'}], quote:prof.highlight||'' };
    case 'promo_flash': case 'offer': case 'pricing': return { destination:dest, hook:'This Week — '+dest+' Safari', price:'', inclusions:pkg.highlights||wildlife.slice(0,4), urgency:'Limited Spots — Book Now on WhatsApp' };
    default: return { destination:dest, hook:'Experience '+dest+' with Lavira Safaris' };
  }
}

module.exports = { renderCard, renderAllProfiles, buildDefaultData, TEMPLATE_MAP, SIZES };
