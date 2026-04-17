// src/publishing/index.js — Lavira Publishing Layer
// Stubs for Instagram Graph API, TikTok, Facebook — wire up tokens in .env to activate.

const fs   = require('fs');
const path = require('path');
const cfg  = require('../config');

const PLATFORMS = {
  instagram: { name:'Instagram', requiresKey:'INSTAGRAM_ACCESS_TOKEN', formats:['instagram_reel','instagram_post','instagram_story'] },
  tiktok:    { name:'TikTok',    requiresKey:'TIKTOK_ACCESS_TOKEN',    formats:['tiktok'] },
  facebook:  { name:'Facebook',  requiresKey:'FACEBOOK_ACCESS_TOKEN',  formats:['facebook'] },
  twitter:   { name:'Twitter/X', requiresKey:'TWITTER_BEARER_TOKEN',   formats:['twitter'] }
};

function getEnv(key) { return process.env[key] || ''; }

function platformStatus() {
  return Object.entries(PLATFORMS).map(([id,p]) => ({
    id, name:p.name, connected:!!getEnv(p.requiresKey), envKey:p.requiresKey
  }));
}

async function publishInstagram({ videoPath, caption }) {
  const instagram = require('./instagram');
  return await instagram.publishToInstagram({ filePath: videoPath, caption });
}

async function publishTikTok({ videoPath, caption }) {
  const token = getEnv('TIKTOK_ACCESS_TOKEN');
  if (!token) return { status:'manual', platform:'tiktok', message:'Add TIKTOK_ACCESS_TOKEN to .env', caption };
  return { status:'stub', platform:'tiktok', message:'Token present — TikTok API integration pending', caption };
}

async function publishFacebook({ videoPath, caption }) {
  const token = getEnv('FACEBOOK_ACCESS_TOKEN');
  const page  = getEnv('FACEBOOK_PAGE_ID');
  if (!token || !page) return { status:'manual', platform:'facebook', message:'Add FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID to .env', caption };
  return { status:'stub', platform:'facebook', message:'Token present — Facebook Graph API integration pending', caption };
}

async function publishJob(jobId, targetPlatforms = []) {
  const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
  if (!fs.existsSync(stateFile)) throw new Error('Job not found: ' + jobId);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (!['done','approved'].includes(state.status)) throw new Error('Job must be done/approved first. Status: ' + state.status);

  const caption   = state.promo?.caption || '';
  const results   = state.results || [];
  const platforms = targetPlatforms.length ? targetPlatforms : ['instagram','tiktok','facebook'];
  const publishResults = [];

  for (const platform of platforms) {
    const matched  = results.find(r => (r.platform||'').includes(platform.replace('_','')));
    const videoPath = matched ? path.join(cfg.OUTPUTS_DIR, matched.filename) : null;
    let result;
    if (platform === 'instagram')      result = await publishInstagram({ videoPath, caption });
    else if (platform === 'tiktok')    result = await publishTikTok({ videoPath, caption });
    else if (platform === 'facebook')  result = await publishFacebook({ videoPath, caption });
    else result = { status:'unsupported', platform };
    publishResults.push(result);
  }

  state.publishLog = state.publishLog || [];
  state.publishLog.push({ at: new Date().toISOString(), results: publishResults });
  fs.writeFileSync(stateFile, JSON.stringify(state));
  return { jobId, publishResults };
}

function getPostBundle(jobId) {
  const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
  if (!fs.existsSync(stateFile)) throw new Error('Job not found');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  return {
    caption:     state.promo?.caption || '',
    hook:        state.promo?.hook || '',
    hashtags:    state.promo?.hashtags || [],
    destination: state.destination || '',
    files: (state.results||[]).map(r => ({
      platform:    r.platform || r.profile || r.label,
      filename:    r.filename,
      downloadUrl: r.downloadUrl || `/outputs/${r.filename}`,
      resolution:  r.resolution
    })),
    platformStatus: platformStatus()
  };
}

module.exports = { publishJob, getPostBundle, platformStatus, publishInstagram, publishTikTok, publishFacebook };
