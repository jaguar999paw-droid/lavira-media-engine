#!/usr/bin/env node
// src/mcp/servers/search-server.js — lavira-search
// Concern: Stock media search, GIPHY, internal media library
// Tools: 8 | Op types: R, A (read + external API) — never writes output files directly
'use strict';

const rpc  = require('../lib/rpc-core');
const cfg  = require('../../config');

let extMedia, mediaCache, giphyEng, mediaLib;
try { extMedia   = require('../../engines/external-media'); } catch { extMedia   = null; }
try { mediaCache = require('../../engines/media-cache');    } catch { mediaCache = null; }
try { giphyEng   = require('../../engines/giphy');          } catch { giphyEng   = null; }
try { mediaLib   = require('../../engines/media-library');  } catch { mediaLib   = null; }

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_stock_images',
    description: 'Search Pexels for stock safari images by keyword. Returns preview URLs + metadata for selection.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword e.g. "Masai Mara lion at sunset"' },
        limit: { type: 'number', description: 'Max results (default: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'video_search_stock',
    description: 'Search Pexels for portrait-oriented safari stock videos by keyword. Returns download URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'Search keyword e.g. "elephant herd Amboseli"' },
        orientation: { type: 'string', description: 'portrait (default, 9:16) or landscape (16:9)' },
        limit:       { type: 'number', description: 'Max results (default: 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_external_media',
    description: 'Search Pexels/Unsplash for high-quality wildlife media with intelligent query building, caching, and relevance ranking.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'Natural language query' },
        mediaType:   { type: 'string', enum: ['photo', 'video', 'any'], description: 'Type of media (default: photo)' },
        destination: { type: 'string', description: 'Safari destination context' },
        limit:       { type: 'number', description: 'Max results' }
      }
    }
  },
  {
    name: 'fetch_optimal_media',
    description: 'Fetch best-matching external media for content creation: intelligent ranking, caching, fallback to Pexels.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'Describe what you need e.g. "Masai Mara wildebeest migration aerial"' },
        destination: { type: 'string', description: 'Destination name for theme context' },
        mediaType:   { type: 'string', enum: ['photo', 'video', 'auto'] },
        theme:       { type: 'string', description: 'Content theme for scoring' }
      }
    }
  },
  {
    name: 'search_giphy',
    description: 'Search GIPHY for safari-themed GIFs. Returns preview URLs + IDs for use with use_giphy tool.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'Search term e.g. "safari animals"' },
        destination: { type: 'string', description: 'Destination context (optional)' },
        limit:       { type: 'number', description: 'Max results (default: 10)' }
      }
    }
  },
  {
    name: 'use_giphy',
    description: 'Download a GIPHY GIF by ID as MP4, generate a branded promo package for social posting.',
    inputSchema: {
      type: 'object',
      properties: {
        giphyId:     { type: 'string', description: 'GIPHY GIF ID from search_giphy results' },
        destination: { type: 'string', description: 'Destination name for branding context' },
        context:     { type: 'string', description: 'Additional caption context' }
      },
      required: ['giphyId']
    }
  },
  {
    name: 'list_sample_media',
    description: 'List all sample media available for testing, organized by destination, type, and theme.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Filter by destination name' },
        type:        { type: 'string', enum: ['image', 'video', 'audio', 'all'], description: 'Media type filter' }
      }
    }
  },
  {
    name: 'get_sample_media',
    description: 'Get sample media files for a specific destination, ready to use in testing pipelines.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Destination name e.g. "Masai Mara"' },
        type:        { type: 'string', enum: ['image', 'video', 'all'] }
      },
      required: ['destination']
    }
  }
];

// ── Handlers ────────────────────────────────────────────────────────────────

const HANDLERS = {

  async search_stock_images({ query, limit = 10 }) {
    if (extMedia?.searchPexelsPhotos) return extMedia.searchPexelsPhotos(query, limit);
    // Direct Pexels fallback
    const axios = require('axios');
    const resp = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params:  { query, per_page: limit, orientation: 'landscape' }
    });
    return resp.data.photos.map(p => ({
      id: p.id, photographer: p.photographer,
      url: p.src.large2x || p.src.large,
      preview: p.src.medium, width: p.width, height: p.height
    }));
  },

  async video_search_stock({ query, orientation = 'portrait', limit = 5 }) {
    if (extMedia?.searchPexelsVideos) return extMedia.searchPexelsVideos(query, orientation, limit);
    const axios = require('axios');
    const resp = await axios.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params:  { query, per_page: limit, orientation }
    });
    return resp.data.videos.map(v => ({
      id: v.id, duration: v.duration, width: v.width, height: v.height,
      download: v.video_files?.find(f => f.quality === 'hd')?.link || v.video_files?.[0]?.link,
      preview: v.image
    }));
  },

  async search_external_media({ query, mediaType = 'photo', destination, limit = 10 }) {
    if (extMedia?.searchExternalMedia) return extMedia.searchExternalMedia({ query, mediaType, destination, limit });
    // Delegate to appropriate search
    if (mediaType === 'video') {
      return HANDLERS.video_search_stock({ query: destination ? `${destination} ${query}` : query, limit });
    }
    return HANDLERS.search_stock_images({ query: destination ? `${destination} ${query}` : query, limit });
  },

  async fetch_optimal_media({ query, destination, mediaType = 'photo', theme }) {
    if (extMedia?.fetchOptimalMedia) return extMedia.fetchOptimalMedia({ query, destination, mediaType, theme });
    const fullQuery = [destination, query, theme].filter(Boolean).join(' ');
    return mediaType === 'video'
      ? HANDLERS.video_search_stock({ query: fullQuery, limit: 3 })
      : HANDLERS.search_stock_images({ query: fullQuery, limit: 5 });
  },

  async search_giphy({ query, destination, limit = 10 }) {
    if (giphyEng?.searchGiphy) return giphyEng.searchGiphy({ query: destination ? `${destination} ${query}` : query, limit });
    const axios = require('axios');
    const resp = await axios.get('https://api.giphy.com/v1/gifs/search', {
      params: { api_key: process.env.GIPHY_API_KEY, q: query, limit, rating: 'g' }
    });
    return resp.data.data.map(g => ({ id: g.id, title: g.title, url: g.url, preview: g.images?.fixed_height?.url }));
  },

  async use_giphy({ giphyId, destination, context }) {
    if (giphyEng?.useGiphy) return giphyEng.useGiphy({ giphyId, destination, context });
    return { error: 'GIPHY download engine not available. Install engines/giphy.js.' };
  },

  async list_sample_media({ destination, type = 'all' } = {}) {
    if (mediaLib?.listSampleMedia) return mediaLib.listSampleMedia({ destination, type });
    const fs   = require('fs');
    const path = require('path');
    const samplesDir = cfg.SAMPLES_DIR || path.join(cfg.BASE_DIR || path.resolve(__dirname, '../../../..'), 'samples');
    if (!fs.existsSync(samplesDir)) return { samples: [], note: 'No samples directory found.' };
    const walk = (dir) => {
      const out = [];
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) out.push(...walk(full));
        else out.push(full.replace(samplesDir + '/', ''));
      }
      return out;
    };
    let files = walk(samplesDir);
    if (destination) files = files.filter(f => f.toLowerCase().includes(destination.toLowerCase().replace(' ', '_')));
    if (type !== 'all') {
      const EXT = { image: /\.(jpg|jpeg|png)$/i, video: /\.(mp4|mov)$/i, audio: /\.(mp3|wav)$/i };
      files = files.filter(f => EXT[type]?.test(f));
    }
    return { samples: files };
  },

  async get_sample_media({ destination, type = 'all' }) {
    return HANDLERS.list_sample_media({ destination, type });
  }
};

rpc.start({ name: 'lavira-search', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
