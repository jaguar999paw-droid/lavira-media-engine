// src/publishing/index.js -- Lavira Publishing Layer v2
// Routes to multi-platform.js for all channel publishing
'use strict';
const fs   = require('fs');
const path = require('path');
const cfg  = require('../config');
const mp   = require('./multi-platform');

// Re-export all platform functions
const { getPlatformStatus, broadcastToAll, getSetupGuide,
  publishInstagram, publishFacebook, publishTikTok,
  publishTwitter, publishWhatsApp, publishTelegram, adaptCaption } = mp;

// Legacy compat
function platformStatus() { return getPlatformStatus(); }

async function publishJob(jobId, targetPlatforms) {
  const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
  if (!fs.existsSync(stateFile)) throw new Error('Job not found: ' + jobId);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (!['done','approved'].includes(state.status)) throw new Error('Job must be done/approved. Status: '+state.status);

  const caption  = state.promo?.caption || '';
  const hook     = state.promo?.hook || '';
  const hashtags = state.promo?.hashtags || [];
  const cta      = state.promo?.cta || 'Book on WhatsApp';
  const results  = state.results || [];
  const platforms= targetPlatforms && targetPlatforms.length ? targetPlatforms : ['instagram','facebook','tiktok','telegram'];

  // Pick best file per platform
  const platformFiles = {};
  for (const pid of platforms) {
    const fmts = (mp.PLATFORMS[pid]||{}).formats || [];
    const match = results.find(r => fmts.some(f => (r.profile||'').includes(f.split('_')[0])));
    platformFiles[pid] = match ? path.join(cfg.OUTPUTS_DIR, match.filename) : null;
  }

  const broadcastResult = await broadcastToAll({ filePath:platformFiles, caption, hook, hashtags, cta, platforms });

  state.publishLog = state.publishLog || [];
  state.publishLog.push(broadcastResult);
  fs.writeFileSync(stateFile, JSON.stringify(state));
  return { jobId, ...broadcastResult };
}

function getPostBundle(jobId) {
  const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
  if (!fs.existsSync(stateFile)) throw new Error('Job not found');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  return {
    caption:    state.promo?.caption || '',
    hook:       state.promo?.hook || '',
    hashtags:   state.promo?.hashtags || [],
    destination:state.destination || '',
    files: (state.results||[]).map(r => ({
      platform:    r.platform || r.profile || r.label,
      filename:    r.filename,
      downloadUrl: r.downloadUrl || `/outputs/${r.filename}`,
      resolution:  r.resolution,
    })),
    platformStatus: getPlatformStatus(),
    setupGuides: Object.keys(mp.PLATFORMS).map(id => getSetupGuide(id)),
  };
}

module.exports = {
  publishJob, getPostBundle, platformStatus, getPlatformStatus, getSetupGuide,
  broadcastToAll, adaptCaption,
  publishInstagram, publishFacebook, publishTikTok,
  publishTwitter, publishWhatsApp, publishTelegram,
};
