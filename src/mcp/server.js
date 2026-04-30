#!/usr/bin/env node
// mcp/server.js — Lavira Media Engine MCP v3
// Transport: stdio (Claude Desktop) OR HTTP/SSE (remote clients, web interface)
// Run modes:
//   stdio : node src/mcp/server.js              (for Claude Desktop)
//   http  : node src/mcp/server.js --http 4005  (for remote/web clients)
'use strict';

// ── Stdio safety: redirect console.* to stderr (stdout = JSON-RPC channel) ──
if (!process.argv.includes('--http')) {
  const _se = (l, a) => process.stderr.write('[' + l + '] ' + a.map(String).join(' ') + '\n');
  console.log   = (...a) => _se('log',   a);
  console.info  = (...a) => _se('info',  a);
  console.warn  = (...a) => _se('warn',  a);
  console.error = (...a) => _se('error', a);
  console.debug = (...a) => _se('debug', a);
}

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const http = require('http');
const cfg  = require('../config');

[cfg.UPLOADS_DIR, cfg.OUTPUTS_DIR, cfg.ASSETS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const videoEng  = require('../engines/video');
const imageEng  = require('../engines/image');
const audioEng  = require('../engines/audio');
const giphyEng  = require('../engines/giphy');
const promoEng  = require('../engines/promo');
const comp      = require('../engines/compositor');
const { generatePromoPackage } = require('../content/ai-captions');
const { log, state } = require('../orchestrator/memory');
const BRAND     = require('../orchestrator/brand');
const intent    = require('../orchestrator/intent');
const imageEnh  = require('../engines/image-enhanced');
const videoEnh  = require('../engines/video-enhanced');

const isHTTP = process.argv.includes('--http');
const httpPort = parseInt(process.argv[process.argv.indexOf('--http') + 1] || '4005');

// ── Tool registry ─────────────────────────────────────────────────────────────
const TOOLS = [
  // INTAKE TOOLS
  { name:'process_video',
    description:'Process a video file: auto-crop, watermark, export one platform variant. Returns jobId to poll.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, platform:{type:'string'}, duration:{type:'number'}, trimStart:{type:'number'}, trimDuration:{type:'number'}, speed:{type:'number'}, quality:{type:'string'}, destination:{type:'string'}, context:{type:'string'} }, required:['filePath','platform'] } },
  { name:'process_image',
    description:'Process a photo with optional manual edits (crop, rotate, color). Exports to social profiles. Returns results immediately.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, profiles:{type:'array'}, destination:{type:'string'}, fit:{type:'string'}, edits:{type:'object',description:'Manual edits: {crop:{x,y,width,height}, rotate:90, flipH:true, brightness:1.1, saturation:1.2, hue:10, contrast:1.1, sharpen:true}'}, watermark:{type:'boolean'}, brandTint:{type:'boolean'} }, required:['filePath'] } },
  { name:'process_audio',
    description:'Process audio: normalise, fade, export at one exact duration (15/30/45/60s) for social platforms.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, profiles:{type:'array'}, preset:{type:'number',description:'Duration preset in seconds e.g. 30'}, trimStart:{type:'number'}, destination:{type:'string'} }, required:['filePath'] } },
  { name:'search_giphy',
    description:'Search GIPHY for safari GIFs. Returns preview URLs + IDs for use_giphy.',
    inputSchema:{ type:'object', properties:{ query:{type:'string'}, destination:{type:'string'}, limit:{type:'number'} } } },
  { name:'use_giphy',
    description:'Download a GIPHY GIF by ID as MP4, generate branded promo package.',
    inputSchema:{ type:'object', properties:{ giphyId:{type:'string'}, destination:{type:'string'}, context:{type:'string'} }, required:['giphyId'] } },
  { name:'generate_auto_promo',
    description:'Zero-input: pick destination, find stock safari image, apply brand, generate caption. No upload needed.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, theme:{type:'string',enum:['wildlife_spotlight','destination_profile','safari_package_promo','guest_testimonial','conservation','cultural_moment','adventure_activity','sunrise_sunset']}, context:{type:'string'}, profiles:{type:'array'} } } },
  { name:'search_stock_images',
    description:'Search Pexels for stock safari images by keyword. Returns preview URLs for selection.',
    inputSchema:{ type:'object', properties:{ query:{type:'string'}, limit:{type:'number'} }, required:['query'] } },
  { name:'ask_claude',
    description:'Send a custom prompt to Claude AI for advanced reasoning or content generation.',
    inputSchema:{ type:'object', properties:{ prompt:{type:'string'}, context:{type:'string'} }, required:['prompt'] } },
  // CONTENT TOOLS
  { name:'generate_promo_package',
    description:'Generate AI caption + story hook + CTA + hashtags + related package for any destination and media type.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, mediaType:{type:'string',enum:['video','photo','audio','giphy','auto']}, context:{type:'string'} } } },
  { name:'get_destinations_to_feature',
    description:'Return destinations ranked by least-recently-used this week — tells you what to post about today.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'get_safari_packages',
    description:'Return all Lavira safari packages with names, durations, destinations, highlights.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string',description:'Filter by destination'} } } },
  // COMPOSITOR / READY-TO-POST
  { name:'make_ready_to_post',
    description:'Apply branded overlay to processed media: adds Lavira logo bar, title, promo type, destination, hook text, phone/website/instagram. Returns post-ready file.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, promoType:{type:'string'}, destination:{type:'string'}, hook:{type:'string'}, dateStr:{type:'string'}, layout:{type:'string',enum:['standard','story','minimal']} }, required:['filePath'] } },
  { name:'build_post_package',
    description:'Build complete ready-to-post package from a finished job: apply overlays to all outputs, return with caption and hashtags.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, promoType:{type:'string'} }, required:['jobId'] } },
  { name:'mix_audio_with_media',
    description:'Attach/uploaded music to an image or video. Audio is looped/trimmed to match duration. Images become short 9:16 MP4 with music.',
    inputSchema:{ type:'object', properties:{ mediaPath:{type:'string'}, audioPath:{type:'string'}, durationSeconds:{type:'number'} }, required:['mediaPath','audioPath'] } },
  // JOB MANAGEMENT
  { name:'get_job_status',
    description:'Poll a processing job. Returns status (processing/done/error), results, promo package.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'} }, required:['jobId'] } },
  { name:'approve_job',
    description:'Approve a completed job for sharing. Logs decision to memory.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'} }, required:['jobId'] } },
  { name:'reject_job',
    description:'Reject a job. Optionally provide a note explaining why.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, note:{type:'string'} }, required:['jobId'] } },
  { name:'get_share_package',
    description:'Get complete sharing bundle: caption, hook, hashtags, CTA, per-platform download links.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'} }, required:['jobId'] } },
  // MEMORY / HISTORY
  { name:'list_recent_jobs',
    description:'List recent content jobs with status, destination, media type, caption.',
    inputSchema:{ type:'object', properties:{ limit:{type:'number'}, status:{type:'string',enum:['done','approved','processing','rejected','all']} } } },
  { name:'list_output_files',
    description:'List all files in the outputs directory (videos, images, audio, GIFs).',
    inputSchema:{ type:'object', properties:{ type:{type:'string',enum:['all','video','image','audio','post_ready']} } } },
  { name:'delete_output_file',
    description:'Delete a specific output file by filename.',
    inputSchema:{ type:'object', properties:{ filename:{type:'string'} }, required:['filename'] } },
  // BRAND / SYSTEM
  { name:'get_brand_info',
    description:'Return full Lavira Safaris brand dictionary: name, contacts, destinations, packages, guides, hashtags, USPs.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'get_admin_settings',
    description:'Get persisted admin settings (brand/publish/workflow/cleanup/cache). Used by UI and MCP workflows to stay consistent.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'update_admin_settings',
    description:'Update persisted admin settings by deep-merging the provided patch object. Returns the updated settings.',
    inputSchema:{ type:'object', properties:{ patch:{ type:'object' } }, required:['patch'] } },
  { name:'get_api_status',
    description:'Check which API integrations are active (Claude AI, GIPHY, Pexels, social tokens). Shows what requires setup.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'get_daily_schedule',
    description:'Get the auto-generated daily promo schedule. Shows upcoming and past scheduled posts.',
    inputSchema:{ type:'object', properties:{ days:{type:'number'} } } },
  { name:'trigger_daily_promo',
    description:'Immediately trigger the daily auto-promo generation (normally runs at 06:00 EAT).',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'} } } },
  // WEB INTERFACE CONTROL
  { name:'get_engine_health',
    description:'Check the health of the Lavira Media Engine web server: FFmpeg status, disk space, active jobs, all API statuses.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'list_upload_files',
    description:'List files available in the uploads directory.',
    inputSchema:{ type:'object', properties:{} } },
  // DIRECT POSTING / PUBLISHING
  { name:'post_to_instagram',
    description:'Publish a ready-to-post job to Instagram Reels, Feed, or Stories. Requires INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID in .env.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, format:{type:'string',enum:['reels','feed','stories']}, caption:{type:'string'} }, required:['jobId'] } },
  { name:'post_to_tiktok',
    description:'Publish a job to TikTok. Requires TIKTOK_ACCESS_TOKEN in .env. Auto-detects best video format.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, caption:{type:'string'} }, required:['jobId'] } },
  { name:'post_to_facebook',
    description:'Publish a job to Facebook page feed. Requires FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID in .env.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, caption:{type:'string'} }, required:['jobId'] } },
  { name:'publish_job',
    description:'Publish a finished job to multiple platforms at once. Fails gracefully if tokens aren\'t configured.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, platforms:{type:'array',items:{type:'string'},enum:['instagram','tiktok','facebook']} }, required:['jobId'] } },
  // CARD TEMPLATES & OVERLAYS
  { name:'generate_card_template',
    description:'Generate a single branded social card. 10 templates available, all with Lavira/wildlife media and double brand promotion. Defaults auto-fill from brand.js if data not specified.',
    inputSchema:{ type:'object', properties:{
      template:{type:'string',enum:[
        'hero_destination',
        'safari_package',
        'testimonial',
        'wildlife_spotlight',
        'dual_destination',
        'activity',
        'story',
        'stats',
        'itinerary',
        'offer'
      ],
        description:'hero_destination=immersive photo card; safari_package=highlights+CTA; testimonial=guest quote; wildlife_spotlight=animal+fact; dual_destination=two-dest comparison; activity=adventure highlight; story=9:16 WhatsApp/IG story card; stats=3-stat blocks; itinerary=day-by-day plan; offer=price+inclusions+urgency'},
      destination:{type:'string',description:'Auto-selects LRU destination if omitted'},
      profile:{type:'string',enum:['instagram_post','instagram_story','instagram_portrait','facebook','twitter_card','tiktok'],description:'Fixed output size. Default: instagram_post'},
      data:{type:'object',description:'Override any field. Leave empty to use brand.js defaults for the destination'},
      fetchBackground:{type:'boolean',description:'Auto-fetch Pexels wildlife photo as background. Default true for photo-bg templates'}
    }, required:['template'] } },
  { name:'generate_all_cards',
    description:'Generate ALL 10 card templates for a destination in one call. Returns array of files, one per template. Single post session: picks one template automatically based on LRU rotation.',
    inputSchema:{ type:'object', properties:{
      destination:{type:'string'},
      profile:{type:'string',enum:['instagram_post','instagram_story','instagram_portrait','facebook']},
      singlePost:{type:'boolean',description:'If true, generate only one card using next LRU template (default true for single-post-per-session rule)'}
    } } },
  { name:'apply_overlay',
    description:'Apply Lavira brand overlay to an image or video. Adds logo bar, title, hook, contact info, destination.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, destination:{type:'string'}, hook:{type:'string'}, promoType:{type:'string'}, layout:{type:'string',enum:['standard','story','minimal']} }, required:['filePath'] } },
  // SAMPLE MEDIA LIBRARY
  { name:'list_sample_media',
    description:'List all sample media available for testing (organized by destination, type, theme).',
    inputSchema:{ type:'object', properties:{ type:{type:'string',enum:['all','images','videos','audio']}, destination:{type:'string'} } } },
  { name:'get_sample_media',
    description:'Get sample media files for a specific destination. Useful for testing without real uploads.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, type:{type:'string',enum:['image','video','audio']}, random:{type:'boolean'} }, required:['destination'] } },
  { name:'process_sample_as_test',
    description:'Use a sample image/video to test the full processing pipeline without uploading. Great for quick demos.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, mediaType:{type:'string',enum:['image','video']}, platforms:{type:'array'} } } },
  // BATCH OPERATIONS
  { name:'batch_process_samples',
    description:'Process all samples in a destination folder sequentially. Returns array of jobIds.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, mediaType:{type:'string',enum:['image','video']}, limit:{type:'number'} } } },
  { name:'schedule_post',
    description:'Schedule a job/sample to post at a specific time to selected platforms.',
    inputSchema:{ type:'object', properties:{ jobId:{type:'string'}, scheduledTime:{type:'string',description:'ISO 8601 datetime'}, platforms:{type:'array'} }, required:['jobId','scheduledTime'] } },
  // DYNAMIC TEMPLATES & MEDIA AUGMENTATION
  { name:'generate_branded_media',
    description:'Apply intelligent branding to media: analyze content, select theme, render dynamic overlays, enhance visuals.',
    inputSchema:{ type:'object', properties:{ mediaPath:{type:'string'}, destination:{type:'string'}, theme:{type:'string'}, context:{type:'string'}, enhancements:{type:'object',description:'Video/image enhancements: {colorGrade, vignette, sharpen, brightness, contrast, saturation, addIntro, addOutro, textOverlays, backgroundAudio}'} }, required:['mediaPath'] } },
  { name:'generate_overlay_plan',
    description:'Analyze media and generate optimal overlay positioning plan: text placement, branding zones, readability optimization.',
    inputSchema:{ type:'object', properties:{ mediaPath:{type:'string'}, contentType:{type:'string'}, destination:{type:'string'} }, required:['mediaPath'] } },
  { name:'generate_marketing_payload',
    description:'Generate complete marketing content package: tagline, CTA, contact info, promotional message, hashtags.',
    inputSchema:{ type:'object', properties:{ theme:{type:'string'}, destination:{type:'string'}, context:{type:'string'} } } },
  // EXTERNAL MEDIA SOURCING
  { name:'search_external_media',
    description:'Search Pexels/Unsplash for high-quality wildlife media with intelligent query building.',
    inputSchema:{ type:'object', properties:{ query:{type:'string'}, type:{type:'string',enum:['image','video']}, destination:{type:'string'}, theme:{type:'string'}, limit:{type:'number'} } } },
  { name:'fetch_optimal_media',
    description:'Fetch best-matching external media for content creation: intelligent ranking, caching, fallback logic.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, theme:{type:'string'}, type:{type:'string',enum:['image','video']}, context:{type:'string'} }, required:['destination'] } },
  // CREATIVE INTELLIGENCE
  { name:'analyze_content_theme',
    description:'Analyze media content and determine optimal creative theme (lion=power, elephant=wisdom, etc.).',
    inputSchema:{ type:'object', properties:{ mediaPath:{type:'string'}, animal:{type:'string'}, destination:{type:'string'}, mood:{type:'string'}, context:{type:'string'} } } },
  
  // HIGH-IMPACT WORKFLOW & CONTENT TOOLS
  { name:'create_post_workflow',
    description:'End-to-end post creation: fetch optimal media → generate branded version → create caption + video script → package for publishing. One-call workflow.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, theme:{type:'string'}, mediaType:{type:'string',enum:['image','video']}, context:{type:'string'} }, required:['destination'] } },
  { name:'generate_video_script',
    description:'Generate structured multi-part video script with timing, hook, body beats, CTA, B-roll recommendations, and music mood.',
    inputSchema:{ type:'object', properties:{ destination:{type:'string'}, theme:{type:'string'}, duration:{type:'number',description:'Video duration in seconds (default 30)'}, context:{type:'string'} } } },
  

  // POSTS MANAGEMENT
  { name:'save_to_posts',
    description:'Copy a finished output file into posts/ subdir. Platforms: instagram, facebook, tiktok, mcp-tasks, archive.',
    inputSchema:{ type:'object', properties:{ filename:{type:'string',description:'Output filename (from outputs/ dir)'}, platform:{type:'string',enum:['instagram','facebook','tiktok','whatsapp','mcp-tasks','archive'],description:'Target subfolder'}, label:{type:'string',description:'Optional human label to prefix the file e.g. "zebra_grassland_post"'} }, required:['filename','platform'] } },
  { name:'list_posts',
    description:'List all files in the posts/ directory, optionally filtered by platform subfolder.',
    inputSchema:{ type:'object', properties:{ platform:{type:'string',enum:['instagram','facebook','tiktok','whatsapp','mcp-tasks','archive','all']} } } },
  // CACHE MANAGEMENT
  { name:'cache_stats',
    description:'Check external media cache stats: size, entries, age, freshness. Useful for monitoring storage.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'cache_prune',
    description:'Evict expired cache entries (older than 30 days). Frees disk space.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'cache_clear',
    description:'Clear entire external media cache. Useful for manual cleanup.',
    inputSchema:{ type:'object', properties:{} } },
  // ─── ROTATION & DEDUP (improvement #5) ────────────────────────────────────
  { name:'get_destination_rotation_status',
    description:'Show per-destination posting frequency: last posted date, 7d/30d counts, priority score. Use to decide what destination to post about next.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'check_content_duplicate',
    description:'Check if a caption is too similar to a recent post for the same destination. Returns isDuplicate + matchedJobId if a match is found.',
    inputSchema:{ type:'object', properties:{ caption:{type:'string'}, destination:{type:'string'}, windowDays:{type:'number',description:'Lookback window in days (default 14)'} }, required:['caption','destination'] } },
  // ─── BOOKING TRIGGERS (improvement #3) ────────────────────────────────────
  { name:'record_booking',
    description:'Manually record a confirmed safari booking. Stores guest info and auto-triggers a thank-you social post unless autoTriggerContent is false.',
    inputSchema:{ type:'object', properties:{ guestName:{type:'string'}, guestEmail:{type:'string'}, destination:{type:'string'}, packageName:{type:'string'}, travelDate:{type:'string'}, partySize:{type:'number'}, notes:{type:'string'}, autoTriggerContent:{type:'boolean'} } } },
  { name:'trigger_post_booking_flow',
    description:'Trigger social content generation for an already-recorded booking. Generates a guest thank-you + excitement post for their destination.',
    inputSchema:{ type:'object', properties:{ bookingId:{type:'string'} }, required:['bookingId'] } },
  { name:'list_booking_events',
    description:'List recent bookings with guest details, destination, travel date, and whether post-booking content was triggered.',
    inputSchema:{ type:'object', properties:{ limit:{type:'number'} } } },


  // ── ORCHESTRATOR / DELEGATION TOOLS ─────────────────────────────────────────
  { name:'smart_generate',
    description:'MASTER TOOL: Parse any natural language prompt and execute the full post generation pipeline automatically. Detects platform (whatsapp/instagram/tiktok), destination, theme, media type. Routes to correct pipeline, generates real image/video files, delivers to /outputs/<platform>/. Use for casual prompts like: generate a whatsapp post for today.',
    inputSchema:{ type:'object', properties:{ prompt:{type:'string'}, overridePlatform:{type:'string'}, overrideDestination:{type:'string'}, overrideTheme:{type:'string'} }, required:['prompt'] } },
  { name:'image_metadata',
    description:'Extract full metadata from an image: dimensions, format, file size MB, megapixels, aspect ratio, color space, EXIF/ICC presence.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'} }, required:['filePath'] } },
  { name:'image_smart_crop',
    description:'Entropy-based smart crop. Finds the most visually important region (animal, subject) and crops to exact target dimensions without guessing center.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, targetW:{type:'number'}, targetH:{type:'number'} }, required:['filePath','targetW','targetH'] } },
  { name:'image_compare',
    description:'Side-by-side A/B comparison of two images. Returns 1080x1080 composite for visual QA of two post variants.',
    inputSchema:{ type:'object', properties:{ filePathA:{type:'string'}, filePathB:{type:'string'} }, required:['filePathA','filePathB'] } },
  { name:'image_ocr_prepare',
    description:'Pre-process image for OCR text extraction: greyscale + normalise + sharpen + threshold. Returns ready file + tesseract command.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'} }, required:['filePath'] } },
  { name:'image_analyze_colors',
    description:'Analyse dominant color, brightness, mood of an image. Returns recommended text color and overlay opacity for brand overlays.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'} }, required:['filePath'] } },
  { name:'image_export_platform',
    description:'Export an image resized and optimised for a specific social platform: whatsapp, instagram_post, instagram_story, instagram_portrait, facebook, twitter_card, tiktok_thumb, youtube_thumb, telegram.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, platform:{type:'string'} }, required:['filePath','platform'] } },
  { name:'image_build_collage',
    description:'Build a 2x2 grid collage from 2 to 4 images. Returns a single 1080x1080 branded JPEG composite.',
    inputSchema:{ type:'object', properties:{ filePaths:{type:'array', items:{type:'string'}} }, required:['filePaths'] } },
  { name:'video_probe',
    description:'Probe a video file: duration, resolution, fps, codec, audio presence, file size, aspect ratio.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'} }, required:['filePath'] } },
  { name:'video_clip',
    description:'Trim a video: extract a segment starting at startSec for durationSec seconds. Returns new file.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, startSec:{type:'number'}, durationSec:{type:'number'} }, required:['filePath','startSec','durationSec'] } },
  { name:'video_encode_platform',
    description:'Encode a video for a specific platform with correct resolution, fps, bitrate, max duration: instagram_reel, tiktok, facebook, twitter, whatsapp, youtube_short.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, platform:{type:'string'}, startSec:{type:'number'}, maxSeconds:{type:'number'} }, required:['filePath','platform'] } },
  { name:'video_add_watermark',
    description:'Burn Lavira brand watermark (name, phone, website, destination) directly into video using ffmpeg drawtext. Returns new branded MP4.',
    inputSchema:{ type:'object', properties:{ filePath:{type:'string'}, destination:{type:'string'} }, required:['filePath'] } },
  { name:'video_to_reel',
    description:'Convert a static image into an animated video reel with Ken Burns zoom effect (15s default). Perfect for WhatsApp/Instagram stories from a single photo.',
    inputSchema:{ type:'object', properties:{ imagePath:{type:'string'}, durationSec:{type:'number'}, platform:{type:'string', enum:['instagram_reel','instagram_story','tiktok','youtube_short']} }, required:['imagePath'] } },
  { name:'full_video_post_pipeline',
    description:'MASTER VIDEO TOOL: search Pexels → download → probe → clip → encode for platform → burn Lavira logo watermark → auto-save to posts/<platform>/. Runs the COMPLETE 7-step pipeline. Always use this instead of calling individual video tools manually.',
    inputSchema:{ type:'object', properties:{
      query:       { type:'string', description:'Search query, e.g. "Masai Mara wildebeest migration"' },
      destination: { type:'string', description:'Lavira destination name, used in filename and watermark' },
      platform:    { type:'string', enum:['tiktok','instagram','facebook','whatsapp'], description:'Target platform' },
      durationSec: { type:'number', description:'Target video length in seconds (default 30)' },
    }, required:[] } },
  { name:'video_search_stock',
    description:'Search Pexels for portrait-oriented safari stock videos by keyword. Returns video download URLs, duration, resolution, photographer.',
    inputSchema:{ type:'object', properties:{ query:{type:'string'}, limit:{type:'number'} }, required:['query'] } },
  { name:'get_user_memory',
    description:'Read the Lavira user memory and productivity profile. Shows standing preferences, platform status, smart prompts, content calendar, and known issues.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'update_user_memory',
    description:'Append or replace a section in the LAVIRA_USER_MEMORY.md file. Use to update known issues, content calendar, session notes, or standing preferences.',
    inputSchema:{ type:'object', properties:{ section:{type:'string', description:'Section header to update (e.g. KNOWN ISSUES, CONTENT CALENDAR, STANDING PREFERENCES)'}, content:{type:'string', description:'New markdown content for the section'}, mode:{type:'string', enum:['append','replace'], description:'append adds below existing, replace overwrites section'} }, required:['content'] } },
  { name:'cleanup_old_outputs',
    description:'Delete output files older than N days to free disk space. Skips files referenced in approved jobs. Returns list of deleted files.',
    inputSchema:{ type:'object', properties:{ olderThanDays:{type:'number', description:'Delete files older than this many days (default: 14)'}, dryRun:{type:'boolean', description:'If true, list files to delete without actually deleting'} } } },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────
async function handleTool(name, args) {
  const { v4: uuid } = require('uuid');

  // ── Resolve relative filePaths / mediaPaths against UPLOADS_DIR or engine root ──
  const ENGINE_ROOT = path.join(__dirname, '..', '..');
  function resolveMediaPath(fp) {
    if (!fp || path.isAbsolute(fp)) return fp;
    const fromUploads = path.join(cfg.UPLOADS_DIR, path.basename(fp));
    if (fs.existsSync(fromUploads)) return fromUploads;
    // Bug2 fix: also check OUTPUTS_DIR (engine-generated files)
    const fromOutputs = path.join(cfg.OUTPUTS_DIR, path.basename(fp));
    if (fs.existsSync(fromOutputs)) return fromOutputs;
    const fromRoot = path.join(ENGINE_ROOT, fp);
    if (fs.existsSync(fromRoot)) return fromRoot;
    return fp; // fall-through – let caller throw the proper error
  }
  if (args.filePath)  args = { ...args, filePath:  resolveMediaPath(args.filePath)  };
  if (args.mediaPath) args = { ...args, mediaPath: resolveMediaPath(args.mediaPath) };

  switch (name) {

    case 'process_video': {
      if (!fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
      const dest = args.destination || lruDestination();
      const platform = args.platform || 'instagram_reel';
      const opts = { trimStart:args.trimStart||0, trimDuration:args.trimDuration||null, speed:args.speed||1, quality:args.quality||'high', duration:args.duration };
      const jobId = 'vid_' + uuid().slice(0,8);
      const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
      const promo = await generatePromoPackage({ destination:dest, mediaType:'video', context:args.context||'', recentCaptions:[] });
      fs.writeFileSync(stateFile, JSON.stringify({ status:'processing', jobId, mediaType:'video', destination:dest, platform, promo }));
      log.insert({ jobId, mediaType:'video', destination:dest, platform, caption:promo.caption });
      videoEng.processVariant(args.filePath, platform, opts).then(async (result) => {
        let thumb = null; try { thumb = await videoEng.extractThumbnail(args.filePath); } catch {}
        const s = { status:'done', jobId, mediaType:'video', destination:dest, promo,
          result: {...result, downloadUrl:`/outputs/${result.filename}`},
          thumbnail: thumb ? `/outputs/${path.basename(thumb)}` : null };
        log.update(jobId, { status:'done', outputs:JSON.stringify([result.filename]) });
        fs.writeFileSync(stateFile, JSON.stringify(s));
      }).catch(e => fs.writeFileSync(stateFile, JSON.stringify({ status:'error', jobId, error:e.message })));
      return { jobId, status:'processing', destination:dest, platform, promo, poll:`GET /api/job/${jobId}`, tip:`Call get_job_status with jobId="${jobId}" until done, then build_post_package` };
    }

    case 'process_image': {
      if (!fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
      const dest = args.destination || lruDestination();
      const profiles = args.profiles || ['instagram_post','instagram_story'];
      const promo = await generatePromoPackage({ destination:dest, mediaType:'photo', context:'', recentCaptions:[] });
      const { results, errors } = await imageEng.processImage(args.filePath, profiles, {
        fit: args.fit || 'contain', edits: args.edits || {}, watermark: args.watermark !== false,
        brandTint: args.brandTint === true, destination: dest
      });
      const jobId = 'img_' + uuid().slice(0,8);
      log.insert({ jobId, mediaType:'photo', destination:dest, platforms:profiles, caption:promo.caption });
      const s = { status:'done', jobId, mediaType:'photo', destination:dest, promo, results, errors };
      fs.writeFileSync(path.join(cfg.OUTPUTS_DIR, `${jobId}.json`), JSON.stringify(s));
      return { jobId, status:'done', destination:dest, promo, results, errors, tip:`Call build_post_package with jobId="${jobId}" for ready-to-post output` };
    }

    case 'process_audio': {
      if (!fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
      const dest = args.destination || lruDestination();
      const promo = await generatePromoPackage({ destination:dest, mediaType:'audio', context:'', recentCaptions:[] });
      const profiles = args.profiles || ['instagram_story','tiktok_audio','podcast_promo'];
      const { results, errors } = await audioEng.processAudio(args.filePath, profiles, {
        trimStart: args.trimStart || 0, preset: args.preset || null
      });
      const jobId = 'aud_' + uuid().slice(0,8);
      log.insert({ jobId, mediaType:'audio', destination:dest, platforms:profiles, caption:promo.caption });
      const s = { status:'done', jobId, mediaType:'audio', destination:dest, promo, results, errors };
      fs.writeFileSync(path.join(cfg.OUTPUTS_DIR, `${jobId}.json`), JSON.stringify(s));
      return { jobId, status:'done', destination:dest, promo, results, errors };
    }

    case 'search_giphy': {
      const dest = args.destination || BRAND.destinations[0];
      const query = args.query || (dest + ' safari wildlife');
      const suggestions = giphyEng.suggestQueries(dest);
      if (!cfg.GIPHY_KEY) return { error:'GIPHY_API_KEY not set in .env', suggestions, tip:'Add GIPHY_API_KEY to /home/kamau/lavira-media-engine/.env then restart server' };
      const results = await giphyEng.searchGiphy(query, args.limit || 6);
      return { ...results, suggestions, query, tip:'Use use_giphy with a giphyId from results' };
    }

    case 'use_giphy': {
      if (!cfg.GIPHY_KEY) throw new Error('GIPHY_API_KEY not configured. Add to .env file.');
      const dest = args.destination || lruDestination();
      const promo = await generatePromoPackage({ destination:dest, mediaType:'giphy', context:args.context||'', recentCaptions:[] });
      const fileInfo = await giphyEng.fetchGiphy(args.giphyId, 'mp4');
      const jobId = 'gif_' + uuid().slice(0,8);
      log.insert({ jobId, mediaType:'giphy', destination:dest, platforms:['instagram','twitter'], caption:promo.caption });
      return { jobId, status:'done', destination:dest, promo, result:{ ...fileInfo, downloadUrl:`/outputs/${fileInfo.filename}` } };
    }

    case 'generate_auto_promo': {
      const dest = args.destination || lruDestination();
      const profiles = args.profiles || ['instagram_post','instagram_story','facebook_feed'];
      let result;
      try {
        result = await promoEng.generateAutoPromo({ destination:dest, theme:args.theme, context:args.context, profiles });
      } catch(promoErr) {
        process.stderr.write(`[generate_auto_promo] ERROR for ${dest}: ${promoErr.message}\n${promoErr.stack}\n`);
        return { error: promoErr.message, destination: dest, tip: 'Check server logs for stack trace. Common causes: Pexels network timeout, Sharp processing failure.' };
      }
      const jobId = 'auto_' + uuid().slice(0,8);
      // Collect successfully generated output filenames
      const outputFiles = (result.results || []).map(r => r.filename).filter(Boolean);
      log.insert({
        jobId,
        mediaType: 'auto',
        destination: dest,
        platforms: profiles,
        caption: result.promo?.caption || '',
        status: 'done',
        outputs: outputFiles
      });
      // outputs already persisted via log.insert above (JSON.stringify done inside insert)
      const s = { status:'done', jobId, mediaType:'auto', destination:dest, ...result };
      fs.writeFileSync(path.join(cfg.OUTPUTS_DIR, `${jobId}.json`), JSON.stringify(s));
      return { jobId, ...result, outputFiles, tip:`Call build_post_package with jobId="${jobId}" to add overlay` };
    }

    case 'search_stock_images': {
      const query = args.query;
      const limit = args.limit || 5;
      if (!process.env.PEXELS_API_KEY && !cfg.PEXELS_KEY) return { error:'PEXELS_API_KEY not set in .env', tip:'Add PEXELS_API_KEY to /home/kamau/lavira-media-engine/.env then restart server' };
      const { photos } = await promoEng.searchPexels(query, limit);
      const results = photos.map(p => ({ id: p.id, url: p.src.medium, width: p.width, height: p.height, photographer: p.photographer }));
      return { query, results, tip:'Use generate_auto_promo with destination to create branded post from one of these images' };
    }

    case 'ask_claude': {
      const { Anthropic } = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: cfg.ANTHROPIC_KEY });
      const systemPrompt = `You are an expert assistant for Lavira Safaris media engine. ${args.context || 'Provide helpful, accurate responses.'}`;
      try {
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: args.prompt }]
        });
        return { response: response.content[0].text };
      } catch (e) {
        // Bug3 fix: surface credit/auth errors clearly instead of silent crash
        const isCredits = e.message && e.message.includes('credit balance');
        const isAuth    = e.status === 401;
        if (isCredits) return { error: 'Anthropic API credits depleted. Top up at console.anthropic.com/settings/billing', status: 'no_credits' };
        if (isAuth)    return { error: 'ANTHROPIC_API_KEY invalid or expired. Update in .env', status: 'auth_error' };
        throw e;
      }
    }

    case 'generate_promo_package': {
      const dest = args.destination || lruDestination();
      return await generatePromoPackage({ destination:dest, mediaType:args.mediaType||'video', context:args.context||'', recentCaptions:[] });
    }

    case 'get_destinations_to_feature': {
      const unused = log.getUnusedDestinations(BRAND.destinations);
      const recent = log.getRecent(10);
      return {
        recommended: unused[0] || BRAND.destinations[0],
        priorityList: unused.slice(0,5),
        recentlyUsed: recent.map(r=>r.destination).filter((v,i,a)=>a.indexOf(v)===i).slice(0,5),
        allDestinations: BRAND.destinations
      };
    }

    case 'get_safari_packages': {
      let packages = BRAND.safari_packages || [];
      if (args.destination) packages = packages.filter(p => p.destinations?.includes(args.destination));
      return { packages, total: packages.length };
    }

    case 'make_ready_to_post': {
      if (!fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
      const opts = { promoType:args.promoType||'', destination:args.destination||'', hook:args.hook||'',
                     dateStr:args.dateStr || new Date().toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'}),
                     layout:args.layout||'standard', email:BRAND.email, instagram:BRAND.socials?.instagram };
      const ext = path.extname(args.filePath).toLowerCase();
      if (['.jpg','.jpeg','.png','.webp'].includes(ext)) return await comp.compositeImage(args.filePath, opts);
      if (ext === '.mp4') return await comp.compositeVideo(args.filePath, opts);
      throw new Error('Unsupported file type for overlay: ' + ext);
    }

    case 'build_post_package': {
      const stateFile = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(stateFile)) throw new Error('Job not found: ' + args.jobId);
      const result = await comp.buildReadyToPostPackage(stateFile, { promoType:args.promoType||'' });
      return { ...result, jobId:args.jobId, tip:'postReady files are ready-to-post — download and share directly' };
    }

    case 'mix_audio_with_media': {
      const mixer = require('../engines/media-mixer');
      if (!fs.existsSync(args.mediaPath)) throw new Error('Media not found: ' + args.mediaPath);
      if (!fs.existsSync(args.audioPath)) throw new Error('Audio not found: ' + args.audioPath);
      return await mixer.mixAudioWithMedia({ mediaPath: args.mediaPath, audioPath: args.audioPath, durationSeconds: args.durationSeconds });
    }

    case 'get_job_status': {
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found: ' + args.jobId);
      return JSON.parse(fs.readFileSync(f,'utf8'));
    }

    case 'approve_job': {
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found');
      const s = JSON.parse(fs.readFileSync(f,'utf8'));
      s.approved = true; s.approvedAt = new Date().toISOString(); s.status = 'approved';
      fs.writeFileSync(f, JSON.stringify(s)); log.approve(args.jobId);
      return { success:true, jobId:args.jobId, status:'approved' };
    }

    case 'reject_job': {
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found');
      const s = JSON.parse(fs.readFileSync(f,'utf8'));
      s.status = 'rejected'; s.rejectedAt = new Date().toISOString(); s.rejectNote = args.note || '';
      fs.writeFileSync(f, JSON.stringify(s)); log.update(args.jobId, { status:'rejected' });
      return { success:true, jobId:args.jobId, status:'rejected' };
    }

    case 'get_share_package': {
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found');
      const s = JSON.parse(fs.readFileSync(f,'utf8'));
      return { caption:s.promo?.caption||'', hook:s.promo?.hook||'', hashtags:s.promo?.hashtags||[],
               ctaBlock:s.promo?.ctaBlock||'', destination:s.destination||'', mediaType:s.mediaType||'',
               relatedPackage:s.promo?.relatedPackage||null, files:(s.results||[]).map(r=>({ label:r.label,url:r.downloadUrl||`/outputs/${r.filename}`,filename:r.filename })) };
    }

    case 'list_recent_jobs': {
      let rows = log.getRecent(args.limit || 20);
      if (args.status && args.status !== 'all') rows = rows.filter(r => r.status === args.status);
      return rows;
    }

    case 'list_output_files': {
      const typeFilter = { all:/\.(mp4|gif|jpg|jpeg|png|mp3|ogg)$/i, video:/\.mp4$/i, image:/\.(jpg|jpeg|png)$/i, audio:/\.(mp3|ogg)$/i, post_ready:/lavira_post_/i };
      const re = typeFilter[args.type || 'all'];
      return fs.readdirSync(cfg.OUTPUTS_DIR).filter(f=>re.test(f)).map(f=>{
        const s = fs.statSync(path.join(cfg.OUTPUTS_DIR,f));
        return { filename:f, url:`/outputs/${f}`, sizeMB:(s.size/1024/1024).toFixed(2), created:s.mtime };
      }).sort((a,b)=>new Date(b.created)-new Date(a.created));
    }

    case 'delete_output_file': {
      const fp = path.join(cfg.OUTPUTS_DIR, path.basename(args.filename));
      if (!fs.existsSync(fp)) throw new Error('File not found');
      fs.unlinkSync(fp);
      return { success:true, deleted:args.filename };
    }

    case 'get_brand_info':
      return BRAND;

    case 'get_admin_settings': {
      const settings = require('../orchestrator/settings');
      return settings.readSettings();
    }

    case 'update_admin_settings': {
      const settings = require('../orchestrator/settings');
      return settings.writeSettings(args.patch || {}, 'user');
    }

    case 'get_api_status': {
      // Bug3 fix: do a live micro-probe to detect credit depletion vs key-present
      let aiStatus = '✗ MISSING — set ANTHROPIC_API_KEY in .env';
      if (cfg.ANTHROPIC_KEY) {
        try {
          const { Anthropic: _A } = require('@anthropic-ai/sdk');
          await new _A({ apiKey: cfg.ANTHROPIC_KEY }).messages.create({
            model:'claude-haiku-4-5-20251001', max_tokens:1,
            messages:[{role:'user',content:'ping'}]
          });
          aiStatus = '✓ key valid + credits OK';
        } catch(e) {
          if (e.message && e.message.includes('credit balance'))
            aiStatus = '⚠ KEY VALID but CREDITS DEPLETED — top up at console.anthropic.com/settings/billing';
          else if (e.status === 401)
            aiStatus = '✗ KEY INVALID or EXPIRED — replace in .env';
          else
            aiStatus = `⚠ key present, probe error: ${e.message}`;
        }
      }
      return {
        claude_ai:  { configured: !!cfg.ANTHROPIC_KEY, required_for:'AI captions + hooks', env_key:'ANTHROPIC_API_KEY', status: aiStatus },
        giphy:      { configured: !!cfg.GIPHY_KEY,     required_for:'GIF search',           env_key:'GIPHY_API_KEY',    status: cfg.GIPHY_KEY ? '✓ key present' : '✗ MISSING' },
        pexels:     { configured: !!process.env.PEXELS_API_KEY, required_for:'Stock images', env_key:'PEXELS_API_KEY', status: process.env.PEXELS_API_KEY ? '✓ key present' : '✗ MISSING — free at pexels.com/api' },
        instagram:  { configured: !!process.env.INSTAGRAM_ACCESS_TOKEN, required_for:'Auto-post to Instagram', env_key:'INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID', status:'✗ Not configured — requires Meta Business App' },
        tiktok:     { configured: !!process.env.TIKTOK_ACCESS_TOKEN, required_for:'Auto-post to TikTok', env_key:'TIKTOK_ACCESS_TOKEN', status:'✗ Not configured' },
        ffmpeg:     { configured: true, required_for:'Video + audio processing', status:'✓ /usr/bin/ffmpeg' },
        tip:        'Edit /home/kamau/lavira-media-engine/.env then restart: tmux send-keys -t lavira "npm start" Enter'
      };
    }

    case 'get_daily_schedule':
      try { return require('../scheduler').getSchedule(); } catch { return { entries:[] }; }

    case 'trigger_daily_promo':
      return await require('../scheduler').generateDailyPromo();

    case 'get_engine_health': {
      const ffmpegOk = (() => { try { require('child_process').execSync('ffmpeg -version 2>/dev/null'); return true; } catch { return false; } })();
      const outputs = fs.readdirSync(cfg.OUTPUTS_DIR);
      const mediaFiles = outputs.filter(f=>/\.(mp4|jpg|mp3|gif)$/i.test(f)).length;
      const diskUsage = outputs.reduce((acc,f)=>{ try { return acc+fs.statSync(path.join(cfg.OUTPUTS_DIR,f)).size; } catch { return acc; } },0);
      return { status:'ok', version:'3.0', ffmpeg:ffmpegOk, aiConfigured:!!cfg.ANTHROPIC_KEY, giphyConfigured:!!cfg.GIPHY_KEY, pexelsConfigured:!!process.env.PEXELS_API_KEY, outputFiles:mediaFiles, diskUsageMB:(diskUsage/1024/1024).toFixed(1), brand:BRAND.name, destinations:BRAND.destinations.length, packages:BRAND.safari_packages?.length||0 };
    }

    case 'list_upload_files':
      return fs.readdirSync(cfg.UPLOADS_DIR).map(f=>{ const s=fs.statSync(path.join(cfg.UPLOADS_DIR,f)); return { filename:f, sizeMB:(s.size/1024/1024).toFixed(2), created:s.mtime }; });

    // DIRECT POSTING / PUBLISHING
    case 'post_to_instagram': {
      const pub = require('../publishing/index');
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found: ' + args.jobId);
      const state = JSON.parse(fs.readFileSync(f,'utf8'));
      const caption = args.caption || state.promo?.caption || '';
      const result = await pub.publishInstagram({ videoPath: path.join(cfg.OUTPUTS_DIR, (state.results?.[0])?.filename || ''), caption });
      return { jobId:args.jobId, platform:'instagram', ...result, statusUrl:`/api/job/${args.jobId}` };
    }

    case 'post_to_tiktok': {
      const pub = require('../publishing/index');
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found: ' + args.jobId);
      const state = JSON.parse(fs.readFileSync(f,'utf8'));
      const caption = args.caption || state.promo?.caption || '';
      const result = await pub.publishTikTok({ videoPath: path.join(cfg.OUTPUTS_DIR, (state.results?.[0])?.filename || ''), caption });
      return { jobId:args.jobId, platform:'tiktok', ...result, statusUrl:`/api/job/${args.jobId}` };
    }

    case 'post_to_facebook': {
      const pub = require('../publishing/index');
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found: ' + args.jobId);
      const state = JSON.parse(fs.readFileSync(f,'utf8'));
      const caption = args.caption || state.promo?.caption || '';
      const result = await pub.publishFacebook({ videoPath: path.join(cfg.OUTPUTS_DIR, (state.results?.[0])?.filename || ''), caption });
      return { jobId:args.jobId, platform:'facebook', ...result, statusUrl:`/api/job/${args.jobId}` };
    }

    case 'publish_job': {
      const pub = require('../publishing/index');
      const platforms = args.platforms || ['instagram','tiktok','facebook'];
      const result = await pub.publishJob(args.jobId, platforms);
      return result;
    }

    // CARD TEMPLATES & OVERLAYS
    case 'generate_card_template': {
      const cards = require('../engines/card-templates');
      const template = args.template || 'hero_destination';
      const dest = args.destination || lruDestination();
      // Build rich defaults from brand.js, then merge caller overrides
      const defaultData = cards.buildDefaultData(dest, template);
      const data = { ...defaultData, ...(args.data||{}) };
      const profile = args.profile || 'instagram_post';
      const fetchBg = args.fetchBackground !== false; // default true
      // Fetch background image from Pexels/cache if requested
      let bgImage = null;
      if (fetchBg) {
        try {
          const extMedia = require('../engines/external-media');
          const mediaRes = await extMedia.fetchOptimalMedia('', { type:'image', destination:dest, theme:template });
          if (mediaRes && mediaRes.results && mediaRes.results.length > 0) {
            const dl = await extMedia.downloadAndCacheMedia(mediaRes.results[0], 'image');
            if (dl && dl.filepath && fs.existsSync(dl.filepath)) bgImage = dl.filepath;
          }
        } catch(bgErr) { /* fallback to dark bg */ }
      }
      // Also check if data includes a backgroundImage path
      if (!bgImage && data.backgroundImage && fs.existsSync(data.backgroundImage)) bgImage = data.backgroundImage;
      const result = await cards.renderCard({ template, data, backgroundImage:bgImage, profile });
      // Log to memory
      try { log.insert({ jobId:result.filename, mediaType:'card', destination:dest, caption:data.hook||data.caption||'', platforms:[profile] }); } catch {}
      const visionSummary = result.imageAnalysis ? { vision: result.imageAnalysis } : {};
      return { ...result, ...visionSummary, tip:'File available at /outputs/'+result.filename+' and via UI gallery' };
    }

    case 'generate_all_cards': {
      const cards = require('../engines/card-templates');
      const dest = args.destination || lruDestination();
      const profile = args.profile || 'instagram_post';
      const single = args.singlePost !== false; // default: single post per session
      const TEMPLATES = ['hero_destination','safari_package','testimonial','wildlife_spotlight','dual_destination','activity','story','stats','itinerary','offer'];
      if (single) {
        // Rotate through templates using LRU: check last used in recent jobs
        const recent = log.getRecent(8);
        const usedTemplates = recent.map(r=>r.meta?.cardTemplate).filter(Boolean);
        const next = TEMPLATES.find(t=>!usedTemplates.includes(t)) || TEMPLATES[0];
        const data = cards.buildDefaultData(dest, next);
        let bgImgS = null;
        try {
          const extMedia = require('../engines/external-media');
          const mResS = await extMedia.fetchOptimalMedia('',{type:'image',destination:dest,theme:next});
          if(mResS&&mResS.results&&mResS.results.length>0){
            const dlS=await extMedia.downloadAndCacheMedia(mResS.results[0],'image');
            if(dlS&&dlS.filepath&&fs.existsSync(dlS.filepath)) bgImgS=dlS.filepath;
          }
        } catch(e){}
        const result = await cards.renderCard({ template:next, data, backgroundImage:bgImgS, profile });
        try { log.insert({ jobId:result.filename, mediaType:'card', destination:dest, caption:data.hook||'', platforms:[profile], meta:{ cardTemplate:next } }); } catch {}
        const visionS = result.imageAnalysis ? { vision: result.imageAnalysis } : {};
        return { ...result, ...visionS, template:next, tip:'Single post generated. Call again for next template in rotation.' };
      }
      // Generate all 10
      const results = [];
      for (const t of TEMPLATES) {
        try {
          const data = cards.buildDefaultData(dest, t);
          let bgImg = null;
          try {
            const extMedia = require('../engines/external-media');
            const mRes = await extMedia.fetchOptimalMedia('',{type:'image',destination:dest,theme:t});
            if (mRes&&mRes.results&&mRes.results.length>0){
              const dl=await extMedia.downloadAndCacheMedia(mRes.results[0],'image');
              if(dl&&dl.filepath&&fs.existsSync(dl.filepath)) bgImg=dl.filepath;
            }
          } catch(e){}
          const r = await cards.renderCard({ template:t, data, backgroundImage:bgImg, profile });
          results.push({ ...r, template:t });
        } catch(e) { results.push({ template:t, error:e.message }); }
      }
      return { destination:dest, profile, cards:results, total:results.filter(r=>!r.error).length };
    }

    case 'apply_overlay': {
      if (!fs.existsSync(args.filePath)) throw new Error('File not found: ' + args.filePath);
      const opts = { destination:args.destination||'', hook:args.hook||'', promoType:args.promoType||'', layout:args.layout||'standard' };
      const ext = path.extname(args.filePath).toLowerCase();
      if (['.jpg','.jpeg','.png','.webp'].includes(ext)) return await comp.compositeImage(args.filePath, opts);
      if (ext === '.mp4') return await comp.compositeVideo(args.filePath, opts);
      throw new Error('Unsupported file type: ' + ext);
    }

    // SAMPLE MEDIA LIBRARY
    case 'list_sample_media': {
      const mediaLib = require('../engines/media-library');
      return mediaLib.listSampleMedia({ type:args.type||'all', destination:args.destination });
    }

    case 'get_sample_media': {
      const mediaLib = require('../engines/media-library');
      const dest = args.destination || lruDestination();
      if (args.random) {
        const sample = mediaLib.getRandomSample(dest, args.type || 'image');
        return sample ? [sample] : [];
      }
      return mediaLib.getSamplesByDestination(args.type || 'image', dest);
    }

    case 'process_sample_as_test': {
      const mediaLib = require('../engines/media-library');
      const dest = args.destination || lruDestination();
      const sample = mediaLib.getRandomSample(dest, args.mediaType || 'image');
      if (!sample) throw new Error('No samples found for destination: ' + dest);
      if (args.mediaType === 'image') {
        return await handleTool('process_image', { filePath: sample.localPath, destination: dest, profiles: args.platforms || ['instagram_post','instagram_story'] });
      } else {
        return await handleTool('process_video', { filePath: sample.localPath, destination: dest, platform: args.platforms?.[0] || 'instagram_reel' });
      }
    }

    // BATCH OPERATIONS
    case 'batch_process_samples': {
      const mediaLib = require('../engines/media-library');
      const dest = args.destination || lruDestination();
      const samples = mediaLib.getSamplesByDestination(args.mediaType || 'image', dest).slice(0, args.limit || 5);
      const jobIds = [];
      for (const sample of samples) {
        try {
          const result = args.mediaType === 'image'
            ? await handleTool('process_image', { filePath: sample.localPath, destination: dest })
            : await handleTool('process_video', { filePath: sample.localPath, destination: dest });
          jobIds.push(result.jobId);
        } catch(e) { console.error('Batch error:', e); }
      }
      return { destination: dest, processed: jobIds.length, jobIds, total: samples.length };
    }

    case 'schedule_post': {
      const f = path.join(cfg.OUTPUTS_DIR, `${args.jobId}.json`);
      if (!fs.existsSync(f)) throw new Error('Job not found');
      const s = JSON.parse(fs.readFileSync(f,'utf8'));
      s.scheduledTime = args.scheduledTime;
      s.scheduledPlatforms = args.platforms || [];
      fs.writeFileSync(f, JSON.stringify(s));
      return { success: true, jobId: args.jobId, scheduledTime: args.scheduledTime, platforms: args.platforms };
    }

    // DYNAMIC TEMPLATES & MEDIA AUGMENTATION
    case 'generate_branded_media': {
      const mediaAug = require('../engines/media-augmentation');
      const dynamicTemp = require('../engines/dynamic-templates');

      if (!fs.existsSync(args.mediaPath)) throw new Error('Media file not found: ' + args.mediaPath);

      // Analyze content for theme
      const theme = await mediaAug.analyzeContentForTheme({
        animal: args.animal,
        destination: args.destination,
        mood: args.theme,
        context: args.context
      });

      // Generate marketing payload
      const marketing = mediaAug.generateMarketingPayload(theme, args.destination, args.context);

      // Apply enhancements
      const ext = path.extname(args.mediaPath).toLowerCase();
      let enhancedBuffer;

      if (['.mp4', '.mov', '.avi'].includes(ext)) {
        // Video enhancements
        const outputPath = path.join(cfg.OUTPUTS_DIR, `branded_${uuid().slice(0,8)}.mp4`);
        const result = await mediaAug.enhanceVideo(args.mediaPath, args.enhancements || {});
        enhancedBuffer = fs.readFileSync(result.file);
        fs.unlinkSync(result.file); // Clean up temp file
      } else {
        // Image enhancements and dynamic text
        enhancedBuffer = await mediaAug.renderDynamicText(args.mediaPath, {
          primary: marketing.tagline,
          secondary: args.context,
          theme: theme
        });
        if (args.enhancements) {
          enhancedBuffer = await mediaAug.enhanceImage(enhancedBuffer, args.enhancements);
        }
      }

      // Save final result
      const finalPath = path.join(cfg.OUTPUTS_DIR, `branded_${theme}_${uuid().slice(0,8)}${ext}`);
      fs.writeFileSync(finalPath, enhancedBuffer);

      return {
        file: finalPath,
        filename: path.basename(finalPath),
        theme,
        marketing,
        enhancements: args.enhancements,
        downloadUrl: `/outputs/${path.basename(finalPath)}`
      };
    }

    case 'generate_overlay_plan': {
      const mediaAug = require('../engines/media-augmentation');
      const analysis = await mediaAug.detectSubjectArea(args.mediaPath);
      const layout = {
        contentType: args.contentType,
        destination: args.destination,
        subjectArea: analysis,
        safeZones: [
          { name: 'top_center', x: 0.5, y: 0.2, anchor: 'middle' },
          { name: 'bottom_center', x: 0.5, y: 0.8, anchor: 'middle' },
          { name: 'left_center', x: 0.15, y: 0.5, anchor: 'start' },
          { name: 'right_center', x: 0.85, y: 0.5, anchor: 'end' }
        ]
      };
      return layout;
    }

    case 'generate_marketing_payload': {
      const mediaAug = require('../engines/media-augmentation');
      const theme = args.theme || 'default';
      return mediaAug.generateMarketingPayload(theme, args.destination, args.context);
    }

    // EXTERNAL MEDIA SOURCING
    case 'search_external_media': {
      const extMedia = require('../engines/external-media');
      const results = await extMedia.fetchOptimalMedia(args.query || '', {
        type: args.type || 'image',
        destination: args.destination,
        theme: args.theme,
        maxResults: args.limit || 5
      });
      return results;
    }

    case 'fetch_optimal_media': {
      const extMedia = require('../engines/external-media');
      const results = await extMedia.fetchOptimalMedia('', {
        type: args.type || 'image',
        destination: args.destination,
        theme: args.theme,
        context: args.context
      });

      if (results.results.length > 0) {
        const best = results.results[0];
        const downloaded = await extMedia.downloadAndCacheMedia(best, args.type);
        return {
          ...results,
          downloaded: downloaded,
          bestMatch: {
            ...best,
            localPath: downloaded.filepath,
            filename: downloaded.filename
          }
        };
      }

      return results;
    }

    // CREATIVE INTELLIGENCE
    case 'analyze_content_theme': {
      const mediaAug = require('../engines/media-augmentation');
      return {
        theme: mediaAug.analyzeContentForTheme(args),
        suggestions: mediaAug.CREATIVE_THEMES
      };
    }

    // HIGH-IMPACT WORKFLOW TOOLS
    case 'create_post_workflow': {
      const dest = args.destination || lruDestination();
      const theme = args.theme || 'wildlife_spotlight';
      const mediaType = args.mediaType || 'image';
      const context = args.context || `${theme} post for ${dest}`;

      // Goal: always produce real files in outputs/ + a job state JSON.
      const { v4: uuid } = require('uuid');
      const jobId = 'wf_' + uuid().slice(0, 8);
      const stateFile = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);
      fs.writeFileSync(stateFile, JSON.stringify({ status: 'processing', jobId, mediaType: 'workflow', destination: dest, theme }));

      let state;

      if (mediaType === 'image') {
        // Use proven auto-promo pipeline (real stock → branded outputs + caption)
        const promoEngine = require('../engines/promo');
        const profiles = ['instagram_post', 'instagram_story', 'facebook_feed'];
        const result = await promoEngine.generateAutoPromo({ destination: dest, theme, context, profiles });
        state = { status: 'done', jobId, mediaType: 'auto', destination: dest, theme, ...result };
        fs.writeFileSync(stateFile, JSON.stringify(state));
        try {
          log.insert({
            jobId,
            mediaType: 'auto',
            destination: dest,
            theme,
            platforms: profiles,
            caption: result.promo?.caption || '',
            status: 'done',
            outputs: (result.results || []).map(r => r.filename).filter(Boolean)
          });
        } catch {}
      } else {
        // Video workflow: fetch stock video → process platform variant → caption → ready-to-post package
        const extMedia = require('../engines/external-media');
        const mediaResult = await extMedia.fetchOptimalMedia('', { destination: dest, theme, type: 'video', context, maxResults: 3, preferPortrait: true });
        if (!mediaResult.results.length) throw new Error(`No video found for ${dest}`);
        const downloaded = await extMedia.downloadAndCacheMedia(mediaResult.results[0], 'video');

        const platform = 'instagram_reel';
        const vidJob = await handleTool('process_video', {
          filePath: downloaded.filepath,
          platform,
          destination: dest,
          context
        });
        // process_video is async; poll state file once to build package
        // For MCP UX, we return the jobId to poll.
        return { ...vidJob, workflow: 'create_post_workflow', next: 'Call get_job_status until done, then build_post_package' };
      }

      // Build overlays for everything we produced so outputs are “ready posting”
      const pkg = await comp.buildReadyToPostPackage(stateFile, { promoType: state?.promo?.relatedPackage?.name || '', hook: state?.promo?.hook || '' });
      // Re-read in case buildReadyToPostPackage updates it
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}

      // Update DB with ALL output filenames (raw + overlay/post-ready)
      try {
        const rawOutputs = (result.results || []).map(r => r.filename).filter(Boolean);
        const postReadyOutputs = (pkg.postReady || []).map(r => r.filename || r.file).filter(Boolean).map(f => require('path').basename(f));
        const allOutputs = [...new Set([...rawOutputs, ...postReadyOutputs])];
        log.update(jobId, { outputs: allOutputs });
      } catch(e) { /* non-fatal */ }

      return {
        workflow: 'create_post_workflow',
        jobId,
        destination: dest,
        theme,
        mediaType,
        status: state?.status || 'done',
        promo: state?.promo || {},
        results: state?.results || [],
        postReady: pkg.postReady || [],
        generatedAt: new Date().toISOString(),
        tip: 'All outputs are in /outputs and accessible via /outputs/<filename>'
      };
    }

    case 'generate_video_script': {
      const videoScript = require('../engines/video-script');
      const dest = args.destination || lruDestination();
      const duration = args.duration || 30;
      const script = await videoScript.generateVideoScript({
        destination: dest,
        theme: args.theme || 'wildlife_spotlight',
        duration,
        context: args.context
      });
      return script;
    }


    case 'save_to_posts': {
      const POSTS_DIR = path.join(__dirname, '..', '..', 'posts');
      const platform = args.platform || 'mcp-tasks';
      const destDir = path.join(POSTS_DIR, platform);
      fs.mkdirSync(destDir, { recursive: true });
      const srcFile = path.join(cfg.OUTPUTS_DIR, path.basename(args.filename));
      if (!fs.existsSync(srcFile)) throw new Error('Output file not found: ' + args.filename);
      const label = args.label ? args.label.replace(/[^a-z0-9_-]/gi, '_') + '_' : '';
      const destName = label + path.basename(args.filename);
      const destFile = path.join(destDir, destName);
      fs.copyFileSync(srcFile, destFile);
      return { success: true, savedTo: 'posts/' + platform + '/' + destName, url: '/posts/' + platform + '/' + destName, sizeMB: (fs.statSync(destFile).size / 1024 / 1024).toFixed(2) };
    }

    case 'list_posts': {
      const POSTS_DIR = path.join(__dirname, '..', '..', 'posts');
      const platform = args.platform || 'all';
      const platforms = platform === 'all' ? ['instagram','facebook','tiktok','whatsapp','mcp-tasks','archive'] : [platform];
      const result = {};
      for (const pl of platforms) {
        const d = path.join(POSTS_DIR, pl);
        fs.mkdirSync(d, { recursive: true });
        result[pl] = fs.readdirSync(d).filter(f => /\.(jpg|jpeg|png|mp4|mp3|gif)$/i.test(f)).map(f => { const s = fs.statSync(path.join(d,f)); return { filename: f, url: '/posts/' + pl + '/' + f, sizeMB: (s.size/1024/1024).toFixed(2), created: s.mtime }; }).sort((a,b) => new Date(b.created) - new Date(a.created));
      }
      const total = Object.values(result).reduce((n, arr) => n + arr.length, 0);
      return { platforms: result, total };
    }
    case 'cache_stats': {
      const mediaCache = require('../engines/media-cache');
      return mediaCache.getStats();
    }

    case 'cache_prune': {
      const mediaCache = require('../engines/media-cache');
      const result = mediaCache.prune();
      return {
        status: 'success',
        message: `Pruned ${result.evictedCount} expired entries`,
        ...result
      };
    }

    case 'cache_clear': {
      const mediaCache = require('../engines/media-cache');
      const result = mediaCache.clear();
      return {
        status: 'success',
        message: `Cleared entire cache (${result.clearedCount} entries)`,
        ...result
      };
    }

    // ─── ROTATION & DEDUP ────────────────────────────────────────────────────
    case 'get_destination_rotation_status': {
      // Bug4 fix: return plain object, server serialiser wraps it
      const { rotationStatus } = require('../orchestrator/memory');
      const status = rotationStatus.get(BRAND.destinations);
      return status;
    }

    case 'check_content_duplicate': {
      const { checkDuplicate } = require('../orchestrator/memory');
      const result = checkDuplicate(args.caption, args.destination, args.windowDays || 14);
      return { content:[{ type:'text', text: JSON.stringify(result) }] };
    }

    // ─── BOOKING TRIGGERS ────────────────────────────────────────────────────
    case 'record_booking': {
      const { bookings: bkgs } = require('../orchestrator/memory');
      const bookingId = bkgs.insert({ ...args, source: 'mcp' });
      if (args.autoTriggerContent !== false) {
        // Fire-and-forget via HTTP to reuse the route logic
        const triggerReq = require('http').request({
          hostname: 'localhost', port: cfg.PORT || 3000,
          path: `/api/bookings/${bookingId}/trigger-content`,
          method: 'POST', headers: { 'Content-Type': 'application/json' }
        }, () => {});
        triggerReq.on('error', () => {});
        triggerReq.end();
      }
      return { content:[{ type:'text', text: JSON.stringify({ success:true, bookingId, message:'Booking recorded. Content generation triggered.' }) }] };
    }

    case 'trigger_post_booking_flow': {
      const resp = await new Promise((resolve, reject) => {
        const req2 = require('http').request({
          hostname: 'localhost', port: cfg.PORT || 3000,
          path: `/api/bookings/${args.bookingId}/trigger-content`,
          method: 'POST', headers: { 'Content-Type': 'application/json' }
        }, res2 => {
          let data = '';
          res2.on('data', d => data += d);
          res2.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
        });
        req2.on('error', reject);
        req2.end();
      });
      return { content:[{ type:'text', text: JSON.stringify(resp) }] };
    }

    case 'list_booking_events': {
      const { bookings: bkgs2 } = require('../orchestrator/memory');
      const list = bkgs2.getRecent(args.limit || 20);
      return { content:[{ type:'text', text: JSON.stringify(list, null, 2) }] };
    }


    case 'smart_generate': {
      const parsed = intent.parseIntent(args.prompt || '');
      const dest = args.overrideDestination || parsed.destination || undefined;
      const theme = args.overrideTheme || parsed.theme;
      const platform = args.overridePlatform || parsed.platform;
      const profiles = (intent.PLATFORM_MAP[platform] || intent.PLATFORM_MAP['default']).profiles;
      const mediaType = parsed.mediaType;
      const wfResult = await handleTool('create_post_workflow', {
        destination: dest, theme, mediaType,
        context: platform + ' post for ' + theme,
        profiles,
      });
      const deliveryDir = path.join(cfg.OUTPUTS_DIR, platform);
      fs.mkdirSync(deliveryDir, { recursive: true });
      const delivered = [];
      const jobFiles = (wfResult.results || wfResult.postReady || []);
      for (const r of jobFiles) {
        if (r && r.filename) {
          const srcFile = path.join(cfg.OUTPUTS_DIR, r.filename);
          if (fs.existsSync(srcFile)) {
            const dstFile = path.join(deliveryDir, r.filename);
            fs.copyFileSync(srcFile, dstFile);
            delivered.push({ platform, filename: r.filename, url: '/outputs/' + platform + '/' + r.filename, resolution: r.resolution });
          }
        }
      }
      // AUTO-SAVE to posts/<platform>/ (permanent home)
      const VALID_PLATS = ['instagram','facebook','tiktok','whatsapp','mcp-tasks','archive'];
      const postsPlat = VALID_PLATS.includes(platform) ? platform : 'mcp-tasks';
      const postsPlatDir = require('path').join(__dirname, '..', '..', 'posts', postsPlat);
      fs.mkdirSync(postsPlatDir, { recursive: true });
      const postsDelivered = [];
      for (const r2 of (delivered.length ? delivered : jobFiles)) {
        if (r2 && r2.filename) {
          const srcF2 = require('path').join(cfg.OUTPUTS_DIR, require('path').basename(r2.filename));
          if (fs.existsSync(srcF2)) {
            const dstF2 = require('path').join(postsPlatDir, require('path').basename(r2.filename));
            if (!fs.existsSync(dstF2)) fs.copyFileSync(srcF2, dstF2);
            postsDelivered.push({ filename: require('path').basename(r2.filename), url: '/posts/' + postsPlat + '/' + require('path').basename(r2.filename) });
          }
        }
      }
      return {
        orchestrated: true,
        intent: parsed,
        destination: dest || wfResult.destination,
        theme, platform, mediaType,
        jobId: wfResult.jobId,
        caption: (wfResult.promo || {}).caption || '',
        hook: (wfResult.promo || {}).hook || wfResult.hook || '',
        hashtags: (wfResult.promo || {}).hashtags || [],
        outputs: delivered.length ? delivered : jobFiles,
        posts: postsDelivered,
        message: 'Post generated for ' + platform + '. ' + (delivered.length || jobFiles.length) + ' file(s) ready. Auto-saved to posts/' + postsPlat + '/',
        downloadFirst: postsDelivered.length ? ('/posts/' + postsPlat + '/' + postsDelivered[0].filename) : (delivered.length ? ('/outputs/' + platform + '/' + delivered[0].filename) : null),
      };
    }

    case 'image_metadata': {
      const fp = resolveMediaPath(args.filePath);
      return await imageEnh.extractMetadata(fp);
    }

    case 'image_smart_crop': {
      const fp = resolveMediaPath(args.filePath);
      return await imageEnh.smartCrop(fp, args.targetW, args.targetH);
    }

    case 'image_compare': {
      const fpA = resolveMediaPath(args.filePathA), fpB = resolveMediaPath(args.filePathB);
      return await imageEnh.compareImages(fpA, fpB);
    }

    case 'image_ocr_prepare': {
      const fp = resolveMediaPath(args.filePath);
      return await imageEnh.prepareForOCR(fp);
    }

    case 'image_analyze_colors': {
      const fp = resolveMediaPath(args.filePath);
      return await imageEnh.analyzeColors(fp);
    }

    case 'image_export_platform': {
      const fp = resolveMediaPath(args.filePath);
      return await imageEnh.exportForPlatform(fp, args.platform);
    }

    case 'image_build_collage': {
      const paths2 = (args.filePaths || []).map(resolveMediaPath);
      return await imageEnh.buildCollage(paths2);
    }

    case 'video_probe': {
      const fp = resolveMediaPath(args.filePath);
      return await videoEnh.probeVideo(fp);
    }

    case 'video_clip': {
      const fp = resolveMediaPath(args.filePath);
      return await videoEnh.clipVideo(fp, args.startSec || 0, args.durationSec || 15);
    }

    case 'video_encode_platform': {
      const fp = resolveMediaPath(args.filePath);
      return await videoEnh.encodeForPlatform(fp, args.platform, { startSec: args.startSec, maxSeconds: args.maxSeconds });
    }

    case 'video_add_watermark': {
      const fp = resolveMediaPath(args.filePath);
      return await videoEnh.addBrandWatermark(fp, { destination: args.destination });
    }

    case 'video_to_reel': {
      const fp = resolveMediaPath(args.imagePath);
      return await videoEnh.imageToVideo(fp, args.durationSec || 15, args.platform || 'instagram_reel');
    }

    case 'full_video_post_pipeline': {
      const postsDir = path.join(__dirname, '..', '..', 'posts');
      return await videoEnh.fullVideoPostPipeline({
        query: args.query || args.destination || 'Kenya safari wildlife',
        destination: args.destination || '',
        platform: args.platform || 'tiktok',
        durationSec: args.durationSec || 30,
        postsDir,
      });
    }

    case 'video_search_stock': {
      return await videoEnh.searchPexelsVideo(args.query, args.limit || 5);
    }

    case 'get_user_memory': {
      const memPath = path.join(__dirname, '..', '..', 'LAVIRA_USER_MEMORY.md');
      if (!fs.existsSync(memPath)) return { error: 'Memory doc not found' };
      return { content: fs.readFileSync(memPath, 'utf8'), path: memPath };
    }


    case 'update_user_memory': {
      const _mp = require('path').join(__dirname, '..', '..', 'LAVIRA_USER_MEMORY.md');
      let _mc = fs.existsSync(_mp) ? fs.readFileSync(_mp, 'utf8') : '';
      const _sec = (args.section || '').replace(/^#+\s*/, '').trim();
      const _nc = args.content || '';
      const _mode = args.mode || 'append';
      if (_sec) {
        const _hdr = '## ' + _sec;
        const _idx = _mc.indexOf(_hdr);
        if (_idx !== -1) {
          const _end = _mc.indexOf('\n## ', _idx + _hdr.length);
          const _blk = _end !== -1 ? _mc.slice(_idx, _end) : _mc.slice(_idx);
          const _nb = _mode === 'replace' ? (_hdr + '\n' + _nc) : (_blk.trimEnd() + '\n' + _nc);
          _mc = _end !== -1 ? (_mc.slice(0,_idx) + _nb + '\n' + _mc.slice(_end)) : (_mc.slice(0,_idx) + _nb + '\n');
        } else { _mc += '\n' + _hdr + '\n' + _nc + '\n'; }
      } else { _mc += '\n' + _nc + '\n'; }
      fs.writeFileSync(_mp, _mc, 'utf8');
      return { success: true, section: _sec || 'appended', mode: _mode };
    }

    case 'cleanup_old_outputs': {
      const _days = args.olderThanDays || 14;
      const _dry = args.dryRun === true;
      const _cut = Date.now() - _days * 86400000;
      const _od = cfg.OUTPUTS_DIR;
      const _del = [], _skip = [];
      if (fs.existsSync(_od)) {
        for (const _f of fs.readdirSync(_od)) {
          const _fp = require('path').join(_od, _f);
          try { const _st = fs.statSync(_fp); if (_st.isFile() && _st.mtimeMs < _cut) { if (_dry) _skip.push(_f); else { fs.unlinkSync(_fp); _del.push(_f); } } }
          catch(_e) { _skip.push(_f); }
        }
      }
      return { deleted: _del, skipped: _skip, dryRun: _dry, olderThanDays: _days, message: (_dry?'DRY RUN: ':'')+_del.length+' deleted' };
    }

    default:
      throw new Error('Unknown tool: ' + name);
  }
}

function lruDestination() {
  try { const u = log.getUnusedDestinations(BRAND.destinations); return u.length ? u[0] : BRAND.destinations[0]; }
  catch { return BRAND.destinations[0]; }
}

// ── JSON-RPC message handler (shared by both transports) ─────────────────────
async function handleMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return { jsonrpc:'2.0', id, result:{ protocolVersion:'2024-11-05', capabilities:{ tools:{} }, serverInfo:{ name:'lavira-media-engine-mcp', version:'3.0.0' } } };
  if (method === 'tools/list') return { jsonrpc:'2.0', id, result:{ tools:TOOLS } };
  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params;
    try {
      const result = await handleTool(name, toolArgs || {});
      return { jsonrpc:'2.0', id, result:{ content:[{ type:'text', text:JSON.stringify(result, null, 2) }] } };
    } catch(e) {
      return { jsonrpc:'2.0', id, error:{ code:-32000, message:e.message } };
    }
  }
  if (method === 'notifications/initialized') return null;
  return { jsonrpc:'2.0', id, error:{ code:-32601, message:'Method not found' } };
}

// ── STDIO transport ───────────────────────────────────────────────────────────
function runStdio() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async chunk => {
    buf += chunk;
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const resp = await handleMessage(msg);
      if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
    }
  });
  process.stderr.write(`[Lavira MCP] stdio ready — ${TOOLS.length} tools\n`);
}

// ── HTTP/SSE transport ────────────────────────────────────────────────────────
function runHTTP(port) {
  // Active SSE connections keyed by session ID
  const sessions = new Map();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${port}`);

    // SSE endpoint: clients connect here to receive server messages
    if (url.pathname === '/sse' && req.method === 'GET') {
      const sessionId = url.searchParams.get('sessionId') || ('s_' + Date.now());
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
      res.write(`data: ${JSON.stringify({ type:'connected', sessionId })}\n\n`);
      sessions.set(sessionId, res);
      // Send endpoint info so client knows where to POST messages
      res.write(`data: ${JSON.stringify({ type:'endpoint', url:`http://localhost:${port}/messages?sessionId=${sessionId}` })}\n\n`);
      req.on('close', () => sessions.delete(sessionId));
      return;
    }

    // Message endpoint: receive JSON-RPC from client
    if (url.pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        let msg; try { msg = JSON.parse(body); } catch { res.writeHead(400); res.end('Bad JSON'); return; }
        const resp = await handleMessage(msg);
        // Return HTTP 202, send response via SSE
        res.writeHead(202); res.end('accepted');
        if (resp && sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId).write(`data: ${JSON.stringify(resp)}\n\n`);
        }
      });
      return;
    }

    // Direct JSON-RPC POST (non-SSE, for simple clients)
    if (url.pathname === '/rpc' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        let msg; try { msg = JSON.parse(body); } catch { res.writeHead(400); res.end('Bad JSON'); return; }
        const resp = await handleMessage(msg);
        res.writeHead(200, { 'Content-Type':'application/json' });
        res.end(JSON.stringify(resp || {}));
      });
      return;
    }

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ status:'ok', tools:TOOLS.length, transport:'http+sse', version:'3.0.0' }));
      return;
    }

    res.writeHead(404); res.end('Not found');
  });

  server.listen(port, () => {
    process.stderr.write(`[Lavira MCP] HTTP+SSE ready on port ${port} — ${TOOLS.length} tools\n`);
    process.stderr.write(`  SSE:   http://localhost:${port}/sse\n`);
    process.stderr.write(`  RPC:   http://localhost:${port}/rpc\n`);
    process.stderr.write(`  Opts:  http://localhost:${port}/health\n`);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (isHTTP) { runHTTP(httpPort); } else { runStdio(); }
