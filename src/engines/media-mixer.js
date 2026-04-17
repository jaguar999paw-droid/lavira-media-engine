// engines/media-mixer.js — minimal audio+media mixing utilities
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuid } = require('uuid');
const cfg = require('../config');
const videoEng = require('./video');

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) return resolve();
      reject(new Error(err.split('\n').slice(-12).join('\n') || `ffmpeg failed (${code})`));
    });
  });
}

async function mixAudioWithMedia({ mediaPath, audioPath, durationSeconds } = {}) {
  if (!mediaPath || !fs.existsSync(mediaPath)) throw new Error('mediaPath not found');
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error('audioPath not found');

  const ext = path.extname(mediaPath).toLowerCase();
  const outFile = path.join(cfg.OUTPUTS_DIR, `lavira_mix_${uuid().slice(0, 8)}.mp4`);

  let targetDur = durationSeconds ? Number(durationSeconds) : null;
  if (!targetDur || !Number.isFinite(targetDur) || targetDur <= 0) {
    if (ext === '.mp4') {
      const info = await videoEng.probe(mediaPath).catch(() => ({ duration: 30 }));
      targetDur = info.duration || 30;
    } else {
      targetDur = 30;
    }
  }
  targetDur = Math.max(1, Math.min(600, Math.round(targetDur)));

  // Strategy:
  // - For video: keep video, loop audio if needed, cut to shortest, force mp4 h264+aac
  // - For image: create a looped video from image for targetDur, then mix audio
  const commonAudio = ['-stream_loop', '-1', '-i', audioPath];

  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    await runFFmpeg([
      '-y',
      '-loop', '1', '-t', String(targetDur), '-i', mediaPath,
      ...commonAudio,
      '-shortest',
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outFile
    ]);
  } else if (ext === '.mp4') {
    await runFFmpeg([
      '-y',
      '-i', mediaPath,
      ...commonAudio,
      '-shortest',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outFile
    ]);
  } else {
    throw new Error('Unsupported media type for mixing: ' + ext);
  }

  return { file: outFile, filename: path.basename(outFile), downloadUrl: `/outputs/${path.basename(outFile)}`, duration: targetDur };
}

module.exports = { mixAudioWithMedia };

