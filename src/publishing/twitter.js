// src/publishing/twitter.js — Twitter/X v2 publisher with OAuth1a signing
// Endpoints: POST /2/tweets (text), POST /1.1/media/upload (chunked media)
// Docs: https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
'use strict';
const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

function env(k) { return process.env[k] || ''; }

const MEDIA_UPLOAD_CHUNK = 5 * 1024 * 1024; // 5 MB chunks

// ── OAuth 1.0a signing ─────────────────────────────────────────────────────
function oauthHeader(method, url, params, credentials) {
  const oauthParams = {
    oauth_consumer_key:     credentials.apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            credentials.accessToken,
    oauth_version:          '1.0',
  };

  // Combine all params for signature base
  const allParams = { ...params, ...oauthParams };
  const paramStr  = Object.keys(allParams).sort()
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(allParams[k]))
    .join('&');

  const base = method.toUpperCase() + '&' + encodeURIComponent(url) + '&' + encodeURIComponent(paramStr);
  const signingKey = encodeURIComponent(credentials.apiSecret) + '&' + encodeURIComponent(credentials.accessSecret);
  const sig = crypto.createHmac('sha1', signingKey).update(base).digest('base64');

  oauthParams.oauth_signature = sig;

  const header = 'OAuth ' + Object.keys(oauthParams)
    .map(k => encodeURIComponent(k) + '="' + encodeURIComponent(oauthParams[k]) + '"')
    .join(', ');

  return header;
}

function getCredentials() {
  return {
    apiKey:       env('TWITTER_API_KEY'),
    apiSecret:    env('TWITTER_API_SECRET'),
    accessToken:  env('TWITTER_ACCESS_TOKEN'),
    accessSecret: env('TWITTER_ACCESS_SECRET'),
  };
}

function credentialsOk(c) {
  return c.apiKey && c.apiSecret && c.accessToken && c.accessSecret;
}

// ── HTTPS helper ────────────────────────────────────────────────────────────
function httpsReq(options, bodyBuf) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ── Step 1: Upload media (INIT → APPEND chunks → FINALIZE) ────────────────
async function uploadMedia(filePath, mediaType, credentials) {
  const fileData   = fs.readFileSync(filePath);
  const totalBytes = fileData.length;
  const urlInit    = 'https://upload.twitter.com/1.1/media/upload.json';

  // INIT
  const initParams = { command: 'INIT', total_bytes: totalBytes.toString(), media_type: mediaType };
  const initBody   = new URLSearchParams(initParams).toString();
  const initRes = await httpsReq({
    hostname: 'upload.twitter.com',
    path: '/1.1/media/upload.json',
    method: 'POST',
    headers: {
      'Authorization': oauthHeader('POST', urlInit, initParams, credentials),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(initBody),
    },
  }, Buffer.from(initBody));

  if (!initRes.body?.media_id_string) {
    throw new Error('Media INIT failed: ' + JSON.stringify(initRes.body).slice(0, 200));
  }
  const mediaId = initRes.body.media_id_string;

  // APPEND chunks
  const totalChunks = Math.ceil(totalBytes / MEDIA_UPLOAD_CHUNK);
  for (let i = 0; i < totalChunks; i++) {
    const chunk     = fileData.slice(i * MEDIA_UPLOAD_CHUNK, (i + 1) * MEDIA_UPLOAD_CHUNK);
    const boundary  = 'LaviraTwitter' + Date.now();
    const multipart = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="command"\r\n\r\nAPPEND\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="media_id"\r\n\r\n' + mediaId + '\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n' + i + '\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="media"; filename="chunk"\r\nContent-Type: application/octet-stream\r\n\r\n'),
      chunk,
      Buffer.from('\r\n--' + boundary + '--\r\n'),
    ]);

    const appendUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    await httpsReq({
      hostname: 'upload.twitter.com',
      path: '/1.1/media/upload.json',
      method: 'POST',
      headers: {
        'Authorization': oauthHeader('POST', appendUrl, {}, credentials),
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': multipart.length,
      },
    }, multipart);
  }

  // FINALIZE
  const finParams = { command: 'FINALIZE', media_id: mediaId };
  const finBody   = new URLSearchParams(finParams).toString();
  const finRes = await httpsReq({
    hostname: 'upload.twitter.com',
    path: '/1.1/media/upload.json',
    method: 'POST',
    headers: {
      'Authorization': oauthHeader('POST', urlInit, finParams, credentials),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(finBody),
    },
  }, Buffer.from(finBody));

  if (finRes.body?.error || finRes.body?.errors) {
    throw new Error('Media FINALIZE failed: ' + JSON.stringify(finRes.body).slice(0, 200));
  }

  // Poll for processing if video
  if (finRes.body?.processing_info?.state === 'pending') {
    await pollMediaProcessing(mediaId, credentials);
  }

  return mediaId;
}

async function pollMediaProcessing(mediaId, credentials, maxWaitMs = 60000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const checkUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const res = await httpsReq({
      hostname: 'upload.twitter.com',
      path: '/1.1/media/upload.json?command=STATUS&media_id=' + mediaId,
      method: 'GET',
      headers: { 'Authorization': oauthHeader('GET', checkUrl, { command: 'STATUS', media_id: mediaId }, credentials) },
    }, null);
    const state = res.body?.processing_info?.state;
    if (state === 'succeeded') return;
    if (state === 'failed') throw new Error('Media processing failed: ' + JSON.stringify(res.body?.processing_info));
    const waitMs = (res.body?.processing_info?.check_after_secs || 3) * 1000;
    await new Promise(r => setTimeout(r, waitMs));
  }
  throw new Error('Media processing timed out');
}

// ── Step 2: Post tweet ──────────────────────────────────────────────────────
async function postTweet(text, mediaId, credentials) {
  const body = JSON.stringify({
    text: text.slice(0, 280),
    ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
  });
  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const res = await httpsReq({
    hostname: 'api.twitter.com',
    path: '/2/tweets',
    method: 'POST',
    headers: {
      'Authorization': oauthHeader('POST', tweetUrl, {}, credentials),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, Buffer.from(body));

  if (res.body?.data?.id) return { tweetId: res.body.data.id, tweetText: res.body.data.text };
  throw new Error('Tweet post failed: ' + JSON.stringify(res.body).slice(0, 300));
}

// ── Public: full publish flow ──────────────────────────────────────────────
async function publishToTwitter({ filePath, caption, dryRun } = {}) {
  const creds = getCredentials();

  if (!credentialsOk(creds)) {
    return {
      status: 'manual',
      platform: 'twitter',
      message: 'Missing Twitter API keys (need all 4: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET)',
      setupUrl: 'https://developer.twitter.com/en/portal/dashboard',
      setupNote: 'Requires Twitter Developer Account with Elevated access for media upload',
      caption,
    };
  }

  const LIMIT = 280;
  let captionWarning = null;
  if ((caption || '').length > LIMIT) {
    captionWarning = `Caption truncated from ${caption.length} to ${LIMIT} chars`;
    caption = caption.slice(0, LIMIT);
  }

  if (dryRun) {
    return {
      dryRun: true, platform: 'twitter',
      wouldPost: { caption, captionLength: (caption||'').length, filePath },
      captionWarning,
      fileExists: filePath ? fs.existsSync(filePath) : false,
      credentialsOk: true,
    };
  }

  try {
    let mediaId = null;
    if (filePath && fs.existsSync(filePath)) {
      const ext      = path.extname(filePath).toLowerCase();
      const isVideo  = ['.mp4', '.mov'].includes(ext);
      const mediaType = isVideo ? 'video/mp4' : 'image/jpeg';
      mediaId = await uploadMedia(filePath, mediaType, creds);
    }

    const { tweetId, tweetText } = await postTweet(caption || '', mediaId, creds);
    return {
      status: 'success', platform: 'twitter',
      tweetId, tweetText, mediaId,
      url: 'https://twitter.com/i/web/status/' + tweetId,
      captionWarning,
    };
  } catch (err) {
    return { status: 'error', platform: 'twitter', message: err.message };
  }
}

module.exports = { publishToTwitter };
