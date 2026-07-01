// src/routes/webhooks.js — Lavira publish callback receiver
// Handles inbound webhooks from: Meta (Instagram/Facebook), TikTok
// Mount: app.use('/api/webhooks', require('./routes/webhooks'))
'use strict';
const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const cfg     = require('../config');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(platform, event, data) {
  const entry = { ts: new Date().toISOString(), platform, event, data };
  process.stderr.write('[webhooks] ' + JSON.stringify(entry) + '\n');

  // Append to webhook_log.jsonl for audit trail
  const logPath = path.join(cfg.OUTPUTS_DIR, '..', 'webhook_log.jsonl');
  try { fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); } catch {}
  return entry;
}

function verifyMetaSignature(req) {
  const secret = process.env.META_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification if secret not configured (dev mode)
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ── Meta hub challenge verification (GET) ────────────────────────────────────
// Facebook/Instagram require this endpoint to verify the webhook subscription
router.get('/meta', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected  = process.env.META_WEBHOOK_VERIFY_TOKEN || 'lavira_webhook_token';

  if (mode === 'subscribe' && token === expected) {
    log('meta', 'hub_verify', { mode, token });
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Meta POST webhook (Instagram + Facebook callbacks) ───────────────────────
router.post('/meta', express.raw({ type: '*/*' }), (req, res) => {
  // Store raw body for signature verification
  req.rawBody = req.body ? req.body.toString() : '';
  if (!verifyMetaSignature(req)) {
    log('meta', 'signature_fail', {});
    return res.sendStatus(401);
  }

  let payload;
  try { payload = JSON.parse(req.rawBody); } catch { return res.sendStatus(400); }

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const { field, value } = change;
      // Instagram media publish status
      if (field === 'media' || field === 'content_publishing_limit') {
        log('instagram', field, value);
      }
      // Facebook page events
      if (field === 'feed' || field === 'mention') {
        log('facebook', field, value);
      }
      // Generic — log everything
      log(payload.object || 'meta', field, value);
    }
  }

  res.sendStatus(200); // Must respond quickly
});

// ── TikTok webhook ───────────────────────────────────────────────────────────
router.post('/tiktok', express.json(), (req, res) => {
  const body = req.body || {};
  const event = body.event || body.type || 'unknown';

  // TikTok sends content publishing status updates
  if (body.publish_id) {
    const entry = log('tiktok', event, {
      publishId: body.publish_id,
      status: body.status,
      videoId: body.video_id,
      failReason: body.fail_reason,
    });

    // If publish completed, update job state file if we can find it
    if (body.status === 'PUBLISH_COMPLETE' && body.publish_id) {
      try {
        const files = fs.readdirSync(cfg.OUTPUTS_DIR).filter(f => f.endsWith('.json'));
        for (const f of files) {
          const fp = path.join(cfg.OUTPUTS_DIR, f);
          const st = JSON.parse(fs.readFileSync(fp, 'utf8'));
          if (st.tiktokPublishId === body.publish_id) {
            st.tiktokStatus = 'published';
            st.tiktokVideoId = body.video_id;
            fs.writeFileSync(fp, JSON.stringify(st, null, 2));
            break;
          }
        }
      } catch {}
    }
  }

  res.sendStatus(200);
});

// ── WhatsApp status webhook ──────────────────────────────────────────────────
// Meta sends message delivery/read receipts here too
router.post('/whatsapp', express.json(), (req, res) => {
  const body = req.body || {};
  const statuses = (body.entry || [])
    .flatMap(e => e.changes || [])
    .flatMap(c => c.value?.statuses || []);

  for (const s of statuses) {
    log('whatsapp', s.status, { msgId: s.id, recipientId: s.recipient_id, ts: s.timestamp });
  }

  res.sendStatus(200);
});

// ── Health check ─────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    endpoints: ['/api/webhooks/meta (GET+POST)', '/api/webhooks/tiktok', '/api/webhooks/whatsapp'],
    metaVerifyTokenConfigured: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    metaSecretConfigured: !!process.env.META_WEBHOOK_SECRET,
  });
});

module.exports = router;
