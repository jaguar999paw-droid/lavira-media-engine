// server.js — Lavira Media Engine v3.0
require('dotenv').config();
const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const cfg      = require('./config');
const BRAND    = require('./orchestrator/brand');

[cfg.UPLOADS_DIR, cfg.OUTPUTS_DIR, cfg.ASSETS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const app = express();
app.use(require('cors')());
app.use(express.json());
app.use('/outputs', express.static(cfg.OUTPUTS_DIR));
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/intake', require('./routes/intake'));
app.use('/api',        require('./routes/output'));

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const ffmpegOk = (() => { try { require('child_process').execSync('ffmpeg -version 2>/dev/null'); return true; } catch { return false; } })();
  res.json({
    status:  'ok',
    engine:  'Lavira Media Engine v3.0',
    brand:   BRAND.name,
    ffmpeg:  ffmpegOk,
    ai:      !!cfg.ANTHROPIC_KEY,
    giphy:   !!cfg.GIPHY_KEY,
    pexels:  !!(process.env.PEXELS_API_KEY || cfg.PEXELS_KEY),
    destinations: BRAND.destinations.length,
    packages:     BRAND.safari_packages.length
  });
});

// ── Brand ────────────────────────────────────────────────────────────────────
app.get('/api/brand', (req, res) => res.json(BRAND));

// ── Smart caption (LRU destination) ─────────────────────────────────────────
app.get('/api/caption', (req, res) => {
  try {
    const { log } = require('./orchestrator/memory');
    const unused = log.getUnusedDestinations(BRAND.destinations);
    const destination = unused.length ? unused[0] : BRAND.destinations[0];
    const { generateCaption } = require('./content/captions');
    res.json({ ...generateCaption(destination), destination });
  } catch (e) {
    const destination = BRAND.destinations[Math.floor(Math.random() * BRAND.destinations.length)];
    res.json({ destination, caption: `Experience the wild beauty of ${destination} with Lavira Safaris!`, hashtags: BRAND.hashtags.core });
  }
});

// ── Platform + audio specs (for UI) ─────────────────────────────────────────
app.get('/api/specs', (req, res) => {
  const { PLATFORMS }       = require('./engines/video');
  const { PROFILES, DURATION_PRESETS, PLATFORM_DURATIONS } = require('./engines/audio');
  res.json({ video: PLATFORMS, audio: { PROFILES, DURATION_PRESETS, PLATFORM_DURATIONS } });
});

// ── Schedule ─────────────────────────────────────────────────────────────────
app.get('/api/schedule',             (req, res) => { try { res.json(require('./scheduler').getSchedule()); } catch { res.json({ entries: [] }); } });
app.post('/api/schedule/generate',   async (req, res) => { try { res.json({ success:true, entry: await require('./scheduler').generateDailyPromo() }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/schedule/:id/approve',(req, res) => { try { res.json({ success:true, entry: require('./scheduler').approveScheduledEntry(req.params.id) }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ── Publishing ───────────────────────────────────────────────────────────────
app.get('/api/publishing/status',   (req, res) => { try { res.json(require('./publishing').platformStatus()); } catch { res.json([]); } });
app.post('/api/job/:jobId/publish', async (req, res) => { try { res.json(await require('./publishing').publishJob(req.params.jobId, req.body.platforms || [])); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/job/:jobId/bundle',   (req, res) => { try { res.json(require('./publishing').getPostBundle(req.params.jobId)); } catch (e) { res.status(500).json({ error: e.message }); } });

// ── Compositor / Ready-to-post ──────────────────────────────────────────────
app.post('/api/job/:jobId/make-ready', async (req, res) => {
  try {
    const stateFile = require('path').join(cfg.OUTPUTS_DIR, `${req.params.jobId}.json`);
    if (!require('fs').existsSync(stateFile)) return res.status(404).json({ error:'Job not found' });
    const result = await require('./engines/compositor').buildReadyToPostPackage(stateFile, req.body || {});
    res.json({ jobId:req.params.jobId, ...result });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/composite', require('multer')({ storage: require('multer').diskStorage({ destination: cfg.UPLOADS_DIR, filename:(_,f,cb)=>cb(null,'comp_'+Date.now()+require('path').extname(f.originalname)) }) }).single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error:'No file uploaded' });
  try {
    const opts = JSON.parse(req.body.options||'{}');
    const ext  = require('path').extname(req.file.path).toLowerCase();
    const comp = require('./engines/compositor');
    const result = ['.mp4'].includes(ext)
      ? await comp.compositeVideo(req.file.path, opts)
      : await comp.compositeImage(req.file.path, opts);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── API Status (for UI requirements panel) ──────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    claude_ai:  { ok: !!cfg.ANTHROPIC_KEY, label:'Claude AI Captions', required_for:'AI captions & story hooks', setup:'Add ANTHROPIC_API_KEY to .env' },
    giphy:      { ok: !!cfg.GIPHY_KEY,     label:'GIPHY GIFs',         required_for:'GIF search & animation',   setup:'Add GIPHY_API_KEY to .env (free at giphy.com/developers)' },
    pexels:     { ok: !!process.env.PEXELS_API_KEY, label:'Pexels Stock Images', required_for:'Zero-media auto-promo', setup:'Add PEXELS_API_KEY to .env (free at pexels.com/api)' },
    ffmpeg:     { ok: true,               label:'FFmpeg',             required_for:'Video & audio processing', setup:'Already installed' },
    instagram:  { ok: !!process.env.INSTAGRAM_ACCESS_TOKEN, label:'Instagram Publishing', required_for:'Auto-post to Instagram', setup:'Requires Meta Business App + token' },
    tiktok:     { ok: !!process.env.TIKTOK_ACCESS_TOKEN, label:'TikTok Publishing', required_for:'Auto-post to TikTok', setup:'Requires TikTok Developer App + token' },
  });
});

// ── Admin Settings (persisted) ────────────────────────────────────────────────
app.get('/api/admin/settings', (req, res) => {
  try {
    const { readSettings } = require('./orchestrator/settings');
    res.json(readSettings());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/settings', (req, res) => {
  try {
    const { writeSettings } = require('./orchestrator/settings');
    const next = writeSettings(req.body || {}, 'user');
    res.json({ success: true, settings: next });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── One-click workflow (Today’s Post) ─────────────────────────────────────────
app.post('/api/workflow/today', async (req, res) => {
  try {
    const { readSettings } = require('./orchestrator/settings');
    const { log } = require('./orchestrator/memory');
    const promoEng = require('./engines/promo');
    const comp = require('./engines/compositor');
    const settings = readSettings();

    const destination = req.body?.destination
      || (log.getUnusedDestinations(BRAND.destinations)[0] || BRAND.destinations[0]);
    const theme = req.body?.theme || settings.workflow?.defaultTheme || 'wildlife_spotlight';
    const profiles = req.body?.profiles || ['instagram_post', 'instagram_story', 'facebook_feed'];
    const context = req.body?.context || '';

    // Generate base promo (downloads real stock where possible)
    const jobId = 'wf_' + require('uuid').v4().slice(0, 8);
    const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
    fs.writeFileSync(stateFile, JSON.stringify({ status: 'processing', jobId, mediaType: 'workflow', destination, theme, profiles }));

    const result = await promoEng.generateAutoPromo({ destination, theme, context, profiles });
    const s = { status: 'done', jobId, mediaType: 'auto', destination, theme, profiles, ...result };
    fs.writeFileSync(stateFile, JSON.stringify(s));
    try {
      log.insert({ jobId, mediaType: 'auto', destination, theme, platforms: profiles, caption: result.promo?.caption || '', status: 'done', outputs: (result.results || []).map(r => r.filename).filter(Boolean) });
    } catch {}

    // Build ready-to-post overlays for everything we produced
    const pkg = await comp.buildReadyToPostPackage(stateFile, { promoType: result.promo?.relatedPackage?.name || '', hook: result.promo?.hook || '' });

    // Auto-approve if configured
    if (settings.workflow?.approvalRequired === false) {
      try {
        const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        st.status = 'approved';
        st.approved = true;
        st.approvedAt = new Date().toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(st));
        try { log.approve(jobId, 'system'); } catch {}
      } catch {}
    }

    res.json({ success: true, jobId, destination, theme, profiles, promo: result.promo, ...pkg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cache management endpoints (admin/ops) ────────────────────────────────────
app.post('/api/cache/prune', (req, res) => {
  try {
    const cache = require('./engines/media-cache');
    const out = cache.prune();
    res.json({ success: true, ...out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cache/clear', (req, res) => {
  try {
    const cache = require('./engines/media-cache');
    const out = cache.clear();
    res.json({ success: true, ...out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Audio + media mixing (simple “add music”) ────────────────────────────────
app.post('/api/mix', require('multer')({ storage: require('multer').diskStorage({
  destination: cfg.UPLOADS_DIR,
  filename:(_,f,cb)=>cb(null,'mix_'+Date.now()+path.extname(f.originalname))
})}).fields([{ name: 'media', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
  try {
    const media = req.files?.media?.[0];
    const audio = req.files?.audio?.[0];
    if (!media) return res.status(400).json({ error: 'media file required' });
    if (!audio) return res.status(400).json({ error: 'audio file required' });
    const durationSeconds = req.body?.durationSeconds ? Number(req.body.durationSeconds) : undefined;
    const mixer = require('./engines/media-mixer');
    const out = await mixer.mixAudioWithMedia({ mediaPath: media.path, audioPath: audio.path, durationSeconds });
    res.json({ success: true, ...out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mix an existing output (by filename) with an uploaded audio track
app.post('/api/mix-existing', require('multer')({ storage: require('multer').diskStorage({
  destination: cfg.UPLOADS_DIR,
  filename:(_,f,cb)=>cb(null,'mix_audio_'+Date.now()+path.extname(f.originalname))
})}).single('audio'), async (req, res) => {
  try {
    const audio = req.file;
    const mediaFilename = String(req.body?.mediaFilename || '').trim();
    const durationSeconds = req.body?.durationSeconds ? Number(req.body.durationSeconds) : undefined;
    if (!mediaFilename) return res.status(400).json({ error: 'mediaFilename required' });
    if (!audio) return res.status(400).json({ error: 'audio file required' });
    const mediaPath = path.join(cfg.OUTPUTS_DIR, path.basename(mediaFilename));
    if (!fs.existsSync(mediaPath)) return res.status(404).json({ error: 'Output media not found' });
    const mixer = require('./engines/media-mixer');
    const out = await mixer.mixAudioWithMedia({ mediaPath, audioPath: audio.path, durationSeconds });
    res.json({ success: true, ...out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── File Cleanup ─────────────────────────────────────────────────────────────
app.post('/api/cleanup', (req, res) => {
  const fs   = require('fs');
  const path = require('path');
  const maxAgeMs = (parseInt(req.body?.days || 7)) * 24 * 60 * 60 * 1000;
  const now  = Date.now();
  let deleted = 0;
  try {
    const entries = fs.readdirSync(cfg.OUTPUTS_DIR);
    entries.forEach(f => {
      const fp = path.join(cfg.OUTPUTS_DIR, f);
      try {
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > maxAgeMs) { fs.unlinkSync(fp); deleted++; }
      } catch {}
    });
    // Also clean uploads older than 1 day
    fs.readdirSync(cfg.UPLOADS_DIR).forEach(f => {
      const fp = path.join(cfg.UPLOADS_DIR, f);
      try {
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) { fs.unlinkSync(fp); deleted++; }
      } catch {}
    });
    res.json({ success: true, deleted, message: `Deleted ${deleted} files older than ${req.body?.days || 7} days` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Audit log ────────────────────────────────────────────────────────────────
app.get('/api/audit', (req, res) => {
  try {
    const { auditLog } = require('./orchestrator/memory');

// ── Serve local media library images & sample media ──────────────────────────
app.use('/images', express.static(path.join(__dirname, '../images')));
app.use('/videos', express.static(path.join(__dirname, '../videos')));
app.use('/samples/images', express.static(path.join(__dirname, '../samples/images')));
app.use('/samples/videos', express.static(path.join(__dirname, '../samples/videos')));
app.use('/samples/audio', express.static(path.join(__dirname, '../samples/audio')));

// ── Media Library API ─────────────────────────────────────────────────────────
const mediaLib = require('./engines/media-library');

app.get('/api/library', async (req, res) => {
  try {
    const stats = mediaLib.getStats();
    if (!stats.indexed) {
      await mediaLib.buildLibrary();
      return res.json({ built: true, ...mediaLib.getStats() });
    }
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/library/index', async (req, res) => {
  try {
    const result = await mediaLib.buildLibrary(req.body?.force || false);
    res.json({ success: true, total: result.items.length, images: result.totalImages, videos: result.totalVideos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/library/select', (req, res) => {
  try {
    const item = mediaLib.selectByContext({
      tags:        (req.query.tags||'').split(',').filter(Boolean),
      destination:  req.query.destination,
      mediaType:    req.query.type || 'image'
    });
    if (!item) return res.status(404).json({ error: 'No matching media found' });
    res.json({ ...item, previewUrl: '/images/' + encodeURIComponent(item.filename) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/library/items', (req, res) => {
  try {
    const lib = mediaLib.loadLibrary();
    if (!lib) return res.json({ items: [] });
    let items = lib.items;
    if (req.query.tag) items = items.filter(i => i.tags.includes(req.query.tag));
    if (req.query.destination) items = items.filter(i => i.destination === req.query.destination);
    if (req.query.type) items = items.filter(i => i.mediaType === req.query.type);
    res.json({ total: items.length, items: items.slice(0, parseInt(req.query.limit)||50) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Card Templates API ─────────────────────────────────────────────────────────
const cards = require('./engines/card-templates');

app.post('/api/cards/generate', async (req, res) => {
  try {
    const { template='hero_destination', data={}, profiles, useLibraryImage=true } = req.body;
    let backgroundImage = null;

    if (useLibraryImage) {
      const dest = data.destination;
      const tags  = template === 'wildlife_spotlight' ? ['wildlife','nature'] :
                    template === 'testimonial'         ? ['safari','landscape'] :
                    template === 'package_promo'        ? ['nature','landscape'] : [];
      const item = mediaLib.selectByContext({ tags, destination: dest, mediaType: 'image' });
      if (item) backgroundImage = item.sourcePath;
    }

    const targetProfiles = profiles || ['instagram_post','instagram_story','facebook'];
    const results = await cards.renderAllProfiles(template, data, backgroundImage, targetProfiles);
    res.json({ template, results, backgroundUsed: backgroundImage ? path.basename(backgroundImage) : null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Quick single-card endpoint
app.post('/api/cards/quick', async (req, res) => {
  try {
    const { template, data, profile='instagram_post', destinationForImage } = req.body;
    let backgroundImage = null;
    const dest = destinationForImage || data?.destination;
    if (dest) {
      const item = mediaLib.selectByContext({ destination: dest, mediaType: 'image' });
      if (item) backgroundImage = item.sourcePath;
    }
    const result = await cards.renderCard({ template: template||'hero_destination', data: data||{}, backgroundImage, profile });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

    res.json(auditLog.getRecent(parseInt(req.query.n) || 50));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/audit/:jobId', (req, res) => {
  try {
    const { auditLog } = require('./orchestrator/memory');
    res.json(auditLog.getForJob(req.params.jobId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Publishing / Direct Posting ──────────────────────────────────────────────
const pub = require('./publishing/index');

app.post('/api/job/:jobId/publish', async (req, res) => {
  try {
    const { platforms = ['instagram', 'tiktok', 'facebook'] } = req.body;
    const result = await pub.publishJob(req.params.jobId, platforms);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/publish/status', (req, res) => {
  res.json({ platforms: pub.platformStatus() });
});

// ── Sample Media Library ─────────────────────────────────────────────────────
app.get('/api/samples/list', (req, res) => {
  try {
    const type = req.query.type || 'all'; // all, images, videos, audio
    const destination = req.query.destination;
    const { listSampleMedia } = require('./engines/media-library');
    const samples = listSampleMedia({ type, destination });
    res.json(samples);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/samples/:type/:destination', (req, res) => {
  try {
    const { getSamplesByDestination } = require('./engines/media-library');
    const samples = getSamplesByDestination(req.params.type, req.params.destination);
    res.json(samples);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(cfg.PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  LAVIRA MEDIA ENGINE  v3.0               ║`);
  console.log(`  ║  http://localhost:${cfg.PORT}                ║`);
  console.log(`  ║  Brand : ${BRAND.name.padEnd(30)}║`);
  console.log(`  ║  Dests : ${String(BRAND.destinations.length).padEnd(30)}║`);
  console.log(`  ║  Pkgs  : ${String(BRAND.safari_packages.length).padEnd(30)}║`);
  console.log(`  ║  AI    : ${(cfg.ANTHROPIC_KEY ? '✓ Claude API' : '✗ Add ANTHROPIC_API_KEY').padEnd(30)}║`);
  console.log(`  ║  Pexels: ${(process.env.PEXELS_API_KEY ? '✓ Stock images' : '✗ Add PEXELS_API_KEY').padEnd(30)}║`);
  console.log(`  ║  MCP   : node src/mcp/server.js          ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
  try { require('./scheduler').start(); } catch (e) { console.warn('[Scheduler]', e.message); }
});
