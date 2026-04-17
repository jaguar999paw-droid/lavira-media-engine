// src/engines/card-templates.js — Lavira Card Template Engine v2
// 10 modern SVG templates, strict z-indexing, no content overlap, fixed platform sizes
'use strict';
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const { v4: uuid } = require('uuid');
const cfg   = require('../config');
const BRAND = require('../orchestrator/brand');

const C = {
  green:'#2D6A4F', greenDark:'#1B4332', greenLight:'#40916C',
  amber:'#F4A261', amberDark:'#E07A2F', amberLight:'#FBBF77',
  dark:'#0A1612',  dark2:'#0F1C17',
  white:'#FFFFFF',  cream:'#FEF9EF',
  grayMid:'#9fd3aa', grayDim:'#6B8F71',
};
const BN = BRAND.name||'Lavira Safaris';
const TL = BRAND.tagline||'Making Your Safari Memorable';
const PH = BRAND.phone||'+254 721 757 387';
const WB = BRAND.website||'https://lavirasafaris.com';
const EM = BRAND.email||'info@lavirasafaris.com';
const IG = BRAND.socials&&BRAND.socials.instagram||'@lavirasafaris';

const SIZES = {
  instagram_post:[1080,1080], instagram_story:[1080,1920],
  instagram_portrait:[1080,1350], facebook:[1200,628],
  facebook_story:[1080,1920], twitter_card:[1200,628],
  tiktok:[1080,1920], whatsapp:[1080,1080], youtube_thumb:[1280,720],
};

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function wrap(text,max){ const ws=String(text||'').split(' '),ls=[]; let l=''; for(const w of ws){ if((l+' '+w).trim().length>max){if(l)ls.push(l.trim());l=w;}else l=(l+' '+w).trim(); } if(l)ls.push(l.trim()); return ls; }

function topBar(w,h,topH,sub){
  const r=Math.round(topH*0.33), lx=Math.round(w*0.05)+r, ly=Math.round(topH*0.5);
  const nfs=Math.round(topH*0.28), sfs=Math.round(topH*0.20);
  return `<rect x="0" y="0" width="${w}" height="${topH}" fill="${C.dark}" opacity="0.94"/>
  <circle cx="${lx}" cy="${ly}" r="${r}" fill="${C.amber}"/>
  <text x="${lx}" y="${ly+Math.round(r*0.38)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${Math.round(r*1.1)}" font-weight="900" fill="${C.dark}">L</text>
  <text x="${lx+r+Math.round(w*0.022)}" y="${Math.round(topH*0.46)}" font-family="Arial Black,Arial,sans-serif" font-size="${nfs}" font-weight="900" fill="${C.white}" letter-spacing="1">${esc(BN)}</text>
  <text x="${lx+r+Math.round(w*0.022)}" y="${Math.round(topH*0.77)}" font-family="Arial,sans-serif" font-size="${sfs}" fill="${C.amber}">${esc(sub||TL)}</text>`;
}

function botBar(w,h,bh){
  const y=h-bh, f1=Math.round(bh*0.26), f2=Math.round(bh*0.21);
  return `<rect x="0" y="${y}" width="${w}" height="${bh}" fill="${C.dark}" opacity="0.96"/>
  <rect x="0" y="${y}" width="${Math.round(w*0.004)}" height="${bh}" fill="${C.amber}"/>
  <text x="${Math.round(w*0.04)}" y="${y+Math.round(bh*0.42)}" font-family="Arial,sans-serif" font-size="${f1}" font-weight="bold" fill="${C.amber}">&#x1F4DE; ${esc(PH)}</text>
  <text x="${Math.round(w*0.04)}" y="${y+Math.round(bh*0.75)}" font-family="Arial,sans-serif" font-size="${f2}" fill="${C.white}" opacity="0.85">&#x1F310; ${esc(WB)}</text>
  <text x="${w-Math.round(w*0.04)}" y="${y+Math.round(bh*0.75)}" text-anchor="end" font-family="Arial,sans-serif" font-size="${f2}" fill="${C.amber}" opacity="0.85">&#x1F4F8; ${esc(IG)}</text>`;
}

function grad(w,h,s=0.88){
  return `<defs><linearGradient id="g${w}${h}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="rgba(10,22,18,0)"/>
  <stop offset="45%" stop-color="rgba(10,22,18,${Math.round(s*0.4*100)/100})"/>
  <stop offset="100%" stop-color="rgba(10,22,18,${s})"/>
  </linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g${w}${h})"/>`;
}

function accentLine(w,topH){ return `<rect x="0" y="${topH}" width="${w}" height="3" fill="${C.amber}" opacity="0.8"/>`; }

// T1: Hero Destination
function T1(w,h,d={}){
  const {destination='Masai Mara',hook='',highlight='',packageName='',packageDuration=''}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.13), cy=Math.round(h*0.52);
  const dfs=Math.round(w*0.072), hfs=Math.round(w*0.038), sfs=Math.round(w*0.024), pfs=Math.round(w*0.022);
  const hl=wrap(hook,38).slice(0,2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  ${grad(w,h,0.88)}${topBar(w,h,th,'Safari Destination')}${accentLine(w,th)}
  <text x="${Math.round(w*0.06)}" y="${cy+dfs}" font-family="Arial Black,Arial,sans-serif" font-size="${dfs}" font-weight="900" fill="${C.amber}" letter-spacing="2">${esc(destination.toUpperCase())}</text>
  ${hl.map((l,i)=>`<text x="${Math.round(w*0.06)}" y="${cy+dfs+Math.round(hfs*1.6)*(i+1)}" font-family="Arial,sans-serif" font-size="${hfs}" font-weight="bold" fill="${C.white}">${esc(l)}</text>`).join('')}
  ${highlight?`<text x="${Math.round(w*0.06)}" y="${cy+dfs+hfs*1.6*hl.length+sfs*2}" font-family="Arial,sans-serif" font-size="${sfs}" fill="${C.grayMid}">&#x2726; ${esc(highlight.slice(0,70))}</text>`:''}
  ${packageName?`<rect x="${Math.round(w*0.06)}" y="${h-bh-pfs*3}" width="${Math.round(w*0.7)}" height="${Math.round(pfs*2.2)}" fill="${C.green}" rx="${Math.round(pfs*0.6)}"/>
  <text x="${Math.round(w*0.06+w*0.35)}" y="${h-bh-pfs*3+Math.round(pfs*1.5)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${pfs}" font-weight="bold" fill="${C.white}">&#x1F4CB; ${esc(packageName)}${packageDuration?' &#xB7; '+esc(packageDuration):''}</text>`:''}
  ${botBar(w,h,bh)}</svg>`;
}

// T2: Package Card - two-column
function T2(w,h,d={}){
  const {packageName='Safari Package',duration='3 days',destinations=[],highlights=[],destination=''}=d;
  const th=Math.round(h*0.13), bh=Math.round(h*0.13), mh=h-th-bh;
  const pfs=Math.round(w*0.046), hfs=Math.round(w*0.027), dfs=Math.round(w*0.026);
  const dx=Math.round(w*0.5);
  const allD=[...new Set([destination,...(destinations||[])].filter(Boolean))];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark2}"/>
  ${topBar(w,h,th,'Safari Packages')}${accentLine(w,th)}
  <rect x="0" y="${th}" width="${Math.round(w*0.005)}" height="${mh}" fill="${C.amber}"/>
  <text x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.18)}" font-family="Arial Black,Arial,sans-serif" font-size="${pfs}" font-weight="900" fill="${C.amber}">${esc(packageName)}</text>
  <text x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.28)}" font-family="Arial,sans-serif" font-size="${dfs}" fill="${C.grayMid}">&#x23F1; ${esc(duration)}</text>
  ${allD.slice(0,3).map((dd,i)=>`<text x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.38)+i*Math.round(dfs*1.8)}" font-family="Arial,sans-serif" font-size="${dfs}" fill="${C.white}" opacity="0.85">&#x1F4CD; ${esc(dd)}</text>`).join('')}
  <rect x="${dx}" y="${th+Math.round(mh*0.05)}" width="1" height="${Math.round(mh*0.88)}" fill="${C.amber}" opacity="0.25"/>
  <text x="${dx+Math.round(w*0.04)}" y="${th+Math.round(mh*0.10)}" font-family="Arial,sans-serif" font-size="${Math.round(hfs*0.9)}" fill="${C.amber}" font-weight="bold">HIGHLIGHTS</text>
  ${(highlights||[]).slice(0,6).map((hl,i)=>`<text x="${dx+Math.round(w*0.04)}" y="${th+Math.round(mh*0.18)+i*Math.round(hfs*2.1)}" font-family="Arial,sans-serif" font-size="${hfs}" fill="${C.white}" opacity="0.92">&#x2726; ${esc(hl)}</text>`).join('')}
  <rect x="0" y="${h-bh}" width="${w}" height="${bh}" fill="${C.green}"/>
  <text x="${w/2}" y="${h-bh+Math.round(bh*0.42)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${Math.round(bh*0.28)}" font-weight="900" fill="${C.white}">BOOK THIS SAFARI</text>
  <text x="${w/2}" y="${h-bh+Math.round(bh*0.73)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(bh*0.22)}" fill="${C.cream}">WhatsApp ${esc(PH)} &#xB7; ${esc(WB)}</text>
  </svg>`;
}

// T3: Testimonial
function T3(w,h,d={}){
  const {quote='',guest='',highlight='',destination=''}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.12);
  const qfs=Math.round(w*0.038), nfs=Math.round(w*0.028), sfs=Math.round(w*0.040);
  const ql=wrap(quote,36).slice(0,5), qy=Math.round(h*0.30);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark}"/>
  <rect x="0" y="${th}" width="${Math.round(w*0.005)}" height="${h-th-bh}" fill="${C.amber}"/>
  ${topBar(w,h,th,'Guest Experience')}${accentLine(w,th)}
  <text x="${Math.round(w*0.06)}" y="${qy-Math.round(w*0.01)}" font-family="Georgia,serif" font-size="${Math.round(w*0.14)}" fill="${C.amber}" opacity="0.15">"</text>
  ${ql.map((l,i)=>`<text x="${Math.round(w*0.10)}" y="${qy+qfs*1.55*i}" font-family="Georgia,serif" font-size="${qfs}" fill="${C.white}" opacity="0.96" font-style="italic">${esc(l)}</text>`).join('')}
  <text x="${Math.round(w*0.10)}" y="${qy+qfs*1.55*ql.length+Math.round(sfs*1.3)}" font-family="Arial,sans-serif" font-size="${sfs}" fill="${C.amber}">&#x2605;&#x2605;&#x2605;&#x2605;&#x2605;</text>
  <text x="${Math.round(w*0.10)}" y="${qy+qfs*1.55*ql.length+Math.round(sfs*2.5)}" font-family="Arial,sans-serif" font-size="${nfs}" font-weight="bold" fill="${C.grayMid}">&#x2014; ${esc(guest||'Verified Guest')}${destination?'  &#xB7;  '+esc(destination):''}</text>
  ${highlight?`<text x="${Math.round(w*0.10)}" y="${qy+qfs*1.55*ql.length+Math.round(sfs*3.3)}" font-family="Arial,sans-serif" font-size="${Math.round(nfs*0.88)}" fill="${C.white}" opacity="0.65">${esc(highlight.slice(0,65))}</text>`:''}
  ${botBar(w,h,bh)}</svg>`;
}

// T4: Wildlife Spotlight
function T4(w,h,d={}){
  const {animal='Lion',fact='',destination='Masai Mara',hook='',emoji=''}=d;
  const th=Math.round(h*0.10), bh=Math.round(h*0.12), by=Math.round(h*0.54);
  const afs=Math.round(w*0.088), hfs=Math.round(w*0.036), ffs=Math.round(w*0.026);
  const fl=wrap(fact,40).slice(0,4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  ${grad(w,h,0.90)}${topBar(w,h,th,'Wildlife Spotlight')}${accentLine(w,th)}
  <rect x="${Math.round(w*0.06)}" y="${by}" width="${Math.round(w*0.64)}" height="${Math.round(afs*1.55)}" fill="${C.amber}" rx="${Math.round(afs*0.22)}"/>
  <text x="${Math.round(w*0.06+w*0.32)}" y="${by+Math.round(afs*1.12)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${afs}" font-weight="900" fill="${C.dark}">${emoji?esc(emoji)+' ':''}${esc(animal.toUpperCase())}</text>
  ${hook?`<text x="${Math.round(w*0.06)}" y="${by+Math.round(afs*1.55)+Math.round(hfs*1.6)}" font-family="Arial,sans-serif" font-size="${hfs}" font-weight="bold" fill="${C.white}">${esc(hook.slice(0,50))}</text>`:''}
  <text x="${Math.round(w*0.06)}" y="${by+Math.round(afs*1.55)+hfs*3.4}" font-family="Arial,sans-serif" font-size="${ffs}" fill="${C.grayMid}">&#x1F4CD; ${esc(destination)}</text>
  ${fl.map((l,i)=>`<text x="${Math.round(w*0.06)}" y="${Math.round(h*0.82)+ffs*1.7*i}" font-family="Arial,sans-serif" font-size="${ffs}" fill="${C.white}" opacity="0.80">${esc(l)}</text>`).join('')}
  ${botBar(w,h,bh)}</svg>`;
}

// T5: Twin Destination
function T5(w,h,d={}){
  const {destination1='Masai Mara',destination2='Amboseli',hook1='',hook2='',packageName='',highlights1=[],highlights2=[]}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.12), mh=h-th-bh, half=Math.round(w*0.5);
  const dfs=Math.round(w*0.048), hfs=Math.round(w*0.030), lfs=Math.round(w*0.024);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark2}"/>
  ${topBar(w,h,th,packageName||'Dual Destination Safari')}${accentLine(w,th)}
  <rect x="0" y="${th}" width="${half}" height="${mh}" fill="rgba(45,106,79,0.14)"/>
  <rect x="0" y="${th}" width="${Math.round(w*0.005)}" height="${mh}" fill="${C.amber}"/>
  <text x="${Math.round(w*0.05)}" y="${th+Math.round(mh*0.18)}" font-family="Arial Black,Arial,sans-serif" font-size="${dfs}" font-weight="900" fill="${C.amber}">${esc(destination1)}</text>
  ${hook1?`<text x="${Math.round(w*0.05)}" y="${th+Math.round(mh*0.28)}" font-family="Arial,sans-serif" font-size="${hfs}" fill="${C.white}" opacity="0.90">${esc(hook1.slice(0,28))}</text>`:''}
  ${(highlights1||[]).slice(0,4).map((hl,i)=>`<text x="${Math.round(w*0.05)}" y="${th+Math.round(mh*0.40)+i*Math.round(lfs*2.1)}" font-family="Arial,sans-serif" font-size="${lfs}" fill="${C.white}" opacity="0.80">&#x2726; ${esc(hl)}</text>`).join('')}
  <rect x="${half-1}" y="${th+Math.round(mh*0.05)}" width="2" height="${Math.round(mh*0.90)}" fill="${C.amber}" opacity="0.35"/>
  <rect x="${half}" y="${th}" width="${w-half}" height="${mh}" fill="rgba(244,162,97,0.07)"/>
  <text x="${half+Math.round(w*0.04)}" y="${th+Math.round(mh*0.18)}" font-family="Arial Black,Arial,sans-serif" font-size="${dfs}" font-weight="900" fill="${C.amberLight}">${esc(destination2)}</text>
  ${hook2?`<text x="${half+Math.round(w*0.04)}" y="${th+Math.round(mh*0.28)}" font-family="Arial,sans-serif" font-size="${hfs}" fill="${C.white}" opacity="0.90">${esc(hook2.slice(0,28))}</text>`:''}
  ${(highlights2||[]).slice(0,4).map((hl,i)=>`<text x="${half+Math.round(w*0.04)}" y="${th+Math.round(mh*0.40)+i*Math.round(lfs*2.1)}" font-family="Arial,sans-serif" font-size="${lfs}" fill="${C.white}" opacity="0.80">&#x2726; ${esc(hl)}</text>`).join('')}
  ${botBar(w,h,bh)}</svg>`;
}

// T6: Activity Card
function T6(w,h,d={}){
  const {activity='Hot Air Balloon',destination='Masai Mara',hook='',highlights=[],emoji=''}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.12), mh=h-th-bh;
  const afs=Math.round(w*0.052), hfs=Math.round(w*0.034), lfs=Math.round(w*0.026);
  const al=wrap(activity,24).slice(0,2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark2}"/>
  ${topBar(w,h,th,'Adventure Activity')}${accentLine(w,th)}
  ${emoji?`<text x="${w/2}" y="${th+Math.round(mh*0.22)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(w*0.10)}" opacity="0.85">${esc(emoji)}</text>`:''}
  ${al.map((l,i)=>`<text x="${w/2}" y="${th+Math.round(mh*0.38)+afs*1.3*i}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${afs}" font-weight="900" fill="${C.amber}">${esc(l.toUpperCase())}</text>`).join('')}
  <text x="${w/2}" y="${th+Math.round(mh*0.38)+afs*1.3*al.length+Math.round(hfs*1.2)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${hfs}" fill="${C.white}">&#x1F4CD; ${esc(destination)}</text>
  ${hook?`<text x="${w/2}" y="${th+Math.round(mh*0.38)+afs*1.3*al.length+hfs*2.8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(hfs*0.88)}" fill="${C.grayMid}">${esc(hook.slice(0,52))}</text>`:''}
  ${(highlights||[]).slice(0,3).map((hl,i)=>`<text x="${w/2}" y="${th+Math.round(mh*0.68)+i*Math.round(lfs*2.1)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${lfs}" fill="${C.white}" opacity="0.80">&#x2726; ${esc(hl)}</text>`).join('')}
  <rect x="${Math.round(w*0.20)}" y="${h-bh-Math.round(lfs*3.5)}" width="${Math.round(w*0.60)}" height="${Math.round(lfs*2.5)}" fill="${C.green}" rx="${Math.round(lfs*0.7)}"/>
  <text x="${w/2}" y="${h-bh-Math.round(lfs*3.5)+Math.round(lfs*1.7)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(lfs*1.05)}" font-weight="bold" fill="${C.white}">Book via WhatsApp &#xB7; ${esc(PH)}</text>
  ${botBar(w,h,bh)}</svg>`;
}

// T7: Story Post
function T7(w,h,d={}){
  const {headline='',body='',destination='',hook='',cta='Swipe Up to Book'}=d;
  const th=Math.round(h*0.09), bh=Math.round(h*0.10);
  const hfs=Math.round(w*0.068), bfs=Math.round(w*0.034), cfs=Math.round(w*0.036);
  const hl=wrap(headline,20).slice(0,3), bl=wrap(body,32).slice(0,5);
  const hy=Math.round(h*0.28), by2=hy+hfs*1.3*hl.length+Math.round(hfs);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  ${grad(w,h,0.92)}${topBar(w,h,th,destination||BN)}${accentLine(w,th)}
  ${hl.map((l,i)=>`<text x="${w/2}" y="${hy+hfs*1.3*i}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${hfs}" font-weight="900" fill="${C.amber}">${esc(l)}</text>`).join('')}
  ${bl.map((l,i)=>`<text x="${w/2}" y="${by2+bfs*1.6*i}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${bfs}" fill="${C.white}" opacity="0.90">${esc(l)}</text>`).join('')}
  <rect x="${Math.round(w*0.15)}" y="${h-bh-Math.round(cfs*4)}" width="${Math.round(w*0.70)}" height="${Math.round(cfs*2.6)}" fill="${C.amber}" rx="${Math.round(cfs*0.7)}"/>
  <text x="${w/2}" y="${h-bh-Math.round(cfs*4)+Math.round(cfs*1.8)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${cfs}" font-weight="900" fill="${C.dark}">${esc(cta)} &#x2191;</text>
  ${botBar(w,h,bh)}</svg>`;
}

// T8: Stats Card
function T8(w,h,d={}){
  const {stats=[],quote='',destination=''}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.12), mh=h-th-bh;
  const nfs=Math.round(w*0.070), lfs=Math.round(w*0.026), qfs=Math.round(w*0.028);
  const items=(stats||[]).slice(0,3), cols=items.length||3, cw=Math.round((w*0.88)/cols);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark2}"/>
  ${topBar(w,h,th,destination?esc(destination)+' by the Numbers':'Safari by the Numbers')}${accentLine(w,th)}
  ${items.map((st,i)=>{ const cx=Math.round(w*0.06)+i*cw+Math.round(cw*0.5), sy=th+Math.round(mh*0.25);
    return `<rect x="${Math.round(w*0.06)+i*cw}" y="${sy-Math.round(nfs*0.2)}" width="${Math.round(cw*0.92)}" height="${Math.round(nfs*3)}" fill="rgba(45,106,79,0.18)" rx="${Math.round(w*0.02)}"/>
    <text x="${cx}" y="${sy+nfs}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${nfs}" font-weight="900" fill="${C.amber}">${esc(st.value||'')}</text>
    <text x="${cx}" y="${sy+nfs+Math.round(lfs*1.6)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${lfs}" fill="${C.white}" opacity="0.80">${esc((st.label||'').toUpperCase())}</text>`; }).join('')}
  ${quote?`<text x="${w/2}" y="${th+Math.round(mh*0.75)}" text-anchor="middle" font-family="Georgia,serif" font-size="${qfs}" fill="${C.grayMid}" font-style="italic">"${esc(quote.slice(0,60))}"</text>`:''}
  ${botBar(w,h,bh)}</svg>`;
}

// T9: Itinerary Card
function T9(w,h,d={}){
  const {packageName='',days=[],destination=''}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.12), mh=h-th-bh;
  const dfs=Math.round(w*0.030), afs=Math.round(w*0.026);
  const items=(days||[]).slice(0,5), rh=Math.round(mh/Math.max(items.length+1,5));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark2}"/>
  ${topBar(w,h,th,packageName||'Safari Itinerary')}${accentLine(w,th)}
  ${destination?`<text x="${Math.round(w*0.06)}" y="${th+Math.round(rh*0.7)}" font-family="Arial,sans-serif" font-size="${afs}" fill="${C.grayMid}">&#x1F4CD; ${esc(destination)}</text>`:''}
  ${items.map((dy,i)=>{ const ry=th+rh*(i+1), ev=i%2===0;
    return `<rect x="${Math.round(w*0.04)}" y="${ry}" width="${Math.round(w*0.92)}" height="${Math.round(rh*0.82)}" fill="${ev?'rgba(45,106,79,0.15)':'rgba(244,162,97,0.07)'}" rx="${Math.round(w*0.015)}"/>
    <rect x="${Math.round(w*0.04)}" y="${ry}" width="${Math.round(w*0.005)}" height="${Math.round(rh*0.82)}" fill="${ev?C.amber:C.green}"/>
    <text x="${Math.round(w*0.07)}" y="${ry+Math.round(rh*0.50)}" font-family="Arial Black,Arial,sans-serif" font-size="${dfs}" font-weight="900" fill="${C.amber}">DAY ${esc(dy.day||i+1)}</text>
    <text x="${Math.round(w*0.21)}" y="${ry+Math.round(rh*0.50)}" font-family="Arial,sans-serif" font-size="${afs}" fill="${C.white}" opacity="0.90">${esc((dy.activity||'').slice(0,42))}</text>`; }).join('')}
  ${botBar(w,h,bh)}</svg>`;
}

// T10: Offer Card
function T10(w,h,d={}){
  const {offerTitle='Special Offer',price='',duration='',inclusions=[],destination='',urgency=''}=d;
  const th=Math.round(h*0.11), bh=Math.round(h*0.12), mh=h-th-bh;
  const tfs=Math.round(w*0.056), pfs=Math.round(w*0.070), ifs=Math.round(w*0.026), ufs=Math.round(w*0.028);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${C.dark2}"/>
  ${topBar(w,h,th,'Exclusive Offer')}${accentLine(w,th)}
  <text x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.16)}" font-family="Arial Black,Arial,sans-serif" font-size="${tfs}" font-weight="900" fill="${C.white}">${esc(offerTitle.toUpperCase())}</text>
  ${destination?`<text x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.24)}" font-family="Arial,sans-serif" font-size="${ifs}" fill="${C.grayMid}">&#x1F4CD; ${esc(destination)}${duration?' &#xB7; '+esc(duration):''}</text>`:''}
  ${price?`<rect x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.29)}" width="${Math.round(w*0.50)}" height="${Math.round(pfs*1.7)}" fill="${C.green}" rx="${Math.round(w*0.02)}"/>
  <text x="${Math.round(w*0.06+w*0.25)}" y="${th+Math.round(mh*0.29)+Math.round(pfs*1.22)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${pfs}" font-weight="900" fill="${C.white}">${esc(price)}</text>
  <text x="${Math.round(w*0.06+w*0.25)}" y="${th+Math.round(mh*0.29)+Math.round(pfs*1.22)+Math.round(ifs*1.5)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${ifs}" fill="${C.cream}">per person</text>`:''}
  ${(inclusions||[]).slice(0,5).map((inc,i)=>`<text x="${Math.round(w*0.06)}" y="${th+Math.round(mh*0.56)+i*Math.round(ifs*2.0)}" font-family="Arial,sans-serif" font-size="${ifs}" fill="${C.white}" opacity="0.88">&#x2714; ${esc(inc)}</text>`).join('')}
  ${urgency?`<rect x="${Math.round(w*0.06)}" y="${h-bh-Math.round(ufs*3.2)}" width="${Math.round(w*0.88)}" height="${Math.round(ufs*2.4)}" fill="${C.amberDark}" rx="${Math.round(ufs*0.5)}"/>
  <text x="${w/2}" y="${h-bh-Math.round(ufs*3.2)+Math.round(ufs*1.65)}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${ufs}" font-weight="900" fill="${C.white}">&#x26A1; ${esc(urgency)}</text>`:''}
  ${botBar(w,h,bh)}</svg>`;
}

const TEMPLATE_MAP = {
  hero_destination:T1, package:T2, package_promo:T2, safari_package:T2,
  testimonial:T3, wildlife_spotlight:T4,
  twin_destination:T5, dual_destination:T5,
  activity:T6, story:T7,
  stats:T8, conservation:T8, guide_spotlight:T8,
  itinerary:T9, offer:T10, pricing:T10, promo_flash:T10,
};

async function renderCard({template='hero_destination',data={},backgroundImage=null,profile='instagram_post'}){
  const [w,h]=SIZES[profile]||[1080,1080];
  const fn=TEMPLATE_MAP[template]||T1;
  const svgBuf=Buffer.from(fn(w,h,data));
  const outName=`lavira_card_${template}_${profile}_${uuid().slice(0,8)}.jpg`;
  const outPath=path.join(cfg.OUTPUTS_DIR,outName);
  fs.mkdirSync(cfg.OUTPUTS_DIR,{recursive:true});
  let pipeline;
  if(backgroundImage&&fs.existsSync(backgroundImage)){
    pipeline=sharp(backgroundImage).resize(w,h,{fit:'cover',position:'centre'}).modulate({saturation:1.12}).composite([{input:svgBuf,blend:'over'}]);
  } else {
    const bg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#0F1C17"/></svg>`);
    pipeline=sharp(bg).composite([{input:svgBuf,blend:'over'}]);
  }
  await pipeline.jpeg({quality:94}).toFile(outPath);
  return {filename:outName,path:outPath,downloadUrl:`/outputs/${outName}`,resolution:`${w}x${h}`,template,profile};
}

async function renderAllProfiles(template,data,backgroundImage,profiles=['instagram_post','instagram_story','facebook']){
  const results=[];
  for(const profile of profiles){
    try{results.push(await renderCard({template,data,backgroundImage,profile}));}
    catch(e){results.push({profile,error:e.message});}
  }
  return results;
}


// ── Auto-build rich defaults from brand.js ─────────────────────────────────
function buildDefaultData(destination, template) {
  const dest = destination || 'Masai Mara';
  const prof = BRAND.destination_profiles && BRAND.destination_profiles[dest] || {};
  const pkgs = BRAND.safari_packages || [];
  const pkg  = pkgs.find(p => p.destinations && p.destinations.includes(dest)) || {};
  const testi = BRAND.testimonials || [];
  const t = testi[Math.floor(Math.random()*testi.length)] || {};
  const wildlife = prof.wildlife || ['elephant','lion','cheetah'];
  const guide = (BRAND.guides||['Victor'])[Math.floor(Math.random()*(BRAND.guides||['Victor']).length)];
  const dests = BRAND.destinations || [];
  switch(template) {
    case 'hero_destination':
      return { destination:dest, hook:prof.highlight||'Discover the wild heart of '+dest,
               highlight:prof.headline||'', packageName:pkg.name||'', packageDuration:pkg.duration||'' };
    case 'safari_package': case 'package': case 'package_promo':
      return { packageName:pkg.name||dest+' Safari', duration:pkg.duration||'3 days',
               destinations:pkg.destinations||[dest], highlights:pkg.highlights||wildlife.slice(0,4), destination:dest };
    case 'testimonial':
      return { quote:t.quote||'An absolutely unforgettable experience with Lavira Safaris.',
               guest:t.guest||'Safari Guest', highlight:t.highlight||'', destination:dest };
    case 'wildlife_spotlight':
      return { animal:(wildlife[0]||'Elephant'), fact:prof.highlight||'Spot the Big Five in '+dest,
               destination:dest, hook:'This week in '+dest, emoji:'' };
    case 'dual_destination': case 'twin_destination': {
      const dest2 = dests.find(d=>d!==dest)||'Masai Mara';
      const prof2 = BRAND.destination_profiles&&BRAND.destination_profiles[dest2]||{};
      return { destination1:dest, destination2:dest2,
               hook1:(prof.highlight||'').slice(0,30), hook2:(prof2.highlight||'').slice(0,30),
               highlights1:(prof.wildlife||[]).slice(0,3), highlights2:(prof2.wildlife||[]).slice(0,3),
               packageName:dest+' & '+dest2+' Safari' }; }
    case 'promo_flash': case 'offer': case 'pricing':
      return { destination:dest, hook:'This Week — '+dest+' Safari', price:'',
               inclusions:pkg.highlights||wildlife.slice(0,4),
               urgency:'Limited Spots — Book Now on WhatsApp' };
    case 'guide_spotlight': case 'stats':
      return { destination:dest, guide:guide, hook:'Expert guides in '+dest,
               fact:'Encyclopedic knowledge of wildlife & ecosystems',
               highlights:(BRAND.usps||[]).slice(0,3) };
    case 'conservation':
      return { destination:dest, headline:'Protecting '+dest,
               stat1:'1.5M', label1:'wildebeest in the Mara ecosystem',
               stat2:'13',  label2:'destinations we serve across Kenya & Tanzania',
               hook:'Responsible tourism supporting local communities',
               highlights:(BRAND.usps||[]).slice(0,2) };
    default:
      return { destination:dest, hook:'Experience '+dest+' with Lavira Safaris' };
  }
}

module.exports = {renderCard,renderAllProfiles,buildDefaultData,TEMPLATE_MAP,SIZES};
