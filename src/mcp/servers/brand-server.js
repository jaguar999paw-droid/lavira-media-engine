#!/usr/bin/env node
// src/mcp/servers/brand-server.js — lavira-brand
// Concern: Brand knowledge, content intelligence, AI caption generation, memory management
// Tools: 13 | Op types: R, W, A — no media file writes, no social publishing
'use strict';

const rpc  = require('../lib/rpc-core');
const path = require('path');
const fs   = require('fs');

let BRAND, intentEng, memoryEng, settingsEng, aiCaptions, captions;
try { BRAND       = require('../../orchestrator/brand');    } catch { BRAND       = null; }
try { intentEng   = require('../../orchestrator/intent');   } catch { intentEng   = null; }
try { memoryEng   = require('../../orchestrator/memory');   } catch { memoryEng   = null; }
try { settingsEng = require('../../orchestrator/settings'); } catch { settingsEng = null; }
try { aiCaptions  = require('../../content/ai-captions');   } catch { aiCaptions  = null; }
try { captions    = require('../../content/captions');      } catch { captions    = null; }

const MEMORY_PATH = path.resolve(__dirname, '../../../../LAVIRA_USER_MEMORY.md');
const RULES_PATH  = path.resolve(__dirname, '../../../../AGENT_RULES.md');

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_brand_info',
    description: 'Return full Lavira Safaris brand dictionary: name, contacts, destinations, packages, USPs, visual guidelines.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_safari_packages',
    description: 'Return all Lavira safari packages with names, durations, destinations, highlights.',
    inputSchema: {
      type: 'object',
      properties: { destination: { type: 'string', description: 'Filter by destination' } }
    }
  },
  {
    name: 'get_destinations_to_feature',
    description: 'Return destinations ranked by least-recently-used this week — tells you what to post about today.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_destination_rotation_status',
    description: 'Show per-destination posting frequency: last posted date, 7d/30d counts, priority score.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'check_content_duplicate',
    description: 'Check if a caption is too similar to a recent post for the same destination — prevents repetitive content.',
    inputSchema: {
      type: 'object',
      properties: {
        caption:     { type: 'string', description: 'Caption text to check' },
        destination: { type: 'string', description: 'Destination to check against recent posts' }
      },
      required: ['caption']
    }
  },
  {
    name: 'analyze_content_theme',
    description: 'Analyze media content and determine optimal creative theme (lion=power, elephant=family, migration=epic).',
    inputSchema: {
      type: 'object',
      properties: {
        mediaDescription: { type: 'string', description: 'Describe the media or enter a destination name' },
        destination:      { type: 'string', description: 'Destination context' }
      }
    }
  },
  {
    name: 'generate_video_script',
    description: 'Generate structured multi-part video script with timing, hook, body beats, CTA, and voiceover text.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Safari destination' },
        theme:       { type: 'string', description: 'Content theme' },
        duration:    { type: 'number', description: 'Video duration in seconds (default: 30)' },
        tone:        { type: 'string', description: 'Tone: epic, warm, educational, adventurous (default: epic)' }
      }
    }
  },
  {
    name: 'ask_claude',
    description: 'Send a custom prompt to Claude AI for advanced reasoning or content generation. Brand context is pre-injected.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:  { type: 'string', description: 'Your prompt or question' },
        context: { type: 'string', description: 'Additional context to include' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'get_user_memory',
    description: 'Read the Lavira user memory and productivity profile (LAVIRA_USER_MEMORY.md).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'update_user_memory',
    description: 'Append or replace a section in the LAVIRA_USER_MEMORY.md file.',
    inputSchema: {
      type: 'object',
      properties: {
        section:  { type: 'string', description: 'Section header to update or append' },
        content:  { type: 'string', description: 'New content for the section' },
        mode:     { type: 'string', enum: ['append', 'replace'], description: 'append (default) or replace' }
      },
      required: ['section', 'content']
    }
  },
  {
    name: 'generate_marketing_payload',
    description: 'Generate complete marketing content package: tagline, CTA, contact info, promotional text for a destination.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Safari destination' },
        packageName: { type: 'string', description: 'Specific package name (optional)' },
        theme:       { type: 'string', description: 'Content theme' },
        platform:    { type: 'string', description: 'Target platform for tone adaptation' }
      }
    }
  },
  {
    name: 'generate_promo_package',
    description: 'Generate AI caption + story hook + CTA + hashtags + related package for any destination and media type.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Safari destination name' },
        mediaType:   { type: 'string', enum: ['video','photo','audio','giphy','auto'], description: 'Type of media' },
        theme:       { type: 'string', description: 'Content theme' },
        context:     { type: 'string', description: 'Additional context for caption generation' }
      }
    }
  },
  {
    name: 'smart_generate',
    description: 'MASTER TOOL: Parse any natural language prompt and execute the full post generation pipeline. Best entry point for casual prompts.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:      { type: 'string', description: 'Natural language prompt e.g. "Generate a WhatsApp post for today" or "Make a Masai Mara reel"' },
        destination: { type: 'string', description: 'Override destination (optional — auto-detected from prompt)' },
        platform:    { type: 'string', description: 'Override platform (optional)' }
      },
      required: ['prompt']
    }
  }
,

  // ── PRE-FLIGHT CLARIFICATION GATE ─────────────────────────────────────────
  {
    name: 'pre_flight_check',
    description: 'ALWAYS call this before any generative workflow. Parses the user prompt, resolves platform/destination/theme from context, and returns either a ready execution plan (clarification_needed: false) or a focused list of questions to ask the user before proceeding. Implements AGENT_RULES Rule 3.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:      { type: 'string', description: 'Raw user message exactly as received' },
        destination: { type: 'string', description: 'Override destination if already known' },
        platform:    { type: 'string', description: 'Override platform if already known' },
        mediaType:   { type: 'string', description: 'Override mediaType if already known' }
      },
      required: ['prompt']
    }
  }
];

// ── Handlers ────────────────────────────────────────────────────────────────

const HANDLERS = {

  async get_brand_info() {
    if (BRAND?.getBrandInfo) return BRAND.getBrandInfo();
    if (BRAND?.BRAND_INFO)   return BRAND.BRAND_INFO;
    if (BRAND && typeof BRAND === 'object') return BRAND;
    return { name: 'Lavira Safaris', country: 'Kenya', note: 'Brand module loaded but no getBrandInfo export found.' };
  },

  async get_safari_packages({ destination } = {}) {
    if (BRAND?.getPackages) return BRAND.getPackages(destination);
    if (BRAND?.PACKAGES) {
      return destination
        ? BRAND.PACKAGES.filter(p => p.destination?.toLowerCase().includes(destination.toLowerCase()))
        : BRAND.PACKAGES;
    }
    return { note: 'Brand packages not available.' };
  },

  async get_destinations_to_feature() {
    if (memoryEng?.getDestinationsToFeature) return memoryEng.getDestinationsToFeature();
    const dests = ['Masai Mara','Amboseli','Samburu','Tsavo','Nakuru','Laikipia','Diani Beach'];
    return { destinations: dests, note: 'Static list — memory engine not connected.' };
  },

  async get_destination_rotation_status() {
    if (memoryEng?.getDestinationRotationStatus) return memoryEng.getDestinationRotationStatus();
    return { note: 'Rotation status not available — memory engine not connected.' };
  },

  async check_content_duplicate({ caption, destination }) {
    if (memoryEng?.checkContentDuplicate) return memoryEng.checkContentDuplicate({ caption, destination });
    return { isDuplicate: false, note: 'Duplicate check skipped — memory engine not connected.' };
  },

  async analyze_content_theme({ mediaDescription, destination }) {
    const THEME_MAP = {
      'lion': 'wildlife_spotlight', 'elephant': 'wildlife_spotlight', 'migration': 'wildlife_spotlight',
      'mara': 'destination_profile', 'amboseli': 'destination_profile', 'samburu': 'destination_profile',
      'sunset': 'adventure_activity', 'sunrise': 'adventure_activity', 'balloon': 'adventure_activity',
      'conservation': 'conservation', 'community': 'conservation', 'maasai': 'cultural_moment',
      'package': 'safari_package_promo', 'days': 'safari_package_promo', 'price': 'safari_package_promo',
    };
    const text = ((mediaDescription || '') + ' ' + (destination || '')).toLowerCase();
    for (const [keyword, theme] of Object.entries(THEME_MAP)) {
      if (text.includes(keyword)) return { theme, confidence: 'keyword_match', input: text };
    }
    return { theme: 'destination_profile', confidence: 'default' };
  },

  async generate_video_script({ destination, theme, duration = 30, tone = 'epic' }) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const brandContext = BRAND ? JSON.stringify(await HANDLERS.get_brand_info()).slice(0, 800) : 'Lavira Safaris, Kenya';

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are a safari content director for ${brandContext}.
Write a ${duration}s ${tone} video script for: "${destination || 'Kenya safari'}" with theme "${theme || 'wildlife_spotlight'}".
Format as JSON: { hook (0-5s), beats: [{time, voiceover, visual}], cta (last 5s), hashtags[] }`
      }]
    });
    try { return JSON.parse(msg.content[0].text.replace(/```json|```/g,'')); }
    catch { return { script: msg.content[0].text }; }
  },

  async ask_claude({ prompt, context }) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const brandCtx = 'Lavira Safaris — Kenya wildlife safari company. Destinations: Masai Mara, Amboseli, Samburu, Tsavo.';
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: `You are the AI content engine for ${brandCtx}`,
      messages: [{ role: 'user', content: context ? `${context}\n\n${prompt}` : prompt }]
    });
    return { response: msg.content[0].text };
  },

  async get_user_memory() {
    if (!fs.existsSync(MEMORY_PATH)) return { note: 'LAVIRA_USER_MEMORY.md not found.' };
    return { memory: fs.readFileSync(MEMORY_PATH, 'utf8') };
  },

  async update_user_memory({ section, content, mode = 'append' }) {
    if (memoryEng?.updateUserMemory) return memoryEng.updateUserMemory({ section, content, mode });
    if (!fs.existsSync(MEMORY_PATH)) return { updated: false, reason: 'Memory file not found' };
    const current = fs.readFileSync(MEMORY_PATH, 'utf8');
    const header  = `## ${section.startsWith('##') ? section.slice(2).trim() : section}`;
    if (mode === 'replace' && current.includes(header)) {
      const before = current.slice(0, current.indexOf(header));
      const after  = current.slice(current.indexOf('\n## ', current.indexOf(header) + 1) || undefined);
      fs.writeFileSync(MEMORY_PATH, before + header + '\n\n' + content + '\n\n' + after);
    } else {
      fs.appendFileSync(MEMORY_PATH, `\n\n${header}\n\n${content}\n`);
    }
    return { updated: true, section };
  },

  async generate_marketing_payload({ destination, packageName, theme, platform }) {
    if (aiCaptions?.generateMarketingPayload) return aiCaptions.generateMarketingPayload({ destination, packageName, theme, platform });
    return HANDLERS.generate_promo_package({ destination, theme, mediaType: 'photo', context: packageName });
  },

  async generate_promo_package({ destination, mediaType = 'photo', theme, context }) {
    if (aiCaptions?.generatePromoPackage) return aiCaptions.generatePromoPackage({ destination, mediaType, theme, context });
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const dest = destination || 'Masai Mara';
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generate a social media promo package for Lavira Safaris.
Destination: ${dest} | Theme: ${theme || 'wildlife_spotlight'} | Media: ${mediaType} | Context: ${context || 'none'}
Return JSON only: { caption, hook, cta, hashtags[], package_suggestion }`
      }]
    });
    try { return JSON.parse(msg.content[0].text.replace(/```json|```/g,'')); }
    catch { return { caption: msg.content[0].text }; }
  },

  async smart_generate({ prompt, destination, platform }) {
    // Parse intent then delegate
    let intent = {};
    if (intentEng?.parseIntent) { intent = await intentEng.parseIntent(prompt); }
    else {
      const lower = prompt.toLowerCase();
      const DESTS = ['masai mara','amboseli','samburu','tsavo','nakuru','laikipia','diani'];
      const PLATFORMS = ['whatsapp','instagram','tiktok','facebook','reel','story'];

      intent.destination = destination || DESTS.find(d => lower.includes(d));
      intent.platform    = platform    || PLATFORMS.find(p => lower.includes(p));
      intent.mediaType   = lower.includes('video') || lower.includes('reel') ? 'video' : 'photo';
    }
    return {
      parsed_intent: intent,
      promo: await HANDLERS.generate_promo_package({
        destination: intent.destination || destination || 'Masai Mara',
        mediaType:   intent.mediaType   || 'photo',
        theme:       intent.theme,
        context:     prompt
      })
    };
  },

  async pre_flight_check({ prompt, destination, platform, mediaType }) {
    if (!intentEng?.parseIntent) {
      return { clarification_needed: false, resolved: { destination, platform, mediaType }, questions: [] };
    }
    const parsed = intentEng.parseIntent(prompt);
    const questions = [];

    // Only ask what is genuinely missing — don't over-prompt
    const hasUrgency = /\b(now|today|quick|fast)\b/i.test(prompt);

    if (!parsed.destination && !destination && !hasUrgency)
      questions.push({ field: 'destination', question: 'Which destination should this post feature? (e.g. Masai Mara, Amboseli, Samburu…)' });

    if (!parsed.platform || parsed.platform === 'default')
      if (!/instagram|tiktok|whatsapp|facebook|twitter|telegram/i.test(prompt) && !platform)
        questions.push({ field: 'platform', question: 'Which platform is this for? (Instagram, WhatsApp, TikTok, Facebook — or just save to outputs/)' });

    const mediaSignal = /\b(reel|video|clip|mp4|motion)\b/i.test(prompt) || /\b(image|photo|jpg|card|poster)\b/i.test(prompt);
    if (!mediaSignal && !mediaType)
      questions.push({ field: 'mediaType', question: 'Image or video?' });

    if (questions.length === 0) {
      // Load AGENT_RULES for context enrichment
      let rulesDigest = '';
      try { rulesDigest = fs.readFileSync(RULES_PATH, 'utf8').slice(0, 800); } catch {}
      return {
        clarification_needed: false,
        resolved: {
          destination: parsed.destination || destination || null,
          platform:    parsed.platform    || platform    || 'outputs',
          mediaType:   parsed.mediaType   || mediaType   || 'image',
          theme:       parsed.theme,
          profiles:    parsed.profiles,
          isUrgent:    parsed.isUrgent,
        },
        tool_plan: [
          parsed.destination ? null : 'get_destinations_to_feature',
          'fetch_optimal_media',
          'generate_branded_media',
          'generate_promo_package',
          'make_ready_to_post',
        ].filter(Boolean),
        rules_active: rulesDigest ? true : false,
        note: 'All parameters resolved. Proceed with tool_plan in order.'
      };
    }

    return {
      clarification_needed: true,
      questions,
      partial_intent: {
        destination: parsed.destination || destination || null,
        platform:    parsed.platform    || platform    || null,
        mediaType:   parsed.mediaType   || mediaType   || null,
        theme:       parsed.theme,
      },
      note: 'Ask the user these questions before proceeding.'
    };
  }
};

rpc.start({ name: 'lavira-brand', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
