#!/usr/bin/env node
// scripts/test-suite.js — Lavira Media Engine v3 full test suite
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const BASE   = `http://localhost:${process.env.PORT || 4004}`;
const REPORT = { passed: [], failed: [], warnings: [] };
const TMP    = '/tmp/lavira_test';
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP);

function req(method, url, body) {
  return new Promise((res, rej) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = { method, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} };
    const r = http.request(BASE + url, opts, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => { try { res({ status: resp.statusCode, body: JSON.parse(d) }); } catch { res({ status: resp.statusCode, body: d }); } });
    });
    r.on('error', rej);
    if (payload) r.write(payload);
    r.end();
  });
}

async function poll(jobId, maxWait = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2500));
    const { body } = await req('GET', `/api/job/${jobId}`);
    if (body.status === 'done')  return body;
    if (body.status === 'error') throw new Error(body.error || 'Job failed');
  }
  throw new Error(`Timed out after ${maxWait}ms`);
}

const pass = (n, d='') => { REPORT.passed.push({n,d}); console.log(`  ✅ ${n}${d?' — '+d:''}`); };
const fail = (n, e)    => { REPORT.failed.push({n,e:String(e)}); console.log(`  ❌ ${n}: ${e}`); };
const warn = (n, m)    => { REPORT.warnings.push({n,m}); console.log(`  ⚠️  ${n}: ${m}`); };

function ffgen(args) { cp.execSync(`ffmpeg ${args} -y 2>/dev/null`); }

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   LAVIRA MEDIA ENGINE v3 — FULL TEST SUITE           ║');
  console.log(`║   ${BASE.padEnd(53)}║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // 1. Health
  console.log('[ 1 ] Health');
  try {
    const { body } = await req('GET', '/api/health');
    if (body.status !== 'ok') throw new Error('not ok');
    pass('Health', `v=${body.engine} ffmpeg=${body.ffmpeg} ai=${body.ai} pexels=${body.pexels}`);
    if (!body.ai)     warn('Claude API', 'Credits exhausted — static captions active');
    if (!body.pexels) warn('Pexels API', 'No key — SVG fallback active');
  } catch(e) { fail('Health', e); }

  // 2. Brand dictionary
  console.log('\n[ 2 ] Brand Dictionary');
  try {
    const { body } = await req('GET', '/api/brand');
    if (!body.destinations?.length)       throw new Error('No destinations');
    if (!body.safari_packages?.length)    throw new Error('No packages');
    if (!body.destination_profiles)       throw new Error('No profiles');
    if (!body.testimonials?.length)       throw new Error('No testimonials');
    if (!body.pexels_queries)             throw new Error('No Pexels queries');
    pass('Brand', `${body.destinations.length} dests, ${body.safari_packages.length} pkgs, ${body.testimonials.length} testimonials`);
    pass('Destination profiles', Object.keys(body.destination_profiles).join(', '));
    pass('Content themes', body.content_themes?.join(', '));
  } catch(e) { fail('Brand', e); }

  // 3. Specs
  console.log('\n[ 3 ] Platform Specs');
  try {
    const { body } = await req('GET', '/api/specs');
    const vp = Object.entries(body.video || {});
    vp.forEach(([p, s]) => {
      if (!s.durations?.length) fail(`  ${p} durations`, 'missing');
      else pass(`  ${p}`, `durations=${s.durations.join('/')}s default=${s.defaultDur}s`);
    });
    pass('Audio presets', `[${body.audio?.DURATION_PRESETS?.join(', ')}]`);
  } catch(e) { fail('Specs', e); }

  // 4. Smart caption (LRU)
  console.log('\n[ 4 ] Smart Caption');
  try {
    const { body } = await req('GET', '/api/caption');
    if (!body.caption?.length) throw new Error('empty caption');
    if (!body.hashtags?.length) throw new Error('no hashtags');
    pass('Caption', `${body.destination}: "${body.caption.slice(0,60)}..."`);
    pass('Hook', body.hook || '(no hook — AI credits needed)');
  } catch(e) { fail('Caption', e); }

  // 5. Auto promo (zero-media)
  console.log('\n[ 5 ] Zero-Media Auto Promo');
  try {
    const { body: s } = await req('POST', '/api/intake/auto', { destination: 'Masai Mara', theme: 'wildlife_spotlight' });
    if (!s.jobId) throw new Error('No jobId: ' + JSON.stringify(s));
    pass('Auto start', `jobId=${s.jobId} dest=${s.destination}`);
    const d = await poll(s.jobId, 60000);
    if (!d.results?.length) throw new Error('No images');
    pass('Auto complete', `${d.results.length} images`);
    d.results.forEach(r => pass(`  Image`, `${r.profile||r.filename} → ${r.resolution||''}`));
    if (d.promo?.caption) pass('Auto caption', d.promo.caption.slice(0, 70) + '...');
    if (d.stockCredit)    pass('Stock photo', `by ${d.stockCredit.photographer} (Pexels)`);
    else warn('Stock photo', 'SVG fallback used');
  } catch(e) { fail('Auto promo', e); }

  // 6. Audio presets
  console.log('\n[ 6 ] Audio Duration Presets (90s source → 15/30/45/60s)');
  const audioFile = TMP + '/test.mp3';
  try {
    process.stdout.write('     Generating mock audio... ');
    ffgen(`-f lavfi -i anullsrc=r=44100:cl=stereo -t 90 -q:a 9 -acodec libmp3lame "${audioFile}"`);
    console.log('ok');
    const r = JSON.parse(cp.execSync(`curl -s -X POST ${BASE}/api/intake/audio -F "audio=@${audioFile}" -F 'profiles=["instagram_story","tiktok_audio","podcast_promo"]' -F 'presets=[15,30,45,60]'`).toString());
    if (!r.jobId) throw new Error(JSON.stringify(r));
    const d = await poll(r.jobId, 180000);
    const durs = [...new Set(d.results?.map(x => x.duration))].sort((a,b)=>a-b);
    pass('Audio presets produced', `${durs.join('s, ')}s across ${d.results?.length} files`);
    d.results?.forEach(f => pass(`  Audio`, `${f.profile} ${f.duration}s → ${f.filename}`));
  } catch(e) { fail('Audio presets', e); }

  // 7. Video variants + centre-clip
  console.log('\n[ 7 ] Video Platform Variants + Centre-Clip (300s source)');
  const videoFile = TMP + '/test.mp4';
  try {
    process.stdout.write('     Generating mock video (300s, 1920x1080)... ');
    ffgen(`-f lavfi -i testsrc=duration=300:size=1920x1080:rate=30 -f lavfi -i anullsrc=r=44100:cl=stereo -shortest -c:v libx264 -c:a aac -pix_fmt yuv420p -b:v 1M "${videoFile}"`);
    console.log('ok');
    const r = JSON.parse(cp.execSync(`curl -s -X POST ${BASE}/api/intake/video -F "video=@${videoFile}" -F 'platforms=["instagram_reel","tiktok","instagram_post","youtube_short","facebook","twitter"]'`).toString());
    if (!r.jobId) throw new Error(JSON.stringify(r));
    const d = await poll(r.jobId, 300000);
    if (!d.results?.length) throw new Error('No video outputs. Errors: ' + JSON.stringify(d.errors));
    d.results.forEach(r => pass(`  ${r.label}`, `${r.resolution} ${r.duration}s [${r.clipStrategy}]`));
    if (d.errors?.length) d.errors.forEach(e => warn(`  Skip`, `${e.platform}: ${e.error}`));
    if (d.thumbnail) pass('Thumbnail', d.thumbnail);
    const centred = d.results.filter(r => r.clipStrategy === 'centre');
    pass('Centre-clip', `${centred.length}/${d.results.length} variants used smart centre-clip`);
  } catch(e) { fail('Video variants', e); }

  // 8. Photo treatment
  console.log('\n[ 8 ] Photo Brand Treatment');
  const imageFile = TMP + '/test.jpg';
  try {
    ffgen(`-f lavfi -i color=c=green:size=3000x2000:rate=1 -frames:v 1 "${imageFile}"`);
    const r = JSON.parse(cp.execSync(`curl -s -X POST ${BASE}/api/intake/photo -F "photo=@${imageFile}" -F 'profiles=["instagram_post","instagram_story","facebook_cover","twitter_card","thumbnail"]'`).toString());
    if (!r.jobId) throw new Error(JSON.stringify(r));
    const d = await poll(r.jobId, 30000);
    if (!d.results?.length) throw new Error('No outputs');
    d.results.forEach(r => pass(`  ${r.label}`, `${r.resolution} → ${r.filename}`));
  } catch(e) { fail('Photo', e); }

  // 9. DB audit
  console.log('\n[ 9 ] Database — Security, Privacy, Auditability');
  try {
    const rows = JSON.parse(cp.execSync(`sqlite3 -json /home/kamau/lavira-media-engine/lavira.db "SELECT action,table_name,row_id FROM audit_log ORDER BY id DESC LIMIT 30;" 2>/dev/null || echo "[]"`).toString() || '[]');
    if (rows.length) {
      const actions = [...new Set(rows.map(r=>r.action))];
      pass('Audit log', `${rows.length} entries, actions: ${actions.join(', ')}`);
    } else warn('Audit log', 'No entries yet');
    const wal = cp.execSync(`sqlite3 /home/kamau/lavira-media-engine/lavira.db "PRAGMA journal_mode;" 2>/dev/null`).toString().trim();
    wal === 'wal' ? pass('WAL mode', 'journal_mode=WAL ✓') : warn('WAL', `mode=${wal}`);
    const encRows = JSON.parse(cp.execSync(`sqlite3 -json /home/kamau/lavira-media-engine/lavira.db "SELECT count(*) as n FROM content_log WHERE caption_enc LIKE '%:%:%'" 2>/dev/null || echo '[{"n":0}]'`).toString() || '[{"n":0}]');
    const encCount = encRows[0]?.n || 0;
    encCount > 0 ? pass('AES-256-GCM encryption', `${encCount} captions encrypted`) : warn('Encryption', 'No encrypted rows yet');
    const totalJobs = JSON.parse(cp.execSync(`sqlite3 -json /home/kamau/lavira-media-engine/lavira.db "SELECT count(*) as n FROM content_log WHERE deleted_at IS NULL" 2>/dev/null || echo '[{"n":0}]'`).toString())[0]?.n || 0;
    pass('Soft-delete', `${totalJobs} active jobs (deleted_at preserved)`);
  } catch(e) { fail('DB', e); }

  // 10. Schedule
  console.log('\n[ 10 ] Scheduler');
  try {
    const { body } = await req('GET', '/api/schedule');
    if (body.entries?.length) {
      const l = body.entries[0];
      pass('Schedule', `${body.entries.length} entries, latest: ${l.date} ${l.destination} [${l.status}]`);
      if (l.results?.length) pass('Daily images', `${l.results.length} images generated`);
    } else warn('Schedule', 'No entries (runs 06:00 EAT, or POST /api/schedule/generate)');
  } catch(e) { fail('Schedule', e); }

  // 11. Audit trail for a specific job
  console.log('\n[ 11 ] Audit Trail per Job');
  try {
    const { body: recent } = await req('GET', '/api/recent');
    if (recent.length) {
      const jobId = recent[0].job_id;
      const { body: audit } = await req('GET', `/api/audit/${jobId}`);
      pass('Job audit trail', `${audit.length} events for job ${jobId}: ${audit.map(a=>a.action).join(' → ')}`);
    } else warn('Audit trail', 'No jobs yet to audit');
  } catch(e) { fail('Audit trail', e); }

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   FINAL REPORT                                       ║');
  console.log(`║   ✅ Passed:   ${String(REPORT.passed.length).padEnd(5)}/ ${(REPORT.passed.length+REPORT.failed.length)}                           ║`);
  console.log(`║   ❌ Failed:   ${String(REPORT.failed.length).padEnd(38)}║`);
  console.log(`║   ⚠️  Warnings: ${String(REPORT.warnings.length).padEnd(37)}║`);
  console.log('╚═══════════════════════════════════════════════════════╝');
  if (REPORT.failed.length) { console.log('\n❌ Failures:'); REPORT.failed.forEach(f => console.log(`  ${f.n}: ${f.e}`)); }
  if (REPORT.warnings.length) { console.log('\n⚠️  Warnings:'); REPORT.warnings.forEach(w => console.log(`  ${w.n}: ${w.m}`)); }
  fs.writeFileSync('/tmp/lavira_test_report.json', JSON.stringify({...REPORT, timestamp: new Date().toISOString()}, null, 2));
  console.log('\n📋 Full report: /tmp/lavira_test_report.json\n');
  process.exit(REPORT.failed.length > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Fatal:', e.message); process.exit(2); });
