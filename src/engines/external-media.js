// src/engines/external-media.js — Intelligent External Media Sourcing
// Fetches high-quality wildlife media from Pexels, Unsplash with intelligent query building
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const cfg = require('../config');

// ── API CONFIGURATION ─────────────────────────────────────────────────────────
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || cfg.PEXELS_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// ── INTELLIGENT QUERY BUILDER ────────────────────────────────────────────────
const QUERY_COMPONENTS = {
  animals: [
    'lion', 'elephant', 'giraffe', 'zebra', 'cheetah', 'leopard', 'buffalo', 'hippo',
    'rhinoceros', 'wildebeest', 'gazelle', 'impala', 'warthog', 'hyena', 'crocodile'
  ],
  environments: [
    'safari', 'savannah', 'grassland', 'acacia', 'sunset', 'sunrise', 'river', 'waterhole',
    'mountain', 'cliff', 'forest', 'plains', 'desert', 'marsh', 'delta'
  ],
  moods: [
    'majestic', 'wild', 'free', 'powerful', 'graceful', 'fierce', 'peaceful', 'dramatic',
    'cinematic', 'aerial', 'closeup', 'herd', 'hunting', 'drinking', 'running'
  ],
  destinations: {
    masai_mara: ['lion', 'cheetah', 'wildebeest', 'migration', 'savannah'],
    amboseli: ['elephant', 'kilimanjaro', 'dust', 'baobab', 'swamp'],
    tsavo: ['red_elephant', 'volcano', 'dusty', 'acacia', 'man_eaters'],
    samburu: ['grevy_zebra', 'reticulated_giraffe', 'orange_acacia', 'tribe'],
    nakuru: ['flamingo', 'lake', 'pink', 'bird', 'shoreline'],
    ol_pejeta: ['chimpanzee', 'conservancy', 'white_rhino', 'elephant'],
    mt_kenya: ['forest_elephant', 'tuskers', 'mist', 'mountain', 'cedar'],
    default: ['safari', 'kenya', 'wildlife', 'africa']
  }
};

function buildIntelligentQuery(destination = '', theme = '', context = '') {
  const components = [];

  // Destination-specific keywords
  if (destination && QUERY_COMPONENTS.destinations[destination.toLowerCase()]) {
    components.push(...QUERY_COMPONENTS.destinations[destination.toLowerCase()]);
  } else {
    components.push(...QUERY_COMPONENTS.destinations.default);
  }

  // Theme-based keywords
  if (theme) {
    switch (theme.toLowerCase()) {
      case 'wildlife_spotlight':
        components.push('animal', 'portrait', 'majestic');
        break;
      case 'destination_profile':
        components.push('landscape', 'scenic', 'aerial');
        break;
      case 'safari_package_promo':
        components.push('adventure', 'tour', 'group');
        break;
      case 'sunrise_sunset':
        components.push('golden_hour', 'silhouette', 'dramatic');
        break;
      case 'conservation':
        components.push('wildlife', 'nature', 'protected');
        break;
    }
  }

  // Context-based mood
  if (context) {
    if (context.includes('power') || context.includes('king')) {
      components.push('lion', 'majestic', 'powerful');
    } else if (context.includes('gentle') || context.includes('wise')) {
      components.push('elephant', 'peaceful', 'wise');
    } else if (context.includes('fast') || context.includes('speed')) {
      components.push('cheetah', 'running', 'swift');
    }
  }

  // Add random mood and environment
  const randomMood = QUERY_COMPONENTS.moods[Math.floor(Math.random() * QUERY_COMPONENTS.moods.length)];
  const randomEnv = QUERY_COMPONENTS.environments[Math.floor(Math.random() * QUERY_COMPONENTS.environments.length)];

  components.push(randomMood, randomEnv);

  // Remove duplicates and limit length
  const unique = [...new Set(components)];
  return unique.slice(0, 4).join(' ');
}

// ── PEXELS IMAGE SEARCH ──────────────────────────────────────────────────────
async function searchPexelsImages(query, options = {}) {
  const { limit = 10, orientation = 'landscape', size = 'large' } = options;

  if (!PEXELS_API_KEY) {
    return { photos: [], error: 'PEXELS_API_KEY not configured' };
  }

  return new Promise((resolve) => {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=${orientation}&size=${size}`;

    https.get(url, {
      headers: { Authorization: PEXELS_API_KEY }
    }, resp => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          resolve({ photos: [], error: 'Parse error' });
        }
      });
    }).on('error', () => resolve({ photos: [], error: 'Network error' }));
  });
}

// ── PEXELS VIDEO SEARCH ──────────────────────────────────────────────────────
async function searchPexelsVideos(query, options = {}) {
  const { limit = 5, orientation = 'portrait', size = 'large' } = options;

  if (!PEXELS_API_KEY) {
    return { videos: [], error: 'PEXELS_API_KEY not configured' };
  }

  return new Promise((resolve) => {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=${orientation}&size=${size}`;

    https.get(url, {
      headers: { Authorization: PEXELS_API_KEY }
    }, resp => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          resolve({ videos: [], error: 'Parse error' });
        }
      });
    }).on('error', () => resolve({ videos: [], error: 'Network error' }));
  });
}

// ── UNSPLASH IMAGE SEARCH (FALLBACK) ─────────────────────────────────────────
async function searchUnsplashImages(query, options = {}) {
  const { limit = 10, orientation = 'landscape' } = options;

  if (!UNSPLASH_ACCESS_KEY) {
    return { results: [], error: 'UNSPLASH_ACCESS_KEY not configured' };
  }

  return new Promise((resolve) => {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=${orientation}&client_id=${UNSPLASH_ACCESS_KEY}`;

    https.get(url, resp => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          // Normalize to Pexels-like format
          const photos = result.results.map(item => ({
            id: item.id,
            width: item.width,
            height: item.height,
            url: item.urls.regular,
            src: {
              large: item.urls.regular,
              medium: item.urls.small,
              small: item.urls.thumb
            },
            photographer: item.user.name,
            photographer_url: item.user.links.html
          }));
          resolve({ photos });
        } catch (e) {
          resolve({ photos: [], error: 'Parse error' });
        }
      });
    }).on('error', () => resolve({ photos: [], error: 'Network error' }));
  });
}

// ── MEDIA RANKING & SELECTION ────────────────────────────────────────────────
function rankAndFilterMedia(mediaItems, criteria = {}) {
  const {
    minWidth = 1080,
    minHeight = 720,
    preferPortrait = false,
    maxResults = 5
  } = criteria;

  return mediaItems
    .filter(item => {
      const width = item.width || item.width;
      const height = item.height || item.height;
      return width >= minWidth && height >= minHeight;
    })
    .map(item => {
      const width = item.width || item.width;
      const height = item.height || item.height;
      const aspectRatio = width / height;
      const isPortrait = height > width;

      // Scoring algorithm
      let score = 0;

      // Prefer portrait for mobile (9:16 aspect)
      if (preferPortrait && isPortrait && aspectRatio >= 0.5 && aspectRatio <= 0.7) {
        score += 30;
      } else if (!preferPortrait && !isPortrait && aspectRatio >= 1.3) {
        score += 20;
      }

      // Prefer higher resolution
      if (width >= 1920) score += 20;
      else if (width >= 1280) score += 15;
      else if (width >= 1080) score += 10;

      // Prefer square/landscape for general use
      if (aspectRatio >= 1.2 && aspectRatio <= 2.0) score += 10;

      return { ...item, score, aspectRatio, isPortrait };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── INTELLIGENT MEDIA FETCHER ────────────────────────────────────────────────
async function fetchOptimalMedia(query, options = {}) {
  const {
    type = 'image', // 'image' or 'video'
    destination = '',
    theme = '',
    context = '',
    maxResults = 3,
    preferPortrait = false
  } = options;

  const mediaCache = require('./media-cache');

  // Build intelligent query
  const intelligentQuery = buildIntelligentQuery(destination, theme, context);

  // CHECK CACHE FIRST — return cached result if fresh
  const cachedResult = mediaCache.get(intelligentQuery, destination, theme);
  if (cachedResult) {
    return {
      query: intelligentQuery,
      results: [{
        id: cachedResult.metadata?.id || 'cached',
        url: cachedResult.url,
        src: { large: cachedResult.url },
        photographer: cachedResult.metadata?.photographer || 'Cached media',
        cached: true,
        localPath: cachedResult.filepath
      }],
      source: cachedResult.source || 'cache',
      totalFound: 1,
      selectedCount: 1,
      cacheHit: true
    };
  }

  let results = [];
  let source = '';

  // Try Pexels first
  if (type === 'image') {
    const pexelsResult = await searchPexelsImages(intelligentQuery, {
      limit: maxResults * 2,
      orientation: preferPortrait ? 'portrait' : 'landscape'
    });

    if (pexelsResult.photos && pexelsResult.photos.length > 0) {
      results = pexelsResult.photos;
      source = 'pexels';
    }
  } else if (type === 'video') {
    const pexelsResult = await searchPexelsVideos(intelligentQuery, {
      limit: maxResults * 2,
      orientation: preferPortrait ? 'portrait' : 'landscape'
    });

    if (pexelsResult.videos && pexelsResult.videos.length > 0) {
      // Normalize video format to match image format
      results = pexelsResult.videos.map(video => ({
        id: video.id,
        width: video.width,
        height: video.height,
        url: video.video_files[0]?.link || video.url,
        src: {
          large: video.video_files.find(f => f.quality === 'hd')?.link || video.video_files[0]?.link
        },
        duration: video.duration,
        photographer: video.user.name
      }));
      source = 'pexels';
    }
  }

  // Fallback to Unsplash for images
  if (results.length === 0 && type === 'image') {
    const unsplashResult = await searchUnsplashImages(intelligentQuery, {
      limit: maxResults * 2,
      orientation: preferPortrait ? 'portrait' : 'landscape'
    });

    if (unsplashResult.photos && unsplashResult.photos.length > 0) {
      results = unsplashResult.photos;
      source = 'unsplash';
    }
  }

  // Rank and filter results
  const rankedResults = rankAndFilterMedia(results, {
    minWidth: preferPortrait ? 720 : 1080,
    minHeight: preferPortrait ? 1280 : 720,
    preferPortrait,
    maxResults
  });

  return {
    query: intelligentQuery,
    results: rankedResults,
    source,
    totalFound: results.length,
    selectedCount: rankedResults.length,
    cacheHit: false
  };
}

// ── DOWNLOAD AND CACHE MEDIA ─────────────────────────────────────────────────
async function downloadAndCacheMedia(mediaItem, type = 'image') {
  const mediaCache = require('./media-cache');

  const extension = type === 'video' ? '.mp4' : '.jpg';
  const filename = `${mediaItem.id}_${uuid().slice(0,6)}${extension}`;
  const cacheDir = path.join(cfg.ASSETS_DIR, 'external_cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const filepath = path.join(cacheDir, filename);

  // Check cache first
  if (fs.existsSync(filepath)) {
    return { filepath, filename, cached: true };
  }

  // Download
  const url = mediaItem.src?.large || mediaItem.url;
  if (!url) throw new Error('No download URL available');

  await new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    proto.get(url, resp => {
      if (resp.statusCode === 301 || resp.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        return downloadAndCacheMedia(mediaItem, type).then(resolve).catch(reject);
      }

      resp.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlinkSync(filepath); reject(err); });
    }).on('error', (err) => { fs.unlinkSync(filepath); reject(err); });
  });

  // Register in cache index
  mediaCache.set('', '', '', filepath, url, {
    source: mediaItem.source || 'pexels',
    photographer: mediaItem.photographer,
    id: mediaItem.id
  });

  return { filepath, filename, cached: false };
}

// ── MEDIA CACHE MANAGEMENT ───────────────────────────────────────────────────
function getCachedMedia(query = '', type = 'image', limit = 10) {
  const cacheDir = path.join(cfg.ASSETS_DIR, 'external_cache');
  if (!fs.existsSync(cacheDir)) return [];

  const files = fs.readdirSync(cacheDir)
    .filter(file => file.endsWith(type === 'video' ? '.mp4' : '.jpg'))
    .filter(file => !query || file.toLowerCase().includes(query.toLowerCase()))
    .slice(-limit)
    .map(filename => ({
      filepath: path.join(cacheDir, filename),
      filename,
      cached: true,
      type
    }));

  return files;
}

module.exports = {
  buildIntelligentQuery,
  searchPexelsImages,
  searchPexelsVideos,
  searchUnsplashImages,
  fetchOptimalMedia,
  downloadAndCacheMedia,
  getCachedMedia,
  rankAndFilterMedia,
  QUERY_COMPONENTS
};