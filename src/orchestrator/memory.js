// orchestrator/memory.js — Lavira DB v3: WAL, audit log, encryption, soft-delete
'use strict';
const Database = require('better-sqlite3');
const crypto   = require('crypto');
const cfg      = require('../config');
const fs       = require('fs');
const path     = require('path');

// ── DB INIT ──────────────────────────────────────────────────────────────────
const DB_READONLY = process.env.DB_READONLY === 'true';

// Ensure parent directory exists before opening database
const dbDir = path.dirname(cfg.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(cfg.DB_PATH, { readonly: DB_READONLY, fileMustExist: DB_READONLY });
if (DB_READONLY) console.log('[DB] Opened in READ-ONLY mode (MCP secondary instance)');

// WAL + schema init — skip in readonly mode
if (!DB_READONLY) {
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS content_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       TEXT UNIQUE,
    created      TEXT DEFAULT (datetime('now')),
    deleted_at   TEXT,
    media_type   TEXT,
    destination  TEXT,
    theme        TEXT,
    platforms    TEXT DEFAULT '[]',
    caption_enc  TEXT,
    status       TEXT DEFAULT 'pending',
    approved     INTEGER DEFAULT 0,
    approved_at  TEXT,
    outputs      TEXT DEFAULT '[]',
    meta         TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    created   TEXT DEFAULT (datetime('now')),
    actor     TEXT DEFAULT 'system',
    action    TEXT NOT NULL,
    table_name TEXT,
    row_id    TEXT,
    detail    TEXT
  );

  CREATE TABLE IF NOT EXISTS brand_state (
    key   TEXT PRIMARY KEY,
    value TEXT,
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_content_log_created    ON content_log(created DESC);
  CREATE INDEX IF NOT EXISTS idx_content_log_destination ON content_log(destination);
  CREATE INDEX IF NOT EXISTS idx_content_log_status      ON content_log(status);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created       ON audit_log(created DESC);
`);
}  // end !DB_READONLY block

// ── ENCRYPTION ────────────────────────────────────────────────────────────────
// AES-256-GCM for caption text — key derived from DB_PATH as seed (or set ENC_KEY in .env)
const ENC_KEY = Buffer.from(
  (process.env.ENC_KEY || cfg.DB_PATH).padEnd(32, '0').slice(0, 32)
);

function encrypt(text) {
  if (!text) return '';
  const iv   = crypto.randomBytes(12);
  const ciph = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc  = Buffer.concat([ciph.update(String(text), 'utf8'), ciph.final()]);
  const tag  = ciph.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(enc) {
  if (!enc || !enc.includes(':')) return enc || '';
  try {
    const [ivHex, tagHex, dataHex] = enc.split(':');
    const iv   = Buffer.from(ivHex, 'hex');
    const tag  = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const dec  = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(data), dec.final()]).toString('utf8');
  } catch { return '[encrypted]'; }
}

// ── AUDIT HELPER ──────────────────────────────────────────────────────────────
function audit(action, table, rowId, detail = '', actor = 'system') {
  try {
    db.prepare(`INSERT INTO audit_log (actor,action,table_name,row_id,detail) VALUES (?,?,?,?,?)`)
      .run(actor, action, table, String(rowId), typeof detail === 'object' ? JSON.stringify(detail) : String(detail));
  } catch (_) { /* never let audit failure break main flow */ }
}

// ── CONTENT LOG ───────────────────────────────────────────────────────────────
const log = {
  insert(r, actor = 'system') {
    const enc = encrypt(r.caption || '');
    const info = db.prepare(`
      INSERT OR IGNORE INTO content_log
        (job_id, media_type, destination, theme, platforms, caption_enc, status, outputs, meta)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      r.jobId, r.mediaType, r.destination,
      r.theme || 'general',
      JSON.stringify(r.platforms || []),
      enc,
      r.status || 'pending',
      JSON.stringify(r.outputs || []),
      JSON.stringify(r.meta || {})
    );
    audit('INSERT', 'content_log', r.jobId, { mediaType: r.mediaType, destination: r.destination }, actor);
    return info;
  },

  update(jobId, patch, actor = 'system') {
    const allowed = ['status','approved','approved_at','outputs','meta','deleted_at','caption'];
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(clean).length) return;
    if (clean.caption) { clean.caption_enc = encrypt(clean.caption); delete clean.caption; }
    const sets = Object.keys(clean).map(k => `${k}=?`).join(',');
    db.prepare(`UPDATE content_log SET ${sets} WHERE job_id=?`).run(...Object.values(clean), jobId);
    audit('UPDATE', 'content_log', jobId, clean, actor);
  },

  approve(jobId, actor = 'user') {
    db.prepare(`UPDATE content_log SET approved=1, status='approved', approved_at=datetime('now') WHERE job_id=?`).run(jobId);
    audit('APPROVE', 'content_log', jobId, {}, actor);
  },

  // Soft delete — never hard deletes
  softDelete(jobId, actor = 'user') {
    db.prepare(`UPDATE content_log SET deleted_at=datetime('now'), status='deleted' WHERE job_id=?`).run(jobId);
    audit('SOFT_DELETE', 'content_log', jobId, {}, actor);
  },

  getRecent(n = 20, includeDeleted = false) {
    const rows = db.prepare(`
      SELECT * FROM content_log
      ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
      ORDER BY created DESC LIMIT ?
    `).all(n);
    return rows.map(r => {
      let outputs = JSON.parse(r.outputs || '[]');
      // If outputs array is empty but job is done, try to populate from actual output files
      if (outputs.length === 0 && (r.status === 'done' || r.approved)) {
        const jobFile = require('path').join(require('../config').OUTPUTS_DIR, `${r.job_id}.json`);
        const autoFile = require('path').join(require('../config').OUTPUTS_DIR, `auto_${r.job_id}.json`);
        try {
          let data;
          if (require('fs').existsSync(jobFile)) {
            data = JSON.parse(require('fs').readFileSync(jobFile, 'utf8'));
          } else if (require('fs').existsSync(autoFile)) {
            data = JSON.parse(require('fs').readFileSync(autoFile, 'utf8'));
          }
          if (data && data.results && Array.isArray(data.results)) {
            outputs = data.results.map(res => res.filename || res.file);
          }
        } catch (e) { /* Silently ignore file read errors */ }
      }
      return {
        ...r,
        caption: (r.caption_enc && r.caption_enc.includes(':') ? decrypt(r.caption_enc) : (r.caption || '')),
        platforms: JSON.parse(r.platforms || '[]'),
        outputs,
        meta:      JSON.parse(r.meta      || '{}')
      };
    });
  },

  getByJobId(jobId) {
    const r = db.prepare(`SELECT * FROM content_log WHERE job_id=?`).get(jobId);
    if (!r) return null;
    let outputs = JSON.parse(r.outputs || '[]');
    // If outputs array is empty but job is done, try to populate from actual output files
    if (outputs.length === 0 && (r.status === 'done' || r.approved)) {
      const jobFile = require('path').join(require('../config').OUTPUTS_DIR, `${jobId}.json`);
      const autoFile = require('path').join(require('../config').OUTPUTS_DIR, `auto_${jobId}.json`);
      try {
        let data;
        if (require('fs').existsSync(jobFile)) {
          data = JSON.parse(require('fs').readFileSync(jobFile, 'utf8'));
        } else if (require('fs').existsSync(autoFile)) {
          data = JSON.parse(require('fs').readFileSync(autoFile, 'utf8'));
        }
        if (data && data.results && Array.isArray(data.results)) {
          outputs = data.results.map(res => res.filename || res.file);
        }
      } catch (e) { /* Silently ignore file read errors */ }
    }
    return { 
      ...r, 
      caption: (r.caption_enc && r.caption_enc.includes(':') ? decrypt(r.caption_enc) : (r.caption || '')), 
      platforms: JSON.parse(r.platforms||'[]'), 
      outputs
    };
  },

  getUnusedDestinations(allDests) {
    const used = db.prepare(`
      SELECT DISTINCT destination FROM content_log
      WHERE created > datetime('now','-7 days') AND deleted_at IS NULL
    `).all().map(r => r.destination);
    return allDests.filter(d => !used.includes(d));
  },

  getUnusedThemes(allThemes) {
    const used = db.prepare(`
      SELECT DISTINCT theme FROM content_log
      WHERE created > datetime('now','-3 days') AND deleted_at IS NULL
    `).all().map(r => r.theme);
    return allThemes.filter(t => !used.includes(t));
  },

  // Retention: mark outputs as stale after 30 days
  pruneOldOutputs(days = 30) {
    const result = db.prepare(`
      UPDATE content_log SET meta=json_set(meta,'$.pruned',1)
      WHERE created < datetime('now','-${days} days') AND deleted_at IS NULL
        AND json_extract(meta,'$.pruned') IS NULL
    `).run();
    audit('PRUNE', 'content_log', 'batch', { days, affected: result.changes });
    return result.changes;
  }
};

// ── AUDIT LOG READER ──────────────────────────────────────────────────────────
const auditLog = {
  getRecent(n = 50) {
    return db.prepare(`SELECT * FROM audit_log ORDER BY created DESC LIMIT ?`).all(n);
  },
  getForJob(jobId) {
    return db.prepare(`SELECT * FROM audit_log WHERE row_id=? ORDER BY created ASC`).all(jobId);
  }
};

// ── BRAND STATE KV ────────────────────────────────────────────────────────────
const state = {
  get:  (key, def = '') => { const r = db.prepare(`SELECT value FROM brand_state WHERE key=?`).get(key); return r ? r.value : def; },
  set:  (key, val)      => { db.prepare(`INSERT OR REPLACE INTO brand_state (key,value,updated) VALUES (?,?,datetime('now'))`).run(key, String(val)); audit('KV_SET','brand_state',key); },
  del:  (key)           => { db.prepare(`DELETE FROM brand_state WHERE key=?`).run(key); }
};

// ── STARTUP INTEGRITY CHECK ────────────────────────────────────────────────────
try {
  const check = db.pragma('integrity_check');
  if (check[0]?.integrity_check !== 'ok') console.warn('[DB] Integrity check warning:', check);
} catch (e) { console.error('[DB] Integrity check failed:', e.message); }

module.exports = { log, auditLog, state, db, encrypt, decrypt };
