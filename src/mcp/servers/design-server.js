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

const HANDLERS = {
  async analyze_content_theme(args) {
    if (imgVision?.analyzeContentTheme) return imgVision.analyzeContentTheme(args);
    if (intlRouter?.analyzeTheme) return intlRouter.analyzeTheme(args);
    return { theme: 'destination_profile', note: 'Vision engine not connected — using default theme.' };
  },
  async generate_overlay_plan(args) {
    if (intlRouter?.generateOverlayPlan) return intlRouter.generateOverlayPlan(args);
    if (comp?.generateOverlayPlan) return comp.generateOverlayPlan(args);
    return { plan: { position: 'bottom', brandBar: 'bottom', safeZone: '15%' }, note: 'Default plan — intelligence router not connected.' };
  },
  async generate_branded_media(args) {
    if (mediaAug?.generateBrandedMedia) return mediaAug.generateBrandedMedia(args);
    if (comp?.generateBrandedMedia) return comp.generateBrandedMedia(args);
    // Fallback to overlay
    return HANDLERS.apply_overlay(args);
  },
  async apply_overlay(args) {
    if (comp?.applyOverlay) return comp.applyOverlay(args);
    throw new Error('Compositor engine not available');
  },
  async make_ready_to_post(args) {
    if (comp?.makeReadyToPost) return comp.makeReadyToPost(args);
    if (mediaAug?.makeReadyToPost) return mediaAug.makeReadyToPost(args);
    throw new Error('Ready-to-post compositor not available');
  },
  async build_post_package(args) {
    if (comp?.buildPostPackage) return comp.buildPostPackage(args);
    throw new Error('Post package compositor not available');
  },
  async generate_card_template(args) {
    if (cardTpl?.generateCard) return cardTpl.generateCard(args);
    if (dynTpl?.generateCard) return dynTpl.generateCard(args);
    throw new Error('Card template engine not available');
  },
  async generate_all_cards(args) {
    if (cardTpl?.generateAllCards) return cardTpl.generateAllCards(args);
    if (dynTpl?.generateAllCards) return dynTpl.generateAllCards(args);
    throw new Error('Card template engine not available');
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
    if (comp?.processSampleAsTest) return comp.processSampleAsTest({ destination, mediaType });
    return { note: `Test pipeline for ${destination} ${mediaType} — compositor not connected.` };
  },
  async batch_process_samples({ destination }) {
    if (comp?.batchProcessSamples) return comp.batchProcessSamples({ destination });
    return { note: `Batch for ${destination} — compositor not connected.` };
  }
};

rpc.start({ name: 'lavira-design', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
