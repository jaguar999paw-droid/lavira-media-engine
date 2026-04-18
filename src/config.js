// src/config.js — Lavira Media Engine configuration
// Works in dev (bare Node), Electron (packaged), and Docker.
'use strict';
const path = require('path');

// ── Root path resolution ──────────────────────────────────────────────────────
// In Electron packaged build, resources land in process.resourcesPath/app/
// In Docker / bare Node, ROOT is the project directory.
const IS_ELECTRON = !!process.env.ELECTRON;
const ROOT = IS_ELECTRON && process.resourcesPath
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..');

// ── Load .env (from correct root, or from DOTENV_CONFIG_PATH override) ────────
const dotenvPath = process.env.DOTENV_CONFIG_PATH || path.join(ROOT, '.env');
require('dotenv').config({ path: dotenvPath, quiet: true });

// ── Bundled FFmpeg (ffmpeg-static) ────────────────────────────────────────────
// When packaged, ffmpeg-static is included in node_modules inside the asar.
// We set the path here so all engines pick it up automatically.
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) {
    require('fluent-ffmpeg').setFfmpegPath(ffmpegStatic);
  }
} catch (_) {
  // ffmpeg-static not installed — system ffmpeg will be used (fine for Docker/dev)
}

try {
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic && ffprobeStatic.path) {
    require('fluent-ffmpeg').setFfprobePath(ffprobeStatic.path);
  }
} catch (_) {}

// ── Exported config ───────────────────────────────────────────────────────────
module.exports = {
  PORT:         process.env.PORT         || 4005,
  ANTHROPIC_KEY: process.env.ANTHROPIC_API_KEY || '',
  GIPHY_KEY:    process.env.GIPHY_API_KEY || '',
  PEXELS_KEY:   process.env.PEXELS_API_KEY || '',
  UPLOADS_DIR:  path.join(ROOT, process.env.UPLOADS_DIR || 'uploads'),
  POSTS_DIR:    path.join(ROOT, 'posts'),
  OUTPUTS_DIR:  path.join(ROOT, process.env.OUTPUTS_DIR || 'outputs'),
  ASSETS_DIR:   path.join(ROOT, process.env.ASSETS_DIR  || 'assets'),
  DB_PATH:      path.isAbsolute(process.env.DB_PATH || '')
                  ? process.env.DB_PATH
                  : path.join(ROOT, process.env.DB_PATH || 'lavira.db'),
};
