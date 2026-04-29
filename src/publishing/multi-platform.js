// src/publishing/multi-platform.js -- Lavira Multi-Platform Publishing v2
// Channels: Instagram, Facebook, TikTok, Twitter/X, WhatsApp (Business API), Telegram
// Strategy: Each platform gets content adapted to its optimal format + caption style
'use strict';
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const cfg   = require('../config');

function env(k) { return process.env[k] || ''; }

// ── PLATFORM REGISTRY ─────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: {
    name: 'Instagram',
    icon: '📸',
    keys: ['INSTAGRAM_ACCESS_TOKEN','INSTAGRAM_USER_ID'],
    formats: ['instagram_post','instagram_story','instagram_portrait'],
    captionLimit: 2200,
    hashtagStyle: 'inline', // appended in caption
    bestTimes: ['08:00','12:00','19:00'],
    setupUrl: 'https://developers.facebook.com/docs/instagram-api',
    setupNote: 'Requires Meta Business App + Instagram Professional Account',
  },
  facebook: {
    name: 'Facebook',
    icon: '👥',
    keys: ['FACEBOOK_ACCESS_TOKEN','FACEBOOK_PAGE_ID'],
    formats: ['facebook','facebook_story'],
    captionLimit: 63206,
    hashtagStyle: 'comment',
    bestTimes: ['09:00','13:00','15:00'],
    setupUrl: 'https://developers.facebook.com/docs/pages',
    setupNote: 'Requires Facebook Page + Page Access Token',
  },
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    keys: ['TIKTOK_ACCESS_TOKEN'],
    formats: ['tiktok'],
    captionLimit: 2200,
    hashtagStyle: 'inline',
    bestTimes: ['07:00','19:00','21:00'],
    setupUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    setupNote: 'Requires TikTok for Developers + Content Posting API approval',
  },
  twitter: {
    name: 'Twitter/X',
    icon: '🐦',
    keys: ['TWITTER_API_KEY','TWITTER_API_SECRET','TWITTER_ACCESS_TOKEN','TWITTER_ACCESS_SECRET'],
    formats: ['twitter_card'],
    captionLimit: 280,
    hashtagStyle: 'inline',
    bestTimes: ['08:00','12:00','17:00'],
    setupUrl: 'https://developer.twitter.com/en/portal/dashboard',
    setupNote: 'Requires Twitter Developer Account + Elevated access for media upload',
  },
  whatsapp: {
    name: 'WhatsApp Business',
    icon: '💬',
    keys: ['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN'],
    formats: ['whatsapp'],
    captionLimit: 1024,
    hashtagStyle: 'none',
    bestTimes: ['09:00','13:00','18:00'],
    setupUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    setupNote: 'Requires WhatsApp Business Platform + verified business phone number',
  },
  telegram: {
    name: 'Telegram',
    icon: '✈️',
    keys: ['TELEGRAM_BOT_TOKEN','TELEGRAM_CHANNEL_ID'],
    formats: ['whatsapp'],
    captionLimit: 1024,
    hashtagStyle: 'inline',
    bestTimes: ['10:00','14:00','20:00'],
    setupUrl: 'https://core.telegram.org/bots/api',
    setupNote: 'Create bot via @BotFather, add to channel as admin with post permissions',
  },
};

// ── CONNECTION STATUS ─────────────────────────────────────────────────────────
function getPlatformStatus() {
  return Object.entries(PLATFORMS).map(([id, p]) => {
    const missing = p.keys.filter(k => !env(k));
    return {
      id, name: p.name, icon: p.icon,
      connected: missing.length === 0,
      partiallyConfigured: missing.length > 0 && missing.length < p.keys.length,
      missingKeys: missing,
      formats: p.formats,
      captionLimit: p.captionLimit,
      bestTimes: p.bestTimes,
      setupUrl: p.setupUrl,
      setupNote: p.setupNote,
    };
  });
}

// ── CAPTION ADAPTERS ──────────────────────────────────────────────────────────
// Each platform has its own voice/style for captions
function adaptCaption(platform, caption, hook, hashtags, cta) {
  const tags = (hashtags || []).slice(0, 20).map(t => t.startsWith('#') ? t : '#'+t).join(' ');
  const phone = process.env.BRAND_PHONE || '+254 721 757 387';
  const website = process.env.BRAND_WEBSITE || 'lavirasafaris.com';

  switch(platform) {
    case 'instagram': {
      // Hook first, emoji-rich, hashtags at end
      const body = [hook, '', caption, '', `📞 ${phone}`, `🌍 ${website}`].filter(Boolean).join('\n');
      return (body + '\n\n' + tags).slice(0, 2200);
    }
    case 'facebook': {
      // Longer, storytelling style, no hashtag clutter
      const body = [hook, '', caption, '', `📞 Call/WhatsApp: ${phone}`, `🌐 ${website}`, '', cta||'Book your dream safari today!'].filter(Boolean).join('\n');
      return body.slice(0, 63206);
    }
    case 'tiktok': {
      // Short punchy hook, trending hashtags
      const short = (hook || caption || '').slice(0, 100);
      return (short + '\n' + tags + ' #safari #wildlife #kenya #africa #travel').slice(0, 2200);
    }
    case 'twitter': {
      // Under 280 chars, strong hook, 1-2 tags
      const topTags = (hashtags||[]).slice(0,2).map(t => t.startsWith('#')?t:'#'+t).join(' ');
      return ((hook||caption).slice(0, 220) + ' ' + topTags + ` 📞${phone}`).slice(0,280);
    }
    case 'whatsapp': {
      // Conversational, no hashtags, direct CTA
      return [
        `*${hook||'Lavira Safaris'}*`,
        '',
        caption,
        '',
        `📞 WhatsApp: ${phone}`,
        `🌍 ${website}`,
        '',
        cta || 'Reply YES to get a free quote!',
      ].filter(Boolean).join('\n').slice(0,1024);
    }
    case 'telegram': {
      // Markdown-friendly, moderate hashtags
      const body = [`*${hook||'Lavira Safaris'}*`, '', caption, '', `📞 ${phone}`, `🌍 ${website}`, '', tags].filter(Boolean).join('\n');
      return body.slice(0,1024);
    }
    default:
      return caption || '';
  }
}

// ── PLATFORM PUBLISHERS ───────────────────────────────────────────────────────

async function publishInstagram({ filePath, caption, format }) {
  const instagram = require('./instagram');
  return instagram.publishToInstagram({ filePath, caption, format });
}

async function publishFacebook({ filePath, caption }) {
  const token  = env('FACEBOOK_ACCESS_TOKEN');
  const pageId = env('FACEBOOK_PAGE_ID');
  if (!token || !pageId) {
    return { status:'manual', platform:'facebook', message:'Missing FACEBOOK_ACCESS_TOKEN or FACEBOOK_PAGE_ID', setupNote: PLATFORMS.facebook.setupNote, caption };
  }
  if (!filePath || !fs.existsSync(filePath)) {
    return { status:'error', platform:'facebook', message:'File not found: '+filePath };
  }
  // Facebook Graph API photo post
  return new Promise(resolve => {
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4','.mov'].includes(ext);
    const endpoint = isVideo
      ? `https://graph.facebook.com/v19.0/${pageId}/videos`
      : `https://graph.facebook.com/v19.0/${pageId}/photos`;
    const fileStream = fs.createReadStream(filePath);
    const boundary = 'LaviraFB' + Date.now();
    const headerText = `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${token}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption.slice(0,2000)}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="${isVideo?'source':'source'}"; filename="${path.basename(filePath)}"\r\nContent-Type: ${isVideo?'video/mp4':'image/jpeg'}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const urlObj = new URL(endpoint);
    const req = https.request({
      hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
      method:'POST',
      headers:{ 'Content-Type':`multipart/form-data; boundary=${boundary}` },
    }, res => {
      let data='';
      res.on('data', c => data+=c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (r.id) resolve({ status:'success', platform:'facebook', postId:r.id, message:'Posted to Facebook' });
          else resolve({ status:'error', platform:'facebook', message:r.error?.message||'Facebook API error' });
        } catch { resolve({ status:'error', platform:'facebook', message:'Parse error' }); }
      });
    });
    req.on('error', e => resolve({ status:'error', platform:'facebook', message:e.message }));
    req.write(headerText);
    fileStream.pipe(req, { end:false });
    fileStream.on('end', () => { req.write(footer); req.end(); });
  });
}

async function publishTikTok({ filePath, caption }) {
  const token = env('TIKTOK_ACCESS_TOKEN');
  if (!token) {
    return { status:'manual', platform:'tiktok', setupNote: PLATFORMS.tiktok.setupNote,
      message:'Add TIKTOK_ACCESS_TOKEN to .env — requires TikTok for Developers approval', caption };
  }
  // TikTok Content Posting API v2
  return new Promise(resolve => {
    const postData = JSON.stringify({ post_info:{ title:caption.slice(0,150), privacy_level:'PUBLIC_TO_EVERYONE', disable_comment:false }, source_info:{ source:'FILE_UPLOAD' } });
    const req = https.request({
      hostname:'open.tiktokapis.com', path:'/v2/post/publish/inbox/video/init/',
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=UTF-8', 'Content-Length':Buffer.byteLength(postData) },
    }, res => {
      let data='';
      res.on('data',c=>data+=c);
      res.on('end',()=>{
        try {
          const r=JSON.parse(data);
          if (r.data?.publish_id) resolve({ status:'success', platform:'tiktok', publishId:r.data.publish_id, message:'TikTok upload initiated' });
          else resolve({ status:'error', platform:'tiktok', message:r.error?.message||'TikTok API error', raw:data.slice(0,200) });
        } catch { resolve({ status:'error', platform:'tiktok', message:'Parse error' }); }
      });
    });
    req.on('error', e => resolve({ status:'error', platform:'tiktok', message:e.message }));
    req.write(postData); req.end();
  });
}

async function publishTwitter({ filePath, caption }) {
  const apiKey    = env('TWITTER_API_KEY');
  const apiSecret = env('TWITTER_API_SECRET');
  const accToken  = env('TWITTER_ACCESS_TOKEN');
  const accSecret = env('TWITTER_ACCESS_SECRET');
  if (!apiKey || !apiSecret || !accToken || !accSecret) {
    return { status:'manual', platform:'twitter', setupNote: PLATFORMS.twitter.setupNote,
      message:'Missing Twitter API keys — 4 keys required', caption };
  }
  // Note: Full OAuth1.0a implementation would be needed here
  // Returning stub with setup guidance
  return { status:'configured', platform:'twitter',
    message:'Twitter keys present. Full OAuth1.0a tweet+media endpoint ready to wire.',
    caption, note:'Implement OAuth1a signing for /2/tweets + /1.1/media/upload endpoints' };
}

async function publishWhatsApp({ filePath, caption, recipientPhone }) {
  const phoneNumberId = env('WHATSAPP_PHONE_NUMBER_ID');
  const token         = env('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId || !token) {
    return { status:'manual', platform:'whatsapp', setupNote: PLATFORMS.whatsapp.setupNote,
      message:'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN', caption };
  }
  if (!recipientPhone) {
    return { status:'error', platform:'whatsapp', message:'recipientPhone required for WhatsApp' };
  }
  // WhatsApp Cloud API — send image message
  return new Promise(resolve => {
    const postData = JSON.stringify({
      messaging_product:'whatsapp', recipient_type:'individual',
      to: recipientPhone,
      type: filePath ? 'image' : 'text',
      ...(filePath ? { image:{ link:`https://yourdomain.com/outputs/${path.basename(filePath)}`, caption:caption.slice(0,1024) } } : { text:{ body:caption.slice(0,4096) } }),
    });
    const req = https.request({
      hostname:'graph.facebook.com',
      path:`/v19.0/${phoneNumberId}/messages`,
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(postData) },
    }, res => {
      let data='';
      res.on('data',c=>data+=c);
      res.on('end',()=>{
        try {
          const r=JSON.parse(data);
          if (r.messages) resolve({ status:'success', platform:'whatsapp', messageId:r.messages[0]?.id, message:'WhatsApp message sent' });
          else resolve({ status:'error', platform:'whatsapp', message:r.error?.message||'WhatsApp API error' });
        } catch { resolve({ status:'error', platform:'whatsapp', message:'Parse error' }); }
      });
    });
    req.on('error', e => resolve({ status:'error', platform:'whatsapp', message:e.message }));
    req.write(postData); req.end();
  });
}

async function publishTelegram({ filePath, caption }) {
  const botToken  = env('TELEGRAM_BOT_TOKEN');
  const channelId = env('TELEGRAM_CHANNEL_ID');
  if (!botToken || !channelId) {
    return { status:'manual', platform:'telegram', setupNote: PLATFORMS.telegram.setupNote,
      message:'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID', caption };
  }
  return new Promise(resolve => {
    const ext = filePath ? path.extname(filePath).toLowerCase() : '';
    const isVideo = ['.mp4','.mov'].includes(ext);
    const method = isVideo ? 'sendVideo' : (filePath ? 'sendPhoto' : 'sendMessage');
    if (!filePath || !fs.existsSync(filePath)) {
      // Text-only message
      const postData = JSON.stringify({ chat_id:channelId, text:caption.slice(0,4096), parse_mode:'Markdown' });
      const req = https.request({
        hostname:'api.telegram.org', path:`/bot${botToken}/sendMessage`,
        method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(postData)},
      }, res => {
        let data=''; res.on('data',c=>data+=c);
        res.on('end',()=>{
          try { const r=JSON.parse(data); if(r.ok) resolve({status:'success',platform:'telegram',messageId:r.result?.message_id}); else resolve({status:'error',platform:'telegram',message:r.description}); }
          catch { resolve({status:'error',platform:'telegram',message:'Parse error'}); }
        });
      });
      req.on('error',e=>resolve({status:'error',platform:'telegram',message:e.message}));
      req.write(postData); req.end();
    } else {
      const fileStream = fs.createReadStream(filePath);
      const boundary = 'LaviraTG'+Date.now();
      const fieldName = isVideo ? 'video' : 'photo';
      const headerText = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${channelId}\r\n`
        +`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption.slice(0,1024)}\r\n`
        +`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`
        +`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${path.basename(filePath)}"\r\nContent-Type: ${isVideo?'video/mp4':'image/jpeg'}\r\n\r\n`;
      const footer=`\r\n--${boundary}--\r\n`;
      const req = https.request({
        hostname:'api.telegram.org', path:`/bot${botToken}/${method}`,
        method:'POST', headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`},
      }, res => {
        let data=''; res.on('data',c=>data+=c);
        res.on('end',()=>{
          try { const r=JSON.parse(data); if(r.ok) resolve({status:'success',platform:'telegram',messageId:r.result?.message_id,message:'Telegram post sent'}); else resolve({status:'error',platform:'telegram',message:r.description}); }
          catch { resolve({status:'error',platform:'telegram',message:'Parse error'}); }
        });
      });
      req.on('error',e=>resolve({status:'error',platform:'telegram',message:e.message}));
      req.write(headerText); fileStream.pipe(req,{end:false}); fileStream.on('end',()=>{req.write(footer);req.end();});
    }
  });
}

// ── UNIFIED BROADCAST PUBLISHER ───────────────────────────────────────────────
// Publishes to multiple platforms, adapting caption and format per channel
async function broadcastToAll({ filePath, caption, hook, hashtags, cta, platforms, recipientPhone }) {
  const targetPlatforms = platforms || Object.keys(PLATFORMS);
  const results = [];
  for (const platformId of targetPlatforms) {
    const adaptedCaption = adaptCaption(platformId, caption, hook, hashtags, cta);
    let result;
    try {
      switch(platformId) {
        case 'instagram': result = await publishInstagram({ filePath, caption:adaptedCaption }); break;
        case 'facebook':  result = await publishFacebook({ filePath, caption:adaptedCaption }); break;
        case 'tiktok':    result = await publishTikTok({ filePath, caption:adaptedCaption }); break;
        case 'twitter':   result = await publishTwitter({ filePath, caption:adaptedCaption }); break;
        case 'whatsapp':  result = await publishWhatsApp({ filePath, caption:adaptedCaption, recipientPhone }); break;
        case 'telegram':  result = await publishTelegram({ filePath, caption:adaptedCaption }); break;
        default: result = { status:'unsupported', platform:platformId };
      }
    } catch(e) {
      result = { status:'error', platform:platformId, message:e.message };
    }
    results.push({ platform:platformId, ...result });
  }
  return { broadcastAt:new Date().toISOString(), results };
}

// ── SETUP GUIDE GENERATOR ─────────────────────────────────────────────────────
function getSetupGuide(platformId) {
  const p = PLATFORMS[platformId];
  if (!p) return { error:'Unknown platform: '+platformId };
  const missing = p.keys.filter(k => !env(k));
  return {
    platform: p.name,
    icon: p.icon,
    connected: missing.length === 0,
    missingEnvKeys: missing,
    requiredEnvKeys: p.keys,
    setupUrl: p.setupUrl,
    setupNote: p.setupNote,
    bestPostTimes: p.bestTimes,
    captionLimit: p.captionLimit,
    envFileLocation: '/home/kamau/lavira-media-engine/.env',
    howToActivate: `Add missing keys to .env then restart: pm2 restart lavira OR npm start`,
  };
}

module.exports = {
  getPlatformStatus, adaptCaption, broadcastToAll,
  publishInstagram, publishFacebook, publishTikTok,
  publishTwitter, publishWhatsApp, publishTelegram,
  getSetupGuide, PLATFORMS,
};
