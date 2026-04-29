// engines/video-enhanced.js — Lavira Video Intelligence Engine v2
// Capabilities: clip, trim, search, post-lengths, thumbnail, probe, platform-encode
'use strict';
const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');
const BRAND  = require('../orchestrator/brand');

// ── PLATFORM VIDEO SPECS ─────────────────────────────────────────────────────
const VIDEO_PLATFORM_SPECS = {
  whatsapp:         { w: 640,  h: 640,  maxSeconds: 90,  fps: 25, crf: 28, format: 'mp4', aspect: '1:1' },
  instagram_reel:   { w: 1080, h: 1920, maxSeconds: 90,  fps: 30, crf: 23, format: 'mp4', aspect: '9:16' },
  instagram_post:   { w: 1080, h: 1080, maxSeconds: 60,  fps: 30, crf: 23, format: 'mp4', aspect: '1:1' },
  instagram_story:  { w: 1080, h: 1920, maxSeconds: 15,  fps: 30, crf: 23, format: 'mp4', aspect: '9:16' },
  tiktok:           { w: 1080, h: 1920, maxSeconds: 180, fps: 30, crf: 23, format: 'mp4', aspect: '9:16' },
  facebook:         { w: 1280, h: 720,  maxSeconds: 240, fps: 30, crf: 23, format: 'mp4', aspect: '16:9' },
  twitter:          { w: 1280, h: 720,  maxSeconds: 140, fps: 30, crf: 24, format: 'mp4', aspect: '16:9' },
  youtube_short:    { w: 1080, h: 1920, maxSeconds: 60,  fps: 30, crf: 22, format: 'mp4', aspect: '9:16' },
  telegram:         { w: 1080, h: 1080, maxSeconds: 300, fps: 30, crf: 24, format: 'mp4', aspect: '1:1' },
};

// ── PROBE VIDEO ───────────────────────────────────────────────────────────────
function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const vStream = data.streams.find(s => s.codec_type === 'video');
      const aStream = data.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: parseFloat(data.format.duration || 0),
        durationFormatted: new Date(parseFloat(data.format.duration || 0) * 1000).toISOString().substr(11, 8),
        sizeMB: (parseInt(data.format.size || 0) / 1024 / 1024).toFixed(2),
        bitrate: data.format.bit_rate,
        width: vStream?.width, height: vStream?.height,
        fps: vStream ? eval(vStream.avg_frame_rate) : null,
        videoCodec: vStream?.codec_name,
        audioCodec: aStream?.codec_name,
        hasAudio: !!aStream,
        format: data.format.format_name,
        aspectRatio: vStream ? `${vStream.width}:${vStream.height}` : null,
        isPortrait: vStream && vStream.height > vStream.width,
      });
    });
  });
}

// ── CLIP / TRIM ───────────────────────────────────────────────────────────────
function clipVideo(inputPath, startSec, durationSec, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_clip_${uuid().slice(0,6)}.mp4`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(startSec)
      .duration(durationSec)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-crf 23', '-preset fast', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => {
        const stat = fs.statSync(outputPath);
        resolve({ file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath),
                  startSec, durationSec, sizeMB: (stat.size/1024/1024).toFixed(2) });
      })
      .on('error', reject)
      .run();
  });
}

// ── PLATFORM ENCODE ───────────────────────────────────────────────────────────
function encodeForPlatform(inputPath, platform, opts = {}) {
  const spec = VIDEO_PLATFORM_SPECS[platform] || VIDEO_PLATFORM_SPECS.instagram_post;
  const outName = `lavira_${platform}_${uuid().slice(0,6)}.mp4`;
  const outPath = path.join(cfg.OUTPUTS_DIR, outName);
  const maxSec = opts.maxSeconds || spec.maxSeconds;
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    if (opts.startSec) cmd = cmd.seekInput(opts.startSec);
    if (maxSec) cmd = cmd.duration(maxSec);
    cmd
      .videoCodec('libx264')
      .audioCodec('aac')
      .size(`${spec.w}x${spec.h}`)
      .autopad(true, 'black')
      .fps(spec.fps)
      .outputOptions([
        `-crf ${spec.crf}`,
        '-preset fast',
        '-movflags +faststart',
        `-maxrate ${spec.crf < 24 ? '4M' : '2M'}`,
        '-bufsize 8M',
      ])
      .output(outPath)
      .on('end', () => {
        const stat = fs.statSync(outPath);
        resolve({
          platform, file: outPath, filename: outName,
          resolution: `${spec.w}x${spec.h}`, aspect: spec.aspect,
          maxSeconds: spec.maxSeconds, downloadUrl: '/outputs/' + outName,
          sizeMB: (stat.size/1024/1024).toFixed(2),
        });
      })
      .on('error', reject)
      .run();
  });
}

// ── EXTRACT THUMBNAIL ─────────────────────────────────────────────────────────
function extractThumbnail(videoPath, atSecond, outputPath) {
  atSecond = atSecond || 1;
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_thumb_${uuid().slice(0,6)}.jpg`);
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(atSecond)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve({ file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath), atSecond }))
      .on('error', reject)
      .run();
  });
}

// ── ADD BRAND WATERMARK TO VIDEO ──────────────────────────────────────────────
function addBrandWatermark(inputPath, opts = {}, outputPath) {
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_wm_${uuid().slice(0,6)}.mp4`);
  const phone = opts.phone || BRAND.phone || '';
  const website = (opts.website || BRAND.website || '').replace('https://','');
  const dest = opts.destination || '';
  // drawtext filter for bottom bar brand overlay
  const y_base = '(h-30)';
  const filters = [
    `drawtext=text='LAVIRA SAFARIS':fontcolor=orange:fontsize=20:x=20:y=(h-58):box=1:boxcolor=black@0.55:boxborderw=6`,
    `drawtext=text='${phone}':fontcolor=white:fontsize=16:x=20:y=${y_base}:box=1:boxcolor=black@0.55:boxborderw=4`,
    `drawtext=text='${website}':fontcolor=white@0.85:fontsize=14:x=(w-280):y=${y_base}:box=1:boxcolor=black@0.55:boxborderw=4`,
  ];
  if (dest) filters.push(`drawtext=text='${dest}':fontcolor=orange@0.9:fontsize=16:x=(w/2-100):y=${y_base}`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter(filters)
      .videoCodec('libx264')
      .audioCodec('copy')
      .outputOptions(['-crf 23', '-preset fast', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => {
        const stat = fs.statSync(outputPath);
        resolve({ file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath), sizeMB: (stat.size/1024/1024).toFixed(2) });
      })
      .on('error', reject)
      .run();
  });
}

// ── IMAGE → VIDEO (slideshow) ─────────────────────────────────────────────────
// Turns a static image into a short branded video (loop with Ken Burns effect)
function imageToVideo(imagePath, durationSec = 15, platform = 'tiktok', outputPath) {
  const spec = VIDEO_PLATFORM_SPECS[platform] || VIDEO_PLATFORM_SPECS.tiktok;
  outputPath = outputPath || path.join(cfg.OUTPUTS_DIR, `lavira_img2vid_${uuid().slice(0,6)}.mp4`);
  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .loop(durationSec)
      .inputFPS(1 / durationSec)
      .videoFilter(`scale=${spec.w}:${spec.h}:force_original_aspect_ratio=increase,crop=${spec.w}:${spec.h},zoompan=z='min(zoom+0.0005,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationSec * spec.fps}:s=${spec.w}x${spec.h}:fps=${spec.fps}`)
      .videoCodec('libx264')
      .outputOptions([`-t ${durationSec}`, '-crf 23', '-preset fast', '-movflags +faststart', '-pix_fmt yuv420p'])
      .output(outputPath)
      .on('end', () => {
        const stat = fs.statSync(outputPath);
        resolve({ file: outputPath, filename: path.basename(outputPath), downloadUrl: '/outputs/' + path.basename(outputPath), durationSec, platform, sizeMB: (stat.size/1024/1024).toFixed(2) });
      })
      .on('error', reject)
      .run();
  });
}

// ── SEARCH PEXELS VIDEO ───────────────────────────────────────────────────────
async function searchPexelsVideo(query, perPage = 5) {
  const key = process.env.PEXELS_API_KEY || cfg.PEXELS_KEY || '';
  if (!key) return { videos: [] };
  return new Promise(resolve => {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&size=medium`;
    https.get(url, { headers: { Authorization: key } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          const videos = (r.videos || []).map(v => {
            const files = v.video_files || [];
            const hd = files.find(f => f.quality === 'hd') || files[0];
            return { id: v.id, width: v.width, height: v.height, duration: v.duration, url: hd?.link, quality: hd?.quality, fps: hd?.fps, photographer: v.user?.name, previewUrl: v.image };
          });
          resolve({ videos, total: r.total_results });
        } catch { resolve({ videos: [] }); }
      });
    }).on('error', () => resolve({ videos: [] }));
  });
}


// ── FULL VIDEO POST PIPELINE ─────────────────────────────────────────────────
// searchQuery → download best Pexels video → probe → clip → encode for platform
// → burn logo watermark → save to posts/<platform>/ → return rich result
async function fullVideoPostPipeline(opts) {
  opts = opts || {};
  const query      = opts.query || opts.destination || 'Kenya safari wildlife';
  const platform   = opts.platform || 'tiktok';
  const targetSecs = Math.min(opts.durationSec || 30, VIDEO_PLATFORM_SPECS[platform]?.maxSecs || 60);
  const destination= opts.destination || '';
  const postsDir   = opts.postsDir || path.join(__dirname, '..', '..', 'posts');
  const spec       = VIDEO_PLATFORM_SPECS[platform] || VIDEO_PLATFORM_SPECS.tiktok;

  // 1. SEARCH: find best portrait video from Pexels
  const searchResult = await searchPexelsVideo(query, 6);
  const videos = (searchResult.videos || []).filter(v => v.url && v.height >= v.width); // portrait only
  if (!videos.length) throw new Error('No portrait videos found for query: ' + query);

  // Pick best: longest duration closest to targetSecs
  videos.sort((a,b) => Math.abs(a.duration - targetSecs) - Math.abs(b.duration - targetSecs));
  const best = videos[0];

  // 2. DOWNLOAD
  const tmpRaw = path.join(require('os').tmpdir(), 'lavira_raw_' + uuid().slice(0,8) + '.mp4');
  await new Promise((res, rej) => {
    const file = require('fs').createWriteStream(tmpRaw);
    https.get(best.url, r => { r.pipe(file); file.on('finish', () => { file.close(); res(); }); }).on('error', rej);
  });

  // 3. PROBE
  let probe = {};
  try { probe = await probeVideo(tmpRaw); } catch(_) {}

  // 4. CLIP to targetSecs (start at 0 or middle if longer)
  const rawDur = parseFloat(probe.duration || best.duration || targetSecs);
  const startSec = rawDur > targetSecs * 1.5 ? Math.floor((rawDur - targetSecs) / 2) : 0;
  const tmpClip = path.join(require('os').tmpdir(), 'lavira_clip_' + uuid().slice(0,8) + '.mp4');
  await clipVideo(tmpRaw, startSec, Math.min(targetSecs, rawDur));
  // clipVideo writes to auto-path, re-clip to tmpClip explicitly
  await new Promise((res, rej) => {
    const ff = require('fluent-ffmpeg');
    ff(tmpRaw)
      .setStartTime(startSec).setDuration(Math.min(targetSecs, rawDur))
      .output(tmpClip)
      .outputOptions(['-c copy'])
      .on('end', res).on('error', rej).run();
  });

  // 5. ENCODE for platform (scale + fps + bitrate)
  const encoded = await encodeForPlatform(tmpClip, platform, { maxSeconds: targetSecs });
  const encodedPath = encoded.file || encoded.output || tmpClip;

  // 6. WATERMARK: burn Lavira logo + contact info
  const watermarked = await addBrandWatermark(encodedPath, { destination });
  const finalPath = watermarked.file || watermarked.output || encodedPath;

  // 7. SAVE to posts/<platform>/
  const platDir = path.join(postsDir, platform);
  require('fs').mkdirSync(platDir, { recursive: true });
  const finalName = 'lavira_' + platform + '_' + (destination.replace(/\s+/g,'_') || 'safari').toLowerCase() + '_' + uuid().slice(0,6) + '.mp4';
  const postsPath = path.join(platDir, finalName);
  require('fs').copyFileSync(finalPath, postsPath);

  // Cleanup temps
  for (const t of [tmpRaw, tmpClip]) try { require('fs').unlinkSync(t); } catch(_) {}

  const stat = require('fs').statSync(postsPath);
  return {
    success: true,
    platform,
    destination,
    file: postsPath,
    filename: finalName,
    url: '/posts/' + platform + '/' + finalName,
    sizeMB: (stat.size / 1024 / 1024).toFixed(2),
    durationSec: targetSecs,
    resolution: spec.w + 'x' + spec.h,
    sourceVideo: { url: best.url, photographer: best.photographer, duration: best.duration },
    probe,
    pipeline: ['search','download','probe','clip','encode','watermark','posts'],
  };
}

module.exports = {
  probeVideo, clipVideo, encodeForPlatform, extractThumbnail,
  addBrandWatermark, imageToVideo, searchPexelsVideo, fullVideoPostPipeline, VIDEO_PLATFORM_SPECS,
};
