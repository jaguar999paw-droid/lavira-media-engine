// engines/audio.js — v3: exact duration presets 15/30/45/60s + smart clip selection
'use strict';
const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const { v4: uuid } = require('uuid');
const cfg    = require('../config');

// ── EXACT DURATION PRESETS ────────────────────────────────────────────────────
const DURATION_PRESETS = [15, 30, 45, 60]; // seconds — all valid social clip lengths

const PROFILES = {
  instagram_story: { fmt:'mp3', bitrate:'192k', label:'Instagram Story Audio', maxDur:15  },
  tiktok_audio:    { fmt:'mp3', bitrate:'192k', label:'TikTok Audio',          maxDur:60  },
  podcast_promo:   { fmt:'mp3', bitrate:'128k', label:'Podcast Promo',         maxDur:60  },
  whatsapp:        { fmt:'ogg', bitrate:'64k',  label:'WhatsApp Voice',        maxDur:30  },
};

// Platform duration constraints (seconds)
const PLATFORM_DURATIONS = {
  instagram_story: [15],
  tiktok_audio:    [15, 30, 60],
  podcast_promo:   [30, 45, 60],
  whatsapp:        [15, 30],
};

function probeAudio(filePath) {
  return new Promise((res, rej) => ffmpeg.ffprobe(filePath, (err, m) => {
    if (err) return rej(err);
    const a = m.streams.find(s => s.codec_type === 'audio') || {};
    res({
      duration:   parseFloat(m.format.duration) || 0,
      codec:      a.codec_name,
      sampleRate: a.sample_rate,
      channels:   a.channels,
      size:       m.format.size
    });
  }));
}

// Pick best preset: largest preset that fits within source duration
function selectPreset(sourceDuration, allowedPresets = DURATION_PRESETS) {
  const fitting = allowedPresets.filter(p => p <= sourceDuration);
  return fitting.length ? Math.max(...fitting) : Math.min(...allowedPresets);
}

// Export one audio clip at an EXACT preset duration
function exportPreset(inputPath, profile, targetSecs, startSecs = 0, spec) {
  return new Promise(async (res, rej) => {
    if (!spec) return rej(new Error('No spec provided'));

    const outFile = path.join(cfg.OUTPUTS_DIR,
      `lavira_audio_${profile}_${targetSecs}s_${uuid().slice(0,6)}.${spec.fmt}`);

    // Fade: 0.3s in, 0.8s out — short enough for 15s clips
    const fadeIn  = Math.min(0.3, targetSecs * 0.02);
    const fadeOut = Math.max(0, targetSecs - 0.8);

    ffmpeg(inputPath)
      .seekInput(startSecs)
      .duration(targetSecs)
      .audioFilters([
        'loudnorm=I=-16:LRA=11:TP=-1.5',
        `afade=t=in:st=0:d=${fadeIn.toFixed(2)}`,
        `afade=t=out:st=${fadeOut.toFixed(2)}:d=0.8`
      ])
      .audioBitrate(spec.bitrate)
      .output(outFile)
      .on('end', () => res({
        profile,
        label:    spec.label,
        duration: targetSecs,
        file:     outFile,
        filename: path.basename(outFile),
        format:   spec.fmt,
        startAt:  startSecs
      }))
      .on('error', rej)
      .run();
  });
}

// Main: process one profile → one preset export
async function processProfile(inputPath, profile, opts = {}) {
  const spec = PROFILES[profile];
  if (!spec) throw new Error('Unknown audio profile: ' + profile);

  const info     = await probeAudio(inputPath).catch(() => ({ duration: 60 }));
  const startAt  = opts.trimStart || 0;
  const avail    = info.duration - startAt;
  const allowed  = PLATFORM_DURATIONS[profile] || DURATION_PRESETS;

  // Select one preset: specific if provided, else best fitting
  const selectedPreset = opts.preset && allowed.includes(opts.preset) && opts.preset <= avail
    ? opts.preset
    : selectPreset(avail, allowed);

  const result = await exportPreset(inputPath, profile, selectedPreset, startAt, spec);
  return {
    profile,
    label:   spec.label,
    results: [result],
    errors:  []
  };
}

// Export all profiles
async function processAudio(inputPath, profiles = ['instagram_story','tiktok_audio'], opts = {}) {
  const all = await Promise.allSettled(profiles.map(p => processProfile(inputPath, p, opts)));
  const results = [], errors = [];
  all.forEach((s, i) => {
    if (s.status === 'fulfilled') results.push(...(s.value.results || []));
    else errors.push({ profile: profiles[i], error: s.reason.message });
  });
  return { results, errors };
}

module.exports = { processAudio, processProfile, probeAudio, PROFILES, DURATION_PRESETS, PLATFORM_DURATIONS, selectPreset };
