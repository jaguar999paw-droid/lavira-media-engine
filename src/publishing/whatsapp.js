// src/publishing/whatsapp.js — WhatsApp Business Cloud API publisher
// Meta Cloud API v19 — image/video messages to a WhatsApp Business number
'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const API_VERSION = 'v19.0';

function getConfig() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken:   process.env.WHATSAPP_ACCESS_TOKEN   || '',
    recipient:     process.env.WHATSAPP_RECIPIENT_NUMBER || '', // optional default recipient
  };
}

// ── Upload media to Meta Media API ──────────────────────────────────────────
async function uploadMedia(filePath, accessToken, phoneNumberId) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = ext === '.mp4' ? 'video/mp4'
             : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
             : ext === '.png' ? 'image/png' : 'application/octet-stream';

  const fileData   = fs.readFileSync(filePath);
  const boundary   = 'lavira' + Date.now();
  const CRLF       = '\r\n';

  const header = Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"${CRLF}` +
    `Content-Type: ${mime}${CRLF}${CRLF}`
  );
  const typeField = Buffer.from(
    `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="type"${CRLF}${CRLF}${mime}` +
    `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="messaging_product"${CRLF}${CRLF}whatsapp` +
    `${CRLF}--${boundary}--`
  );
  const body = Buffer.concat([header, fileData, typeField]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path:     `/${API_VERSION}/${phoneNumberId}/media`,
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Send a message with an already-uploaded media ID ────────────────────────
async function sendMessage({ phoneNumberId, accessToken, recipient, mediaId, mediaType, caption }) {
  const msgType = mediaType === 'video' ? 'video' : 'image';
  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    to:                recipient,
    type:              msgType,
    [msgType]: {
      id:      mediaId,
      caption: (caption || '').slice(0, 1024), // WA caption limit
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path:     `/${API_VERSION}/${phoneNumberId}/messages`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Main export ──────────────────────────────────────────────────────────────
async function publishToWhatsApp({ filePath, caption = '', recipient, dryRun = false }) {
  const cfg = getConfig();
  if (!cfg.phoneNumberId) return { error: 'WHATSAPP_PHONE_NUMBER_ID not configured' };
  if (!cfg.accessToken)   return { error: 'WHATSAPP_ACCESS_TOKEN not configured' };

  const to = recipient || cfg.recipient;
  if (!to) return { error: 'No recipient number. Set WHATSAPP_RECIPIENT_NUMBER or pass recipient param.' };

  if (dryRun) {
    const stat = fs.statSync(filePath);
    return { dryRun: true, valid: stat.size > 0, filePath, to, captionLength: caption.length };
  }

  const ext       = path.extname(filePath).toLowerCase();
  const mediaType = ext === '.mp4' ? 'video' : 'image';

  const uploadResult = await uploadMedia(filePath, cfg.accessToken, cfg.phoneNumberId);
  if (!uploadResult.id) throw new Error('Media upload failed: ' + JSON.stringify(uploadResult));

  const sendResult = await sendMessage({
    phoneNumberId: cfg.phoneNumberId,
    accessToken:   cfg.accessToken,
    recipient:     to,
    mediaId:       uploadResult.id,
    mediaType,
    caption,
  });

  return {
    platform:  'whatsapp',
    status:    sendResult.messages?.[0]?.message_status || 'sent',
    messageId: sendResult.messages?.[0]?.id,
    mediaId:   uploadResult.id,
    to,
  };
}

module.exports = { publishToWhatsApp };
