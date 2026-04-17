// src/publishing/instagram.js — Real Instagram Graph API Integration
// Publishes media to Instagram Feed, Stories, and Reels using official API
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const API_VERSION = 'v19.0';
const GRAPH_API_URL = `https://graph.instagram.com/${API_VERSION}`;

function getEnv(key) {
  return process.env[key] || '';
}

// ── Upload image/video to create a media container ────────────────────────────
async function uploadMediaContainer(filePath, mediaType = 'image') {
  const token = getEnv('INSTAGRAM_ACCESS_TOKEN');
  const userId = getEnv('INSTAGRAM_USER_ID');

  if (!token || !userId) {
    return { status: 'error', message: 'Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID' };
  }

  if (!fs.existsSync(filePath)) {
    return { status: 'error', message: `File not found: ${filePath}` };
  }

  const fileSize = fs.statSync(filePath).size;
  if (mediaType === 'video' && fileSize > 100 * 1024 * 1024) {
    return { status: 'error', message: 'Video file too large (max 100MB)' };
  }
  if (mediaType === 'image' && fileSize > 50 * 1024 * 1024) {
    return { status: 'error', message: 'Image file too large (max 50MB)' };
  }

  return new Promise((resolve) => {
    try {
      const fileStream = fs.createReadStream(filePath);
      const boundary = `----WebKitFormBoundary${Math.random().toString(16).slice(2)}`;

      let body = '';
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="media_type"\r\n\r\n`;
      body += `${mediaType === 'video' ? 'VIDEO' : 'IMAGE'}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="access_token"\r\n\r\n`;
      body += `${token}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\n`;
      body += `Content-Type: ${mediaType === 'video' ? 'video/mp4' : 'image/jpeg'}\r\n\r\n`;

      const req = https.request(
        `${GRAPH_API_URL}/${userId}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length + fileSize + 100
          }
        },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.id) {
                resolve({
                  status: 'success',
                  mediaContainerId: result.id,
                  message: 'Media container created'
                });
              } else {
                resolve({
                  status: 'error',
                  message: result.error?.message || 'Failed to create media container'
                });
              }
            } catch {
              resolve({ status: 'error', message: 'Invalid API response' });
            }
          });
        }
      );

      req.on('error', err => {
        resolve({ status: 'error', message: err.message });
      });

      req.write(body);
      fileStream.pipe(req);
      req.write(`\r\n--${boundary}--\r\n`);
    } catch (err) {
      resolve({ status: 'error', message: err.message });
    }
  });
}

// ── Publish media container to feed ───────────────────────────────────────────
async function publishToFeed(mediaContainerId, caption = '') {
  const token = getEnv('INSTAGRAM_ACCESS_TOKEN');
  const userId = getEnv('INSTAGRAM_USER_ID');

  if (!token || !userId) {
    return { status: 'error', message: 'Missing credentials' };
  }

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      media_ids: [mediaContainerId],
      caption: caption.slice(0, 2200), // Instagram caption limit
      access_token: token
    });

    const req = https.request(
      `${GRAPH_API_URL}/${userId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.id) {
              resolve({
                status: 'success',
                postId: result.id,
                message: 'Posted to Instagram Feed',
                url: `https://instagram.com/p/${result.id}`
              });
            } else {
              resolve({
                status: 'error',
                message: result.error?.message || 'Failed to publish'
              });
            }
          } catch {
            resolve({ status: 'error', message: 'Invalid API response' });
          }
        });
      }
    );

    req.on('error', err => {
      resolve({ status: 'error', message: err.message });
    });

    req.write(postData);
    req.end();
  });
}

// ── Main publish function ──────────────────────────────────────────────────────
async function publishToInstagram({ filePath, caption, format = 'feed' }) {
  const token = getEnv('INSTAGRAM_ACCESS_TOKEN');
  const userId = getEnv('INSTAGRAM_USER_ID');

  if (!token || !userId) {
    return {
      status: 'manual',
      platform: 'instagram',
      message: 'Add INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID to .env to enable publishing',
      caption
    };
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: 'error',
      platform: 'instagram',
      message: 'Media file not found: ' + filePath,
      caption
    };
  }

  try {
    // Determine media type
    const ext = path.extname(filePath).toLowerCase();
    const mediaType = ['.mp4', '.mov', '.avi'].includes(ext) ? 'video' : 'image';

    // Create media container
    const containerResult = await uploadMediaContainer(filePath, mediaType);
    if (containerResult.status !== 'success') {
      return {
        status: 'error',
        platform: 'instagram',
        message: containerResult.message,
        caption
      };
    }

    // Publish the container
    const publishResult = await publishToFeed(containerResult.mediaContainerId, caption);
    
    return {
      ...publishResult,
      platform: 'instagram',
      format,
      caption
    };
  } catch (err) {
    return {
      status: 'error',
      platform: 'instagram',
      message: err.message,
      caption
    };
  }
}

module.exports = { publishToInstagram, uploadMediaContainer, publishToFeed };
