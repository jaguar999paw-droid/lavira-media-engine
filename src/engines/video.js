// engines/video.js — v3: exact duration scales + centre-clip strategy per platform
'use strict';
const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');

// ── PLATFORM SPECS WITH DURATION SCALES ──────────────────────────────────────
const PLATFORMS = {
  instagram_reel: { w:1080, h:1920, fps:30, label:'Instagram Reel',  durations:[15,30,60],   defaultDur:30 },
  tiktok:         { w:1080, h:1920, fps:30, label:'TikTok',           durations:[15,30,60],   defaultDur:30 },
  instagram_post: { w:1080, h:1080, fps:30, label:'Instagram Post',   durations:[15,30],      defaultDur:15 },
  youtube_short:  { w:1080, h:1920, fps:30, label:'YouTube Short',    durations:[30,60],      defaultDur:60 },
  facebook:       { w:1280, h:720,  fps:30, label:'Facebook',         durations:[30,60,120],  defaultDur:60 },
  twitter:        { w:1280, h:720,  fps:30, label:'Twitter/X',        durations:[15,30],      defaultDur:30 },
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseFraction(str) {
  if (!str) return 30;
  const parts = String(str).split('/');
  if (parts.length === 2) {
    const n = parseFloat(parts[0]), d = parseFloat(parts[1]);
    return (d && d !== 0) ? n / d : n;
  }
  return parseFloat(str) || 30;
}

// Best duration: largest allowed that fits within source, else smallest allowed
function selectDuration(sourceDur, allowed) {
  const fitting = allowed.filter(d => d <= sourceDur);
  return fitting.length ? Math.max(...fitting) : Math.min(...allowed);
}

// Centre-clip: start at (sourceDur/2 - targetDur/2), clamped to 0
function centreClipStart(sourceDur, targetDur) {
  return Math.max(0, (sourceDur - targetDur) / 2);
}

function probe(filePath) {
  return new Promise((res, rej) => ffmpeg.ffprobe(filePath, (err, m) => {
    if (err) return rej(err);
    const v = m.streams.find(s => s.codec_type === 'video') || {};
    res({
      duration: parseFloat(m.format.duration) || 0,
      width:    v.width    || 1920,
      height:   v.height   || 1080,
      fps:      parseFraction(v.r_frame_rate),
      size:     m.format.size,
      bitrate:  m.format.bit_rate
    });
  }));
}

function buildVF(info, spec, opts) {
  const { w, h } = spec;
  const srcAR = info.width / info.height, dstAR = w / h;
  let vf;
  if (Math.abs(srcAR - dstAR) < 0.05)
    vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  else if (srcAR > dstAR)
    vf = `crop=ih*${w}/${h}:ih,scale=${w}:${h}`;
  else
    vf = `crop=iw:iw*${h}/${w},scale=${w}:${h}`;

  if (opts.speed && opts.speed !== 1)
    vf += `,setpts=${(1 / opts.speed).toFixed(3)}*PTS`;

  // Grade: slight brightness/contrast/saturation boost for safari footage, plus sharpen and denoise
  vf += ',eq=brightness=0.03:contrast=1.05:saturation=1.1,unsharp=5:5:1.0:5:5:0.0,hqdn3d=2:1:2:3';

  // Watermark bottom-right, proportional size
  vf += `,drawtext=text='LAVIRASAFARIS.COM':fontcolor=white:fontsize=${Math.round(w * 0.022)}:alpha=0.75:x=w-tw-20:y=h-th-20:shadowcolor=black:shadowx=1:shadowy=1`;

  return vf;
}

// ── PROCESS ONE VARIANT ────────────────────────────────────────────────────────
function processVariant(inputPath, platform, opts = {}) {
  return new Promise(async (res, rej) => {
    const spec = PLATFORMS[platform];
    if (!spec) return rej(new Error('Unknown platform: ' + platform));

    const info = await probe(inputPath).catch(() => ({ duration:30, width:1920, height:1080, fps:30 }));

    // Duration: use opts.duration if valid, else select best from platform's allowed list
    const targetDur = opts.duration && spec.durations.includes(opts.duration)
      ? opts.duration
      : selectDuration(info.duration, spec.durations);

    // Clip start: explicit trimStart OR centre-clip (smarter than always starting at 0)
    const startAt = opts.trimStart != null
      ? opts.trimStart
      : centreClipStart(info.duration, targetDur);

    const outFile = path.join(cfg.OUTPUTS_DIR,
      `lavira_${platform}_${targetDur}s_${uuid().slice(0,6)}.mp4`);

    ffmpeg(inputPath)
      .seekInput(startAt)
      .duration(targetDur)
      .videoFilter(buildVF(info, spec, opts))
      .fps(spec.fps)
      .videoBitrate(opts.quality === 'low' ? '800k' : '2500k')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions(['-movflags +faststart', '-preset faster', '-crf 23', '-threads', '4', '-pix_fmt', 'yuv420p'])
      .output(outFile)
      .on('end', () => res({
        platform,
        label:      spec.label,
        file:       outFile,
        filename:   path.basename(outFile),
        resolution: `${spec.w}x${spec.h}`,
        duration:   targetDur,
        startAt:    Math.round(startAt),
        clipStrategy: opts.trimStart != null ? 'manual' : 'centre'
      }))
      .on('error', rej)
      .run();
  });
}

// ── PROCESS ALL PLATFORMS ─────────────────────────────────────────────────────
async function processAll(inputPath, platforms, opts = {}) {
  const results = [], errors = [];
  for (const p of platforms) {
    try   { results.push(await processVariant(inputPath, p, opts)); }
    catch (e) { errors.push({ platform: p, error: e.message }); }
  }
  return { results, errors };
}

// ── THUMBNAIL EXTRACTION ──────────────────────────────────────────────────────
function extractThumbnail(videoPath, atSecs = 3) {
  return new Promise((res, rej) => {
    const out = path.join(cfg.OUTPUTS_DIR, `thumb_${uuid().slice(0,6)}.jpg`);
    ffmpeg(videoPath).seekInput(atSecs).frames(1).output(out)
      .on('end', () => res(out)).on('error', rej).run();
  });
}

module.exports = { processAll, processVariant, probe, extractThumbnail, PLATFORMS, selectDuration, centreClipStart };
