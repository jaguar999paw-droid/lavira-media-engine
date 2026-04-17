// routes/intake.js — v3.1: fixed auto route state + safe getRecent captions
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuid } = require('uuid');
const cfg      = require('../config');
const videoEng = require('../engines/video');
const imageEng = require('../engines/image');
const audioEng = require('../engines/audio');
const giphyEng = require('../engines/giphy');
const promoEng = require('../engines/promo');
const { generatePromoPackage } = require('../content/ai-captions');
const { log }  = require('../orchestrator/memory');
const BRAND    = require('../orchestrator/brand');

const router  = express.Router();
const storage = multer.diskStorage({
  destination: cfg.UPLOADS_DIR,
  filename:    (req, file, cb) => cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

function smartDestination() {
  try {
    const unused = log.getUnusedDestinations(BRAND.destinations);
    return unused.length ? unused[0] : BRAND.destinations[Math.floor(Math.random() * BRAND.destinations.length)];
  } catch { return BRAND.destinations[0]; }
}

function smartTheme() {
  try {
    const unused = log.getUnusedThemes(BRAND.content_themes);
    return unused.length ? unused[0] : BRAND.content_themes[Math.floor(Math.random() * BRAND.content_themes.length)];
  } catch { return 'wildlife_spotlight'; }
}

// Safe: strip encrypted placeholders from recent captions before passing to AI
function safeRecentCaptions(n = 7) {
  try {
    return log.getRecent(n)
      .map(r => r.caption)
      .filter(c => c && c !== '[encrypted]' && c.length > 10);
  } catch { return []; }
}

function writeState(stateFile, data) {
  fs.writeFileSync(stateFile, JSON.stringify(data));
}

// ── VIDEO ────────────────────────────────────────────────────────────────────
router.post('/video', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  try {
    const info        = await videoEng.probe(req.file.path);
    const destination = req.body.destination || smartDestination();
    const context     = req.body.context || `Safari video from ${destination}`;
    const promo       = await generatePromoPackage({ destination, mediaType: 'video', context, recentCaptions: safeRecentCaptions() });
    const jobId       = 'vid_' + uuid().slice(0, 8);
    const stateFile   = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
    const platforms   = JSON.parse(req.body.platforms || '["instagram_reel","tiktok","facebook"]');
    const opts = {
      trimStart: parseFloat(req.body.trimStart || 0),
      duration:  req.body.duration ? parseInt(req.body.duration) : null,
      speed:     parseFloat(req.body.speed || 1),
      quality:   req.body.quality || 'high'
    };
    writeState(stateFile, { status: 'processing', jobId, mediaType: 'video', destination, promo, platforms });
    log.insert({ jobId, mediaType: 'video', destination, platforms, caption: promo.caption });
    res.json({ jobId, status: 'processing', destination, promo, videoInfo: info, platforms, pollUrl: `/api/job/${jobId}` });
    videoEng.processAll(req.file.path, platforms, opts).then(async ({ results, errors }) => {
      let thumb = null;
      try { thumb = await videoEng.extractThumbnail(req.file.path); } catch {}
      writeState(stateFile, {
        status: 'done', jobId, mediaType: 'video', destination, promo,
        results: results.map(r => ({ ...r, downloadUrl: `/outputs/${r.filename}` })),
        errors, thumbnail: thumb ? `/outputs/${path.basename(thumb)}` : null
      });
      log.update(jobId, { status: 'done', outputs: JSON.stringify(results.map(r => r.filename)) });
    }).catch(err => writeState(stateFile, { status: 'error', jobId, error: err.message }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PHOTO ────────────────────────────────────────────────────────────────────
router.post('/photo', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  try {
    const info        = await imageEng.getImageInfo(req.file.path);
    const destination = req.body.destination || smartDestination();
    const context     = req.body.context || `Safari photo from ${destination}`;
    const promo       = await generatePromoPackage({ destination, mediaType: 'photo', context, recentCaptions: safeRecentCaptions() });
    const jobId       = 'img_' + uuid().slice(0, 8);
    const stateFile   = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
    const profiles    = JSON.parse(req.body.profiles || '["instagram_post","instagram_story","twitter_card"]');
    const opts        = { fit: req.body.fit || 'cover', brandTint: req.body.brandTint !== 'false' };
    writeState(stateFile, { status: 'processing', jobId, mediaType: 'photo', destination, promo });
    log.insert({ jobId, mediaType: 'photo', destination, platforms: profiles, caption: promo.caption });
    res.json({ jobId, status: 'processing', destination, promo, imageInfo: info, profiles, pollUrl: `/api/job/${jobId}` });
    imageEng.processImage(req.file.path, profiles, opts).then(({ results, errors }) => {
      writeState(stateFile, {
        status: 'done', jobId, mediaType: 'photo', destination, promo,
        results: results.map(r => ({ ...r, downloadUrl: `/outputs/${r.filename}` })), errors
      });
      log.update(jobId, { status: 'done', outputs: JSON.stringify(results.map(r => r.filename)) });
    }).catch(err => writeState(stateFile, { status: 'error', jobId, error: err.message }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AUDIO ────────────────────────────────────────────────────────────────────
router.post('/audio', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio uploaded' });
  try {
    const info        = await audioEng.probeAudio(req.file.path).catch(() => ({}));
    const destination = req.body.destination || smartDestination();
    const context     = req.body.context || `Safari audio for ${destination}`;
    const promo       = await generatePromoPackage({ destination, mediaType: 'audio', context, recentCaptions: safeRecentCaptions() });
    const jobId       = 'aud_' + uuid().slice(0, 8);
    const stateFile   = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
    const profiles    = JSON.parse(req.body.profiles || '["instagram_story","tiktok_audio"]');
    const opts        = {
      trimStart: parseFloat(req.body.trimStart || 0),
      presets:   req.body.presets ? JSON.parse(req.body.presets) : audioEng.DURATION_PRESETS
    };
    writeState(stateFile, { status: 'processing', jobId, mediaType: 'audio', destination, promo });
    log.insert({ jobId, mediaType: 'audio', destination, platforms: profiles, caption: promo.caption });
    res.json({ jobId, status: 'processing', destination, promo, audioInfo: info, profiles, pollUrl: `/api/job/${jobId}` });
    audioEng.processAudio(req.file.path, profiles, opts).then(({ results, errors }) => {
      writeState(stateFile, {
        status: 'done', jobId, mediaType: 'audio', destination, promo,
        results: results.map(r => ({ ...r, downloadUrl: `/outputs/${r.filename}` })), errors
      });
      log.update(jobId, { status: 'done', outputs: JSON.stringify(results.map(r => r.filename)) });
    }).catch(err => writeState(stateFile, { status: 'error', jobId, error: err.message }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AUTO (zero-media promo) ───────────────────────────────────────────────────
router.post('/auto', async (req, res) => {
  try {
    const destination = req.body.destination || smartDestination();
    const theme       = req.body.theme       || smartTheme();
    const context     = req.body.context     || '';
    const profiles    = req.body.profiles    || ['instagram_post', 'instagram_story', 'facebook'];
    const jobId       = 'auto_' + uuid().slice(0, 8);
    const stateFile   = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);

    // Write initial state WITH destination + theme so poll always has context
    writeState(stateFile, { status: 'processing', jobId, mediaType: 'auto', destination, theme, profiles });
    log.insert({ jobId, mediaType: 'auto', destination, theme, platforms: profiles, caption: '' });

    // Return immediately
    res.json({ jobId, status: 'processing', destination, theme, profiles, pollUrl: `/api/job/${jobId}` });

    // Run async
    promoEng.generateAutoPromo({ destination, theme, context, profiles, recentCaptions: safeRecentCaptions() })
      .then(result => {
        const filenames = (result.results || []).map(r => r.filename).filter(Boolean);
        writeState(stateFile, {
          status: 'done', jobId, mediaType: 'auto', destination, theme,
          promo:       result.promo,
          results:     result.results,
          stockCredit: result.stockCredit,
          query:       result.query,
          caption:     result.promo?.caption || ''
        });
        log.update(jobId, { status: 'done', outputs: JSON.stringify(filenames) });
      })
      .catch(err => {
        writeState(stateFile, { status: 'error', jobId, mediaType: 'auto', destination, theme, error: err.message });
        log.update(jobId, { status: 'error' });
      });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GIPHY ────────────────────────────────────────────────────────────────────
router.get('/giphy/search', async (req, res) => {
  const dest    = req.query.destination || smartDestination();
  const query   = req.query.q || (dest + ' safari wildlife');
  const suggestions = giphyEng.suggestQueries ? giphyEng.suggestQueries(dest) : [];
  const limit  = parseInt(req.query.limit || 12);
  const offset = parseInt(req.query.offset || 0);
  const results = await giphyEng.searchGiphy(query, limit, offset).catch(e => ({ results: [], error: e.message }));
  res.json({ ...results, suggestions, query, destination: dest, limit, offset });
});

router.post('/giphy/use', async (req, res) => {
  const { giphyId, destination, context } = req.body;
  if (!giphyId) return res.status(400).json({ error: 'giphyId required' });
  try {
    const dest      = destination || smartDestination();
    const promo     = await generatePromoPackage({ destination: dest, mediaType: 'giphy', context: context || `GIF for ${dest}`, recentCaptions: safeRecentCaptions() });
    const jobId     = 'gif_' + uuid().slice(0, 8);
    const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
    writeState(stateFile, { status: 'processing', jobId, mediaType: 'giphy', destination: dest, promo });
    log.insert({ jobId, mediaType: 'giphy', destination: dest, platforms: ['instagram', 'twitter'], caption: promo.caption });
    res.json({ jobId, status: 'processing', destination: dest, promo, pollUrl: `/api/job/${jobId}` });
    giphyEng.fetchGiphy(giphyId, 'mp4').then(({ file, filename }) => {
      writeState(stateFile, {
        status: 'done', jobId, mediaType: 'giphy', destination: dest, promo,
        results: [{ file, filename, downloadUrl: `/outputs/${filename}`, label: 'GIF/MP4' }]
      });
      log.update(jobId, { status: 'done', outputs: JSON.stringify([filename]) });
    }).catch(err => writeState(stateFile, { status: 'error', jobId, error: err.message }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
