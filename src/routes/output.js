// routes/output.js — Output approval, review, and sharing interface
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const cfg     = require('../config');
const { log } = require('../orchestrator/memory');

const router = express.Router();

// Poll any job by ID
router.get('/job/:jobId', (req,res)=>{
  const f = path.join(cfg.OUTPUTS_DIR, `${req.params.jobId}.json`);
  if(!fs.existsSync(f)) return res.status(404).json({error:'Job not found'});
  res.json(JSON.parse(fs.readFileSync(f,'utf8')));
});

// ── Approve a completed job (marks it ready for sharing)
router.post('/job/:jobId/approve', (req,res)=>{
  const f = path.join(cfg.OUTPUTS_DIR, `${req.params.jobId}.json`);
  if(!fs.existsSync(f)) return res.status(404).json({error:'Job not found'});
  const state = JSON.parse(fs.readFileSync(f,'utf8'));
  state.approved = true; state.approvedAt = new Date().toISOString();
  state.status = 'approved';
  fs.writeFileSync(f, JSON.stringify(state));
  log.approve(req.params.jobId);
  res.json({success:true, jobId:req.params.jobId, status:'approved'});
});

// ── Reject / request redo
router.post('/job/:jobId/reject', (req,res)=>{
  const f = path.join(cfg.OUTPUTS_DIR, `${req.params.jobId}.json`);
  if(!fs.existsSync(f)) return res.status(404).json({error:'Job not found'});
  const state = JSON.parse(fs.readFileSync(f,'utf8'));
  state.status = 'rejected'; state.rejectedAt = new Date().toISOString();
  state.rejectNote = req.body.note || '';
  fs.writeFileSync(f, JSON.stringify(state));
  log.update(req.params.jobId, {status:'rejected'});
  res.json({success:true, jobId:req.params.jobId, status:'rejected'});
});

// ── List all output media files
router.get('/files', (req,res)=>{
  const mediaExt = /\.(mp4|gif|jpg|jpeg|png|mp3|ogg)$/i;
  const files = fs.readdirSync(cfg.OUTPUTS_DIR)
    .filter(f=>mediaExt.test(f))
    .map(f=>{ const s=fs.statSync(path.join(cfg.OUTPUTS_DIR,f)); return {filename:f,url:`/outputs/${f}`,size:s.size,created:s.mtime}; })
    .sort((a,b)=>new Date(b.created)-new Date(a.created));
  res.json(files);
});

// ── Recent jobs from memory with full promo data
router.get('/recent', (req,res)=>{
  const rows = log.getRecent(parseInt(req.query.n||20));
  // platforms & outputs already parsed by memory.getRecent()
  res.json(rows.map(r=>({...r,
    platforms: Array.isArray(r.platforms) ? r.platforms : JSON.parse(r.platforms||'[]'),
    outputs:   Array.isArray(r.outputs)   ? r.outputs   : JSON.parse(r.outputs||'[]')
  })));
});

// ── Share package: returns everything needed for a social post
router.get('/job/:jobId/share', (req,res)=>{
  const f = path.join(cfg.OUTPUTS_DIR, `${req.params.jobId}.json`);
  if(!fs.existsSync(f)) return res.status(404).json({error:'Job not found'});
  const state = JSON.parse(fs.readFileSync(f,'utf8'));
  const share = {
    caption:    state.promo?.caption || '',
    hook:       state.promo?.hook || '',
    hashtags:   state.promo?.hashtags || [],
    ctaBlock:   state.promo?.ctaBlock || '',
    destination:state.destination || '',
    mediaType:  state.mediaType || '',
    files:      (state.results||[]).map(r=>({label:r.label,url:r.downloadUrl||`/outputs/${r.filename}`,filename:r.filename})),
    platform_copy: Object.fromEntries((state.results||[]).map(r=>[r.platform||r.profile||r.label, {caption:state.promo?.caption, files:[r.filename]}])),
  };
  res.json(share);
});

// ── Edit caption (persist into state + DB)
router.put('/job/:jobId/caption', (req, res) => {
  const jobId = req.params.jobId;
  const caption = String(req.body?.caption || '').trim();
  if (!caption) return res.status(400).json({ error: 'caption required' });

  const f = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Job not found' });
  try {
    const state = JSON.parse(fs.readFileSync(f, 'utf8'));
    state.promo = state.promo || {};
    state.promo.caption = caption;
    state.captionEditedAt = new Date().toISOString();
    fs.writeFileSync(f, JSON.stringify(state));

    // Persist to DB (encrypted caption column)
    try { log.update(jobId, { caption }, 'user'); } catch {}

    res.json({ success: true, jobId, caption });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
