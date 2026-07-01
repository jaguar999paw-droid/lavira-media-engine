// src/publishing/tiktok.js — TikTok Content Posting API v2 publisher
// Flow: init upload → upload file chunks → confirm publish
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

function env(k) { return process.env[k] || ''; }

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk (TikTok allows up to 64 MB chunks)

// ── Low-level HTTPS JSON helper ────────────────────────────────────────────
function httpsPost(hostname, reqPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req  = https.request({
      hostname, path: reqPath, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }); }
        catch { resolve({ status: res.statusCode, body: out }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Step 1: Init upload ────────────────────────────────────────────────────
async function initUpload({ token, caption, privacyLevel, fileSizeBytes }) {
  const res = await httpsPost(
    'open.tiktokapis.com',
    '/v2/post/publish/video/init/',
    { 'Authorization': 'Bearer ' + token },
    {
      post_info: {
        title: (caption || 'Lavira Safaris').slice(0, 150),
        privacy_level: privacyLevel || 'PUBLIC_TO_EVERYONE',
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSizeBytes,
        chunk_size: CHUNK_SIZE,
        total_chunk_count: Math.ceil(fileSizeBytes / CHUNK_SIZE),
      },
    }
  );

  if (!res.body?.data?.publish_id || !res.body?.data?.upload_url) {
    throw new Error('TikTok init failed: ' + JSON.stringify(res.body?.error || res.body).slice(0, 200));
  }
  return { publishId: res.body.data.publish_id, uploadUrl: res.body.data.upload_url };
}

// ── Step 2: Upload file in chunks ──────────────────────────────────────────
async function uploadChunks(uploadUrl, filePath, fileSizeBytes) {
  const totalChunks = Math.ceil(fileSizeBytes / CHUNK_SIZE);
  const fd          = fs.openSync(filePath, 'r');
  const urlObj      = new URL(uploadUrl);

  for (let i = 0; i < totalChunks; i++) {
    const start  = i * CHUNK_SIZE;
    const end    = Math.min(start + CHUNK_SIZE, fileSizeBytes) - 1;
    const length = end - start + 1;
    const buf    = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, start);

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${fileSizeBytes}`,
          'Content-Length': length,
        },
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          // TikTok returns 206 for partial, 200/201 for final chunk
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`Chunk ${i+1}/${totalChunks} upload failed: HTTP ${res.statusCode} — ${d.slice(0,200)}`));
        });
      });
      req.on('error', reject);
      req.write(buf);
      req.end();
    });
  }

  fs.closeSync(fd);
}

// ── Step 3: Poll publish status ────────────────────────────────────────────
async function pollStatus(token, publishId, maxWaitMs = 30000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await httpsPost(
      'open.tiktokapis.com',
      '/v2/post/publish/status/fetch/',
      { 'Authorization': 'Bearer ' + token },
      { publish_id: publishId }
    );
    const st = res.body?.data?.status;
    if (st === 'PUBLISH_COMPLETE') return { done: true, status: st };
    if (st === 'FAILED') throw new Error('TikTok publish failed: ' + JSON.stringify(res.body?.data));
    // SENDING_TO_USER_INBOX / UPLOADING → keep polling
  }
  return { done: false, status: 'TIMEOUT', publishId, note: 'Upload accepted; status pending — check TikTok creator portal.' };
}

// ── Public: full publish flow ──────────────────────────────────────────────
async function publishToTikTok({ filePath, caption, privacyLevel, dryRun } = {}) {
  const token = env('TIKTOK_ACCESS_TOKEN');

  if (!token) {
    return {
      status: 'manual',
      platform: 'tiktok',
      message: 'TIKTOK_ACCESS_TOKEN not configured. See: https://developers.tiktok.com/doc/content-posting-api-get-started',
      setupSteps: [
        '1. Apply for TikTok for Developers account',
        '2. Create an app and request "Content Posting API" scope',
        '3. Complete OAuth2 flow to get access token',
        '4. Add TIKTOK_ACCESS_TOKEN=<token> to .env',
      ],
      caption,
    };
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return { status: 'error', platform: 'tiktok', message: 'Video file not found: ' + filePath };
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.mp4', '.mov', '.webm'].includes(ext)) {
    return { status: 'error', platform: 'tiktok', message: 'TikTok requires .mp4/.mov/.webm — got: ' + ext };
  }

  // Caption length enforcement
  const TIKTOK_LIMIT = 2200;
  let captionWarning = null;
  if ((caption || '').length > TIKTOK_LIMIT) {
    captionWarning = `Caption truncated from ${caption.length} to ${TIKTOK_LIMIT} chars`;
    caption = caption.slice(0, TIKTOK_LIMIT);
  }

  const stats         = fs.statSync(filePath);
  const fileSizeBytes = stats.size;

  // 50 MB hard limit (TikTok's constraint for direct uploads)
  if (fileSizeBytes > 50 * 1024 * 1024) {
    return { status: 'error', platform: 'tiktok', message: `File too large: ${(fileSizeBytes/1024/1024).toFixed(1)} MB (max 50 MB for API upload)` };
  }

  if (dryRun) {
    return {
      dryRun: true,
      platform: 'tiktok',
      wouldPost: { filePath, caption, captionLength: (caption||'').length, fileSizeMB: (fileSizeBytes/1024/1024).toFixed(1) },
      captionWarning,
      chunksNeeded: Math.ceil(fileSizeBytes / CHUNK_SIZE),
    };
  }

  try {
    // Init
    const { publishId, uploadUrl } = await initUpload({ token, caption, privacyLevel, fileSizeBytes });

    // Upload
    await uploadChunks(uploadUrl, filePath, fileSizeBytes);

    // Poll
    const statusResult = await pollStatus(token, publishId);

    return {
      status: statusResult.done ? 'success' : 'pending',
      platform: 'tiktok',
      publishId,
      tiktokStatus: statusResult.status,
      message: statusResult.done ? 'Published to TikTok' : statusResult.note,
      captionWarning,
    };
  } catch (err) {
    return { status: 'error', platform: 'tiktok', message: err.message };
  }
}

module.exports = { publishToTikTok };
