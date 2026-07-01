#!/usr/bin/env node
// src/mcp/servers/publish-server.js — lavira-publish
// Concern: Social publishing, scheduling, booking flows
// Tools: 13 | Op types: W, A, D — writes to social APIs or scheduler/DB
'use strict';

const rpc = require('../lib/rpc-core');
const cfg = require('../../config');

let publishEng, instagramEng, multiPlatform, whatsappEng, scheduler, memory;
try { publishEng    = require('../../publishing/index');          } catch { publishEng    = null; }
try { instagramEng  = require('../../publishing/instagram');      } catch { instagramEng  = null; }
try { multiPlatform = require('../../publishing/multi-platform'); } catch { multiPlatform = null; }
try { whatsappEng  = require('../../publishing/whatsapp');        } catch { whatsappEng  = null; }
try { scheduler     = require('../../scheduler/index');           } catch { scheduler     = null; }
try { memory        = require('../../orchestrator/memory');       } catch { memory        = null; }

const TOOLS = [
  { name:'post_to_instagram',
    description:'Publish a file to Instagram Reels, Feed, or Stories. Requires INSTAGRAM_ACCESS_TOKEN. Set dry_run:true to validate without posting. Caption auto-truncated at 2200 chars.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},caption:{type:'string'},type:{type:'string',enum:['feed','reel','story']},jobId:{type:'string'},dry_run:{type:'boolean',description:'Validate without posting'}},required:['filePath','caption']}},
  { name:'post_to_tiktok',
    description:'Publish a video to TikTok via v2 Content Posting API (chunked upload). Requires TIKTOK_ACCESS_TOKEN. Set dry_run:true to validate. Caption auto-truncated at 2200 chars.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},caption:{type:'string'},jobId:{type:'string'},dry_run:{type:'boolean',description:'Validate without uploading'}},required:['filePath','caption']}},
  { name:'post_to_facebook',
    description:'Publish a file to Facebook page feed. Requires FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID. Set dry_run:true to validate without posting.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},caption:{type:'string'},jobId:{type:'string'},dry_run:{type:'boolean',description:'Validate without posting'}},required:['filePath','caption']}},
  { name:'publish_job',
    description:'Publish a finished job to multiple platforms at once. Fails gracefully per platform. Set dry_run:true to preview without posting.',
    inputSchema:{type:'object',properties:{jobId:{type:'string'},filePath:{type:'string'},caption:{type:'string'},platforms:{type:'array',items:{type:'string'},description:'e.g. ["instagram","facebook","whatsapp"]'},dry_run:{type:'boolean',description:'Preview all platforms without posting'}},required:['filePath','caption']}},
  { name:'schedule_post',
    description:'Schedule a job/sample to post at a specific time to selected platforms.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},caption:{type:'string'},scheduledAt:{type:'string',description:'ISO 8601 datetime e.g. "2026-06-08T09:00:00"'},platforms:{type:'array'}},required:['filePath','caption','scheduledAt']}},
  { name:'get_daily_schedule',
    description:'Get the auto-generated daily promo schedule for today.',
    inputSchema:{type:'object',properties:{date:{type:'string',description:'ISO date (default: today)'}}}},
  { name:'trigger_daily_promo',
    description:'Immediately trigger the daily auto-promo generation (normally runs at 06:00 EAT).',
    inputSchema:{type:'object',properties:{destination:{type:'string'},date:{type:'string'}}}},
  { name:'approve_job',
    description:'Mark a completed job as approved for sharing.',
    inputSchema:{type:'object',properties:{jobId:{type:'string'},note:{type:'string'}},required:['jobId']}},
  { name:'reject_job',
    description:'Reject a job and flag it with a reason.',
    inputSchema:{type:'object',properties:{jobId:{type:'string'},reason:{type:'string'}},required:['jobId']}},
  { name:'get_share_package',
    description:'Get complete sharing bundle for a job: caption, hook, hashtags, CTA, per-platform download links.',
    inputSchema:{type:'object',properties:{jobId:{type:'string'}},required:['jobId']}},
  { name:'record_booking',
    description:'Manually record a confirmed safari booking (guest, destination, package, travel date).',
    inputSchema:{type:'object',properties:{destination:{type:'string'},package:{type:'string'},travelDate:{type:'string'},guestCount:{type:'number'},notes:{type:'string'}},required:['destination','travelDate']}},
  { name:'trigger_post_booking_flow',
    description:'Trigger social content generation for an already-recorded booking (auto-generates celebration post).',
    inputSchema:{type:'object',properties:{bookingId:{type:'string'},destination:{type:'string'}}}},
  { name:'post_to_twitter',
    description:'Post a tweet with optional media to Twitter/X via OAuth1a + v2 API. Requires all 4 TWITTER_* keys. Caption auto-truncated at 280 chars. Set dry_run:true to validate.',
    inputSchema:{type:'object',properties:{filePath:{type:'string',description:'Image or video to attach (optional)'},caption:{type:'string'},dry_run:{type:'boolean',description:'Validate without posting'}},required:['caption']}},
  { name:'post_to_whatsapp',
    description:'Send an image or video to a WhatsApp Business number. Requires WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN. Optional dryRun:true validates without sending.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},caption:{type:'string'},recipient:{type:'string',description:'Phone number with country code e.g. +254712345678'},dryRun:{type:'boolean'}},required:['filePath','caption']}},
  { name:'list_booking_events',
    description:'List recent bookings with guest details, destination, travel date, and whether a post was generated.',
    inputSchema:{type:'object',properties:{limit:{type:'number'},destination:{type:'string'}}}}
];

// ── Module-level SQLite (opened once, shared across handlers) ────────────────
const _pathM = require('path');
const _DatabaseM = require('better-sqlite3');
const _dbPathM = require('../../config').DB_PATH || _pathM.join(_pathM.resolve(__dirname, '../../../..'), 'lavira.db');
const _dbShared = new _DatabaseM(_dbPathM);
_dbShared.pragma('journal_mode = WAL');
_dbShared.pragma('synchronous = NORMAL');
function getDB() { return _dbShared; }

// ── Handlers ────────────────────────────────────────────────────────────────

const HANDLERS = {

  async post_to_instagram({ filePath, caption, type, jobId, dry_run }) {
    // Caption limit enforcement
    const LIMIT = 2200;
    let captionWarning = null;
    if ((caption||'').length > LIMIT) { captionWarning = 'Caption truncated from ' + caption.length + ' to ' + LIMIT + ' chars'; caption = caption.slice(0, LIMIT); }
    if (dry_run) {
      const fs2 = require('fs');
      return { dryRun:true, platform:'instagram', wouldPost:{ filePath, caption, captionLength:(caption||'').length, type:type||'feed' }, captionWarning, fileExists: filePath ? fs2.existsSync(filePath) : false };
    }
    if (instagramEng?.publishToInstagram) return instagramEng.publishToInstagram({ filePath, caption, format: type });
    if (multiPlatform?.publishInstagram)  return multiPlatform.publishInstagram({ filePath, caption, format: type });
    if (!process.env.INSTAGRAM_ACCESS_TOKEN) return { status:'manual', platform:'instagram', message:'INSTAGRAM_ACCESS_TOKEN not configured', caption };
    throw new Error('Instagram engine not available');
  },

  async post_to_tiktok({ filePath, caption, jobId, dry_run }) {
    let tiktokEng;
    try { tiktokEng = require('../../publishing/tiktok'); } catch {}
    if (tiktokEng?.publishToTikTok) return tiktokEng.publishToTikTok({ filePath, caption, dryRun: dry_run });
    if (publishEng?.publishTikTok) return publishEng.publishTikTok({ filePath, caption, dryRun: dry_run });
    return { status:'manual', platform:'tiktok', message:'TikTok engine not available — ensure src/publishing/tiktok.js exists', caption };
  },

  async post_to_facebook({ filePath, caption, jobId, dry_run }) {
    const LIMIT = 63206;
    let captionWarning = null;
    if ((caption||'').length > LIMIT) { captionWarning = 'Caption truncated from ' + caption.length + ' to ' + LIMIT + ' chars'; caption = caption.slice(0, LIMIT); }
    if (dry_run) {
      const fs2 = require('fs');
      return { dryRun:true, platform:'facebook', wouldPost:{ filePath, caption, captionLength:(caption||'').length }, captionWarning, fileExists: filePath ? fs2.existsSync(filePath) : false };
    }
    if (multiPlatform?.publishFacebook) return multiPlatform.publishFacebook({ filePath, caption });
    if (!process.env.FACEBOOK_ACCESS_TOKEN) return { status:'manual', platform:'facebook', message:'FACEBOOK_ACCESS_TOKEN not configured', caption };
    throw new Error('Facebook engine not available');
  },

  async publish_job({ jobId, filePath, caption, platforms, dry_run }) {
    if (dry_run) {
      // Return what would be posted per platform without making API calls
      const tgts = platforms || ['instagram','facebook','tiktok'];
      const mp2 = multiPlatform;
      return {
        dryRun: true, jobId, platforms: tgts,
        perPlatform: tgts.map(p => ({
          platform: p,
          captionLength: (mp2?.adaptCaption ? mp2.adaptCaption(p, caption||'', '', [], '') : caption||'').length,
          tokenConfigured: (() => {
            const keys = { instagram: 'INSTAGRAM_ACCESS_TOKEN', facebook: 'FACEBOOK_ACCESS_TOKEN', tiktok: 'TIKTOK_ACCESS_TOKEN', whatsapp: 'WHATSAPP_ACCESS_TOKEN', telegram: 'TELEGRAM_BOT_TOKEN' };
            return keys[p] ? !!process.env[keys[p]] : null;
          })(),
        })),
      };
    }
    if (publishEng?.publishJob) return publishEng.publishJob(jobId, platforms);
    if (multiPlatform?.broadcastToAll) {
      return multiPlatform.broadcastToAll({ filePath, caption, platforms: platforms || ['instagram','facebook','tiktok'] });
    }
    throw new Error('Multi-platform publish engine not available');
  },

  async schedule_post({ filePath, caption, scheduledAt, platforms = [] }) {
    if (scheduler?.schedulePost) return scheduler.schedulePost({ filePath, caption, scheduledAt, platforms });
    // Fallback: write to schedule table in DB
    const db = getDB();
    db.exec(`CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT, caption TEXT, scheduled_at TEXT,
      platforms TEXT, status TEXT DEFAULT 'pending', created_at TEXT
    )`);
    const stmt = db.prepare('INSERT INTO schedule (file_path, caption, scheduled_at, platforms, created_at) VALUES (?,?,?,?,?)');
    const info = stmt.run(filePath, caption, scheduledAt, JSON.stringify(platforms), new Date().toISOString());
    return { scheduled: true, id: info.lastInsertRowid, scheduledAt, platforms };
  },

  async get_daily_schedule({ date } = {}) {
    if (scheduler?.getDailySchedule) return scheduler.getDailySchedule(date);
    const db = getDB();
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT, caption TEXT, scheduled_at TEXT, platforms TEXT, status TEXT DEFAULT 'pending', created_at TEXT)`);
      const today = date || new Date().toISOString().slice(0, 10);
      const rows = db.prepare("SELECT * FROM schedule WHERE scheduled_at LIKE ? ORDER BY scheduled_at").all(today + '%');
        return { date: today, schedule: rows };
    } catch(e) { return { schedule: [], error: e.message }; }
  },

  async trigger_daily_promo({ destination, date } = {}) {
    if (scheduler?.triggerDailyPromo) return scheduler.triggerDailyPromo({ destination, date });
    return { triggered: true, note: 'Scheduler not connected — generate manually using brand server smart_generate.' };
  },

  async approve_job({ jobId, note }) {
    if (memory?.approveJob) return memory.approveJob({ jobId, note });
    const db = getDB();
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT, note TEXT, updated_at TEXT)`);
      db.prepare('INSERT OR REPLACE INTO jobs (id, status, note, updated_at) VALUES (?,?,?,?)').run(jobId, 'approved', note || '', new Date().toISOString());
        return { approved: true, jobId };
    } catch(e) { throw e; }
  },

  async reject_job({ jobId, reason }) {
    if (memory?.rejectJob) return memory.rejectJob({ jobId, reason });
    const db = getDB();
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT, note TEXT, updated_at TEXT)`);
      db.prepare('INSERT OR REPLACE INTO jobs (id, status, note, updated_at) VALUES (?,?,?,?)').run(jobId, 'rejected', reason || '', new Date().toISOString());
        return { rejected: true, jobId };
    } catch(e) { throw e; }
  },

  async get_share_package({ jobId }) {
    if (memory?.getSharePackage) return memory.getSharePackage(jobId);
    const db = getDB();
    try {
      const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
        return row || { error: `Job ${jobId} not found` };
    } catch(e) { return { error: e.message }; }
  },

  async record_booking({ destination, package: pkg, travelDate, guestCount, notes }) {
    if (memory?.recordBooking) return memory.recordBooking({ destination, package: pkg, travelDate, guestCount, notes });
    const db = getDB();
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, destination TEXT, package TEXT, travel_date TEXT, guest_count INTEGER, notes TEXT, post_generated INTEGER DEFAULT 0, created_at TEXT)`);
      const info = db.prepare('INSERT INTO bookings (destination, package, travel_date, guest_count, notes, created_at) VALUES (?,?,?,?,?,?)').run(destination, pkg || '', travelDate, guestCount || 1, notes || '', new Date().toISOString());
        return { recorded: true, bookingId: info.lastInsertRowid, destination, travelDate };
    } catch(e) { throw e; }
  },

  async trigger_post_booking_flow({ bookingId, destination }) {
    if (memory?.triggerPostBookingFlow) return memory.triggerPostBookingFlow({ bookingId, destination });
    return { triggered: true, note: `Booking ${bookingId} flow ready — generate post using brand server smart_generate with destination: ${destination}.` };
  },

  async post_to_twitter({ filePath, caption, dry_run }) {
    let twitterEng;
    try { twitterEng = require('../../publishing/twitter'); } catch {}
    if (twitterEng?.publishToTwitter) return twitterEng.publishToTwitter({ filePath, caption, dryRun: dry_run });
    if (multiPlatform?.publishTwitter) return multiPlatform.publishTwitter({ filePath, caption, dryRun: dry_run });
    return { status:'manual', platform:'twitter', message:'Twitter publisher not available', caption };
  },

  async post_to_whatsapp(args) {
    if (whatsappEng?.publishToWhatsApp) return whatsappEng.publishToWhatsApp(args);
    if (!process.env.WHATSAPP_ACCESS_TOKEN) return { error: 'WHATSAPP_ACCESS_TOKEN not configured. Add to .env to enable WhatsApp publishing.' };
    throw new Error('WhatsApp engine not available');
  },

  async list_booking_events({ limit = 10, destination } = {}) {
    if (memory?.listBookingEvents) return memory.listBookingEvents({ limit, destination });
    const db = getDB();
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, destination TEXT, package TEXT, travel_date TEXT, guest_count INTEGER, notes TEXT, post_generated INTEGER DEFAULT 0, created_at TEXT)`);
      let rows;
      if (destination) {
        rows = db.prepare('SELECT * FROM bookings WHERE destination LIKE ? ORDER BY created_at DESC LIMIT ?').all('%' + destination + '%', limit);
      } else {
        rows = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT ?').all(limit);
      }
        return { bookings: rows };
    } catch(e) { return { bookings: [], error: e.message }; }
  }
};

rpc.start({ name: 'lavira-publish', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
