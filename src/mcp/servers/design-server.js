#!/usr/bin/env node
// src/mcp/servers/design-server.js — lavira-design
// Concern: Graphic design, card templates, overlay composition, brand visual pipeline
// Tools: 12 | Pipeline tools — call order matters (P-type marked in descriptions)
'use strict';

const rpc = require('../lib/rpc-core');
const cfg = require('../../config');

let comp, cardTpl, dynTpl, intlRouter, imgVision, logoLoader, mediaAug, ctxPools;
try { comp       = require('../../engines/compositor');          } catch { comp       = null; }
try { cardTpl    = require('../../engines/card-templates');      } catch { cardTpl    = null; }
try { dynTpl     = require('../../engines/dynamic-templates');   } catch { dynTpl     = null; }
try { intlRouter = require('../../engines/intelligence-router'); } catch { intlRouter = null; }
try { imgVision  = require('../../engines/image-vision');        } catch { imgVision  = null; }
try { logoLoader = require('../../engines/logo-loader');         } catch { logoLoader = null; }
try { mediaAug   = require('../../engines/media-augmentation');  } catch { mediaAug   = null; }
try { ctxPools   = require('../../engines/context-pools');       } catch { ctxPools   = null; }

const TOOLS = [
  { name:'analyze_content_theme',
    description:'[Step 0 of pipeline] Analyze media and determine optimal creative theme for overlay design.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},context:{type:'string'}}}},
  { name:'generate_overlay_plan',
    description:'[Step 1 of pipeline] Analyze media and generate optimal overlay positioning plan: text placement, brand bar position, safe zones.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},theme:{type:'string'},platform:{type:'string'}},required:['filePath']}},
  { name:'generate_branded_media',
    description:'[Step 2 of pipeline] Apply intelligent branding to media: analyze content, select theme, render dynamic overlay with brand colors.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},theme:{type:'string'},caption:{type:'string'},platform:{type:'string'}},required:['filePath']}},
  { name:'apply_overlay',
    description:'[Step 3 of pipeline] Apply Lavira brand overlay to an image or video file.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},overlayData:{type:'object'},outputName:{type:'string'}},required:['filePath']}},
  { name:'make_ready_to_post',
    description:'[Step 4 of pipeline] Apply branded overlay to processed media: adds Lavira logo bar, title, promo type label.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},caption:{type:'string'},platform:{type:'string'},promoType:{type:'string',enum:['wildlife_spotlight','destination_profile','safari_package_promo','conservation','cultural_moment','adventure_activity']}},required:['filePath']}},
  { name:'build_post_package',
    description:'[Step 5 of pipeline] Build complete ready-to-post package from a finished job: apply overlays to all platform profiles in one call.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},caption:{type:'string'},platforms:{type:'array',items:{type:'string'}}},required:['filePath']}},
  { name:'generate_card_template',
    description:'Generate a single branded social card from a named template (hero_destination, wildlife_spotlight, package_promo, etc.).',
    inputSchema:{type:'object',properties:{template:{type:'string'},data:{type:'object',description:'Template data: destination, caption, packageName, price, etc.'},platform:{type:'string'}},required:['template','data']}},
  { name:'generate_all_cards',
    description:'Generate ALL 10 card templates for a destination in one call. Use for full content batch.',
    inputSchema:{type:'object',properties:{destination:{type:'string'},data:{type:'object'}},required:['destination']}},
  { name:'save_to_posts',
    description:'Copy a finished output file into the posts/ subfolder for the correct platform.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},platform:{type:'string',enum:['whatsapp','instagram','instagram_story','tiktok','facebook','twitter','telegram']}},required:['filePath','platform']}},
  { name:'list_posts',
    description:'List all files in the posts/ directory, optionally filtered by platform subfolder.',
    inputSchema:{type:'object',properties:{platform:{type:'string'}}}},
  { name:'process_sample_as_test',
    description:'Use a sample image/video to test the full processing pipeline without uploading. Good for smoke-testing.',
    inputSchema:{type:'object',properties:{destination:{type:'string'},mediaType:{type:'string',enum:['image','video']}}}},
  { name:'batch_process_samples',
    description:'Process all samples in a destination folder sequentially through the full pipeline.',
    inputSchema:{type:'object',properties:{destination:{type:'string'}},required:['destination']}}
];

// NOTE (2026-08-03 fix): this file's handlers previously called method names
// (applyOverlay / generateBrandedMedia / makeReadyToPost / buildPostPackage /
// generateOverlayPlan / analyzeTheme / generateCard / generateAllCards /
// processSampleAsTest / batchProcessSamples) that never existed on ANY of the
// required engines — comp/intlRouter/imgVision/mediaAug/cardTpl/dynTpl all
// loaded fine, just under different real export names (compositeImage,
// routeIntelligence, analyseImage, analyzeContentForTheme, renderCard, ...).
// Every pipeline tool here silently fell through to a stub or threw. Fixed by
// wiring the handlers to the engines' actual exports (ported from the working
// monolith implementation in src/mcp/server.js). See CONTEXT.md §4/§6.
const HANDLERS = {
  async analyze_content_theme(args) {
    if (mediaAug?.analyzeContentForTheme) {
      const theme = mediaAug.analyzeContentForTheme(args);
      return { theme, suggestions: mediaAug.CREATIVE_THEMES };
    }
    if (imgVision?.analyseImage && args.filePath) return imgVision.analyseImage(args.filePath);
    return { theme: 'destination_profile', note: 'Vision engine not connected — using default theme.' };
  },

  async generate_overlay_plan(args) {
    if (mediaAug?.detectSubjectArea && args.filePath) {
      const subjectArea = await mediaAug.detectSubjectArea(args.filePath);
      return {
        contentType: args.theme || 'destination_profile',
        destination: args.destination,
        subjectArea,
        safeZones: [
          { name: 'top_center',    x: 0.5,  y: 0.2, anchor: 'middle' },
          { name: 'bottom_center', x: 0.5,  y: 0.8, anchor: 'middle' },
          { name: 'left_center',   x: 0.15, y: 0.5, anchor: 'start'  },
          { name: 'right_center',  x: 0.85, y: 0.5, anchor: 'end'    }
        ]
      };
    }
    if (intlRouter?.routeIntelligence) return intlRouter.routeIntelligence(args);
    return { plan: { position: 'bottom', brandBar: 'bottom', safeZone: '15%' }, note: 'Default plan — intelligence router not connected.' };
  },

  async generate_branded_media(args) {
    const fs = require('fs');
    const path = require('path');
    if (!args.filePath || !fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
    if (mediaAug?.analyzeContentForTheme) {
      const theme = mediaAug.analyzeContentForTheme({ destination: args.destination, mood: args.theme, context: args.caption });
      const marketing = mediaAug.generateMarketingPayload(theme, args.destination, args.caption);
      const ext = path.extname(args.filePath).toLowerCase();
      let enhancedBuffer;
      if (['.mp4', '.mov', '.avi'].includes(ext)) {
        const result = await mediaAug.enhanceVideo(args.filePath, {});
        enhancedBuffer = fs.readFileSync(result.file);
        try { fs.unlinkSync(result.file); } catch {}
      } else {
        enhancedBuffer = await mediaAug.renderDynamicText(args.filePath, {
          primary: marketing.tagline, secondary: args.caption, theme
        });
      }
      const outDir = cfg.OUTPUTS_DIR;
      fs.mkdirSync(outDir, { recursive: true });
      const finalPath = path.join(outDir, `branded_${theme}_${Date.now()}${ext}`);
      fs.writeFileSync(finalPath, enhancedBuffer);
      return { file: finalPath, filename: path.basename(finalPath), theme, marketing, downloadUrl: `/outputs/${path.basename(finalPath)}` };
    }
    return HANDLERS.apply_overlay(args);
  },

  async apply_overlay(args) {
    const fs = require('fs');
    const path = require('path');
    if (!args.filePath || !fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
    if (comp?.compositeImage) {
      const opts = { destination: args.destination || '', hook: args.hook || '', promoType: args.promoType || '', layout: args.layout || 'standard' };
      const ext = path.extname(args.filePath).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return await comp.compositeImage(args.filePath, opts);
      if (ext === '.mp4') return await comp.compositeVideo(args.filePath, opts);
      throw new Error('Unsupported file type: ' + ext);
    }
    throw new Error('Compositor engine not available');
  },

  async make_ready_to_post(args) {
    const fs = require('fs');
    const path = require('path');
    if (!args.filePath || !fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
    if (comp?.compositeImage) {
      let brand = {};
      try { brand = require('../../orchestrator/brand'); } catch {}
      const opts = {
        promoType: args.promoType || '', destination: args.destination || '', hook: args.caption || '',
        dateStr: new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }),
        layout: 'standard', email: brand.email, instagram: brand.socials?.instagram
      };
      const ext = path.extname(args.filePath).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return await comp.compositeImage(args.filePath, opts);
      if (ext === '.mp4') return await comp.compositeVideo(args.filePath, opts);
      throw new Error('Unsupported file type for overlay: ' + ext);
    }
    throw new Error('Ready-to-post compositor not available');
  },

  async build_post_package(args) {
    const fs = require('fs');
    const path = require('path');
    if (!args.filePath || !fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
    if (!comp?.compositeImage) throw new Error('Post package compositor not available');
    const ext = path.extname(args.filePath).toLowerCase();
    const isVideo = ext === '.mp4';
    const profiles = (args.platforms && args.platforms.length) ? args.platforms : ['instagram_post', 'instagram_story', 'facebook'];
    const opts = { destination: args.destination || '', hook: args.caption || '', layout: 'standard' };
    const results = [];
    for (const profile of profiles) {
      try {
        const r = isVideo ? await comp.compositeVideo(args.filePath, opts) : await comp.compositeImage(args.filePath, opts, profile);
        results.push({ profile, ...r });
      } catch (e) { results.push({ profile, error: e.message }); }
    }
    return { filePath: args.filePath, results, total: results.filter(r => !r.error).length, tip: 'postReady files are ready-to-post — download and share directly' };
  },

  async generate_card_template(args) {
    const fs = require('fs');
    if (cardTpl?.renderCard) {
      const template = args.template || 'hero_destination';
      const dest = args.destination || args.data?.destination || 'Masai Mara';
      const defaultData = cardTpl.buildDefaultData(dest, template);
      const data = { ...defaultData, ...(args.data || {}) };
      const profile = args.profile || args.platform || 'instagram_post';
      const bgImage = args.backgroundImage && fs.existsSync(args.backgroundImage) ? args.backgroundImage : null;
      const result = await cardTpl.renderCard({ template, data, backgroundImage: bgImage, profile });
      return { ...result, tip: `File available at outputs/${result.filename}` };
    }
    if (dynTpl?.renderDynamicTemplate) return dynTpl.renderDynamicTemplate(args);
    throw new Error('Card template engine not available');
  },

  async generate_all_cards(args) {
    if (!cardTpl?.renderCard) throw new Error('Card template engine not available');
    const dest = args.destination || 'Masai Mara';
    const profile = args.profile || args.platform || 'instagram_post';
    const TEMPLATES = ['hero_destination', 'safari_package', 'testimonial', 'wildlife_spotlight', 'dual_destination', 'activity', 'story', 'stats', 'itinerary', 'offer'];
    const results = [];
    for (const t of TEMPLATES) {
      try {
        const data = { ...cardTpl.buildDefaultData(dest, t), ...(args.data || {}) };
        const r = await cardTpl.renderCard({ template: t, data, backgroundImage: null, profile });
        results.push({ ...r, template: t });
      } catch (e) { results.push({ template: t, error: e.message }); }
    }
    return { destination: dest, profile, cards: results, total: results.filter(r => !r.error).length };
  },

  async save_to_posts({ filePath, platform }) {
    const fs = require('fs');
    const path = require('path');
    const dest = path.join(cfg.POSTS_DIR || path.join(path.resolve(__dirname, '../../../..'), 'posts'), platform || 'general');
    fs.mkdirSync(dest, { recursive: true });
    const out = path.join(dest, path.basename(filePath));
    fs.copyFileSync(filePath, out);
    return { saved: true, path: out };
  },
  async list_posts({ platform } = {}) {
    const fs = require('fs');
    const path = require('path');
    const postsDir = cfg.POSTS_DIR || path.join(path.resolve(__dirname, '../../../..'), 'posts');
    if (!fs.existsSync(postsDir)) return { files: [] };
    const walk = (dir) => {
      let out = [];
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) out.push(...walk(full));
        else out.push(full.replace(postsDir + '/', ''));
      }
      return out;
    };
    let files = walk(postsDir);
    if (platform) files = files.filter(f => f.startsWith(platform));
    return { files };
  },
  async process_sample_as_test({ destination = 'Masai Mara', mediaType = 'image' }) {
    try {
      const mediaLib = require('../../engines/media-library');
      const sample = mediaLib.getRandomSample(destination, mediaType);
      if (!sample) return { note: `No local samples found for ${destination} (${mediaType}) — try lavira-search:get_sample_media first.` };
      return await HANDLERS.apply_overlay({ filePath: sample.localPath, destination });
    } catch (e) {
      return { note: `Test pipeline for ${destination} ${mediaType} failed: ${e.message}` };
    }
  },
  async batch_process_samples({ destination }) {
    try {
      const mediaLib = require('../../engines/media-library');
      const samples = mediaLib.getSamplesByDestination('image', destination).slice(0, 5);
      const results = [];
      for (const sample of samples) {
        try { results.push(await HANDLERS.apply_overlay({ filePath: sample.localPath, destination })); }
        catch (e) { results.push({ error: e.message, file: sample.localPath }); }
      }
      return { destination, processed: results.filter(r => !r.error).length, total: samples.length, results };
    } catch (e) {
      return { note: `Batch for ${destination} failed: ${e.message}` };
    }
  }
};

rpc.start({ name: 'lavira-design', version: '4.0.1', tools: TOOLS, handlers: HANDLERS });
