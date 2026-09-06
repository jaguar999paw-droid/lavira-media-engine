#!/usr/bin/env node
// src/mcp/servers/media-server.js — lavira-media
// Concern: Media editing primitives (video, image, audio transforms)
// Tools: 17 | No brand injection, no AI captions, no external search
'use strict';

const rpc  = require('../lib/rpc-core');
const cfg  = require('../../config');

let videoEng, videoEnh, imageEng, imageEnh, audioEng, mediaMixer;
try { videoEng   = require('../../engines/video');           } catch { videoEng   = null; }
try { videoEnh   = require('../../engines/video-enhanced'); } catch { videoEnh   = null; }
try { imageEng   = require('../../engines/image');           } catch { imageEng   = null; }
try { imageEnh   = require('../../engines/image-enhanced'); } catch { imageEnh   = null; }
try { audioEng   = require('../../engines/audio');           } catch { audioEng   = null; }
try { mediaMixer = require('../../engines/media-mixer');     } catch { mediaMixer = null; }

const TOOLS = [
  { name:'process_video',
    description:'Process a video: auto-crop, watermark, export one platform variant. Specify filePath + platform.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},platform:{type:'string',enum:['whatsapp','instagram','instagram_story','tiktok','facebook','twitter']},duration:{type:'number'},trimStart:{type:'number'},trimDuration:{type:'number'},destination:{type:'string'},context:{type:'string'}},required:['filePath','platform']}},
  { name:'video_clip',
    description:'Trim a video: extract a segment starting at startSec for durationSec seconds.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},startSec:{type:'number'},durationSec:{type:'number'},outputName:{type:'string'}},required:['filePath','durationSec']}},
  { name:'video_probe',
    description:'Probe a video file: duration, resolution, fps, codec, audio presence, file size.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'}},required:['filePath']}},
  { name:'video_encode_platform',
    description:'Encode a video for a specific platform with correct resolution, fps, bitrate, moov-atom placement.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},platform:{type:'string'},quality:{type:'string',enum:['high','medium','low']}},required:['filePath','platform']}},
  { name:'video_add_watermark',
    description:'Burn Lavira brand watermark (name, phone, website, destination) directly into video frames.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},destination:{type:'string'},position:{type:'string',enum:['bottom-left','bottom-right','top-left','top-right']}},required:['filePath']}},
  { name:'video_to_reel',
    description:'Convert a static image into an animated video reel with Ken Burns zoom effect (9:16, MP4, configurable duration).',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},duration:{type:'number'},destination:{type:'string'},zoomDirection:{type:'string',enum:['in','out','random']}},required:['filePath']}},
  { name:'full_video_post_pipeline',
    description:'MASTER VIDEO TOOL: search Pexels → download → probe → clip → encode for platform in one call.',
    inputSchema:{type:'object',properties:{query:{type:'string'},destination:{type:'string'},platform:{type:'string'},duration:{type:'number'},theme:{type:'string'}},required:['query']}},
  { name:'process_image',
    description:'Process a photo with optional manual edits (crop, rotate, color correction). Exports to specified social profiles.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},profiles:{type:'array'},destination:{type:'string'},fit:{type:'string',enum:['cover','contain','fill']},edits:{type:'object'},watermark:{type:'boolean'},brandTint:{type:'boolean'}},required:['filePath']}},
  { name:'image_smart_crop',
    description:'Entropy-based smart crop — detects subject and crops to specified aspect ratio without cutting focal point.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},width:{type:'number'},height:{type:'number'},outputName:{type:'string'}},required:['filePath']}},
  { name:'image_compare',
    description:'Generate side-by-side A/B comparison image of two files for visual review.',
    inputSchema:{type:'object',properties:{filePathA:{type:'string'},filePathB:{type:'string'},label:{type:'string'}},required:['filePathA','filePathB']}},
  { name:'image_export_platform',
    description:'Export an image resized and optimised for a specific social platform: whatsapp, instagram, facebook, tiktok, twitter.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},platform:{type:'string'},quality:{type:'number'}},required:['filePath','platform']}},
  { name:'image_ocr_prepare',
    description:'Pre-process image for OCR text extraction: greyscale + normalise + sharpen + threshold.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'}},required:['filePath']}},
  { name:'image_analyze_colors',
    description:'Analyse dominant colour, brightness, saturation, and mood of an image.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'}},required:['filePath']}},
  { name:'image_metadata',
    description:'Extract full metadata from an image: dimensions, format, file size, megapixels, EXIF data.',
    inputSchema:{type:'object',properties:{filePath:{type:'string'}},required:['filePath']}},
  { name:'image_build_collage',
    description:'Build a 2x2 grid collage from 2 to 4 images, with optional destination label overlay.',
    inputSchema:{type:'object',properties:{filePaths:{type:'array',items:{type:'string'}},destination:{type:'string'},outputName:{type:'string'}},required:['filePaths']}},
  { name:'process_audio',
    description:'Process audio: normalise, fade in/out, export at exact platform duration (15/30/45/60s).',
    inputSchema:{type:'object',properties:{filePath:{type:'string'},preset:{type:'number',description:'Duration in seconds: 15, 30, 45, or 60'},trimStart:{type:'number'},destination:{type:'string'}},required:['filePath']}},
  { name:'mix_audio_with_media',
    description:'Attach background music to an image (produces animated video) or overlay audio track on existing video.',
    inputSchema:{type:'object',properties:{mediaPath:{type:'string'},audioPath:{type:'string'},platform:{type:'string'},volume:{type:'number'}},required:['mediaPath','audioPath']}}
];

// ── Handlers: delegate to engine modules ────────────────────────────────────
// NOTE (fixed 2026-09-05): every handler below was previously calling either
// a method name that does not exist on the engine module, or the right
// method with the whole `args` object passed where the engine expects
// positional parameters. Verified against actual engine exports/signatures
// via `node -e "console.log(Object.keys(require(...)))"` and direct source
// reads — see /areas/lavira-media-engine.md on dizaster for the audit notes.

const HANDLERS = {
  async process_video(args) {
    // No engine ever exported "processVideo". Real equivalent: video.js's
    // processVariant(inputPath, platform, opts) — opts.duration/trimStart/quality.
    if (videoEng?.processVariant) return videoEng.processVariant(args.filePath, args.platform, args);
    if (videoEnh?.encodeForPlatform) return videoEnh.encodeForPlatform(args.filePath, args.platform, args);
    throw new Error('Video engine not available');
  },
  async video_clip(args) {
    // clipVideo exists, but takes positional (inputPath, startSec, durationSec, outputPath) —
    // was being called with the whole args object, which silently misbehaves rather than throwing.
    if (videoEnh?.clipVideo) return videoEnh.clipVideo(args.filePath, args.startSec, args.durationSec, args.outputName);
    throw new Error('Video clip engine not available');
  },
  async video_probe(args) {
    if (videoEng?.probe) return videoEng.probe(args.filePath);
    // Fallback: ffprobe direct (execFileSync — no shell, no string interpolation of user input)
    const { execFileSync } = require('child_process');
    const ffprobe = require('ffprobe-static').path;
    const out = execFileSync(ffprobe, [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', args.filePath
    ]).toString();
    const data = JSON.parse(out);
    const vs = data.streams?.find(s => s.codec_type === 'video');
    // Parse "30/1" style frame-rate fractions safely instead of eval()
    let fps = null;
    if (vs?.r_frame_rate) {
      const [num, den] = vs.r_frame_rate.split('/').map(Number);
      fps = den ? num / den : num;
    }
    return { duration: parseFloat(data.format?.duration), width: vs?.width, height: vs?.height,
      codec: vs?.codec_name, fps, size: data.format?.size };
  },
  async video_encode_platform(args) {
    // Real name is encodeForPlatform, not encodePlatform.
    if (videoEnh?.encodeForPlatform) return videoEnh.encodeForPlatform(args.filePath, args.platform, args);
    if (videoEng?.processVariant) return videoEng.processVariant(args.filePath, args.platform, args);
    throw new Error('Video encode engine not available');
  },
  async video_add_watermark(args) {
    // Real name is addBrandWatermark, not addWatermark. Signature is
    // (inputPath, opts, outputPath) — opts.destination is read internally.
    if (videoEnh?.addBrandWatermark) return videoEnh.addBrandWatermark(args.filePath, args);
    throw new Error('Watermark engine not available');
  },
  async video_to_reel(args) {
    // Real name is imageToVideo, not imageToReel. Signature is
    // (imagePath, durationSec, platform, outputPath) — NOTE: the engine has
    // no concept of "destination" or "zoomDirection" (always zooms in the
    // same way); those two schema fields are accepted but currently have no
    // effect until the engine itself grows that capability.
    if (videoEnh?.imageToVideo) return videoEnh.imageToVideo(args.filePath, args.duration, 'tiktok');
    throw new Error('Reel engine not available');
  },
  async full_video_post_pipeline(args) {
    // Real name is fullVideoPostPipeline, not fullVideoPipeline. Call shape
    // was already correct (single opts object).
    if (videoEnh?.fullVideoPostPipeline) return videoEnh.fullVideoPostPipeline(args);
    throw new Error('Full pipeline engine not available');
  },
  async process_image(args) {
    // imageEnh has no processImage export at all (dead fallback removed).
    // Real signature: image.js processImage(inputPath, profiles, opts).
    if (imageEng?.processImage) return imageEng.processImage(args.filePath, args.profiles, args);
    throw new Error('Image engine not available');
  },
  async image_smart_crop(args) {
    // Right name, wrong shape: smartCrop(filePath, targetW, targetH, outputPath).
    if (imageEnh?.smartCrop) return imageEnh.smartCrop(args.filePath, args.width, args.height, args.outputName);
    throw new Error('Smart crop engine not available');
  },
  async image_compare(args) {
    // Right name, wrong shape: compareImages(filePathA, filePathB, outputPath).
    if (imageEnh?.compareImages) return imageEnh.compareImages(args.filePathA, args.filePathB);
    throw new Error('Image compare engine not available');
  },
  async image_export_platform(args) {
    // Real name is exportForPlatform, not exportPlatform.
    if (imageEnh?.exportForPlatform) return imageEnh.exportForPlatform(args.filePath, args.platform);
    throw new Error('Platform export engine not available');
  },
  async image_ocr_prepare(args) {
    // Real name is prepareForOCR, not ocrPrepare.
    if (imageEnh?.prepareForOCR) return imageEnh.prepareForOCR(args.filePath);
    throw new Error('OCR prepare engine not available');
  },
  async image_analyze_colors(args) {
    // Right name, wrong shape: analyzeColors(filePath) takes one positional arg.
    if (imageEnh?.analyzeColors) return imageEnh.analyzeColors(args.filePath);
    throw new Error('Color analysis engine not available');
  },
  async image_metadata(args) {
    // imageEnh has no getMetadata export (real name is extractMetadata);
    // the sharp-based fallback below was already correct and does the job.
    if (imageEnh?.extractMetadata) return imageEnh.extractMetadata(args.filePath);
    const sharp = require('sharp');
    const meta = await sharp(args.filePath).metadata();
    const stat = require('fs').statSync(args.filePath);
    return { width: meta.width, height: meta.height, format: meta.format,
      size: (stat.size / 1024 / 1024).toFixed(2) + ' MB', megapixels: ((meta.width * meta.height) / 1e6).toFixed(2) };
  },
  async image_build_collage(args) {
    // Right name, wrong shape: buildCollage(imagePaths, outputPath).
    if (imageEnh?.buildCollage) return imageEnh.buildCollage(args.filePaths, args.outputName);
    throw new Error('Collage engine not available');
  },
  async process_audio(args) {
    // Right name, wrong shape AND a schema/engine model mismatch: the tool
    // exposes `preset` as a duration number (15/30/45/60), but the engine
    // wants `profiles` as an array of preset NAME strings. Map preset ->
    // matching profile names via the engine's own PLATFORM_DURATIONS table.
    if (audioEng?.processAudio) {
      let profiles = ['instagram_story', 'tiktok_audio'];
      if (args.preset && audioEng.PLATFORM_DURATIONS) {
        const matches = Object.entries(audioEng.PLATFORM_DURATIONS)
          .filter(([, durs]) => durs.includes(args.preset))
          .map(([name]) => name);
        if (matches.length) profiles = matches;
      }
      return audioEng.processAudio(args.filePath, profiles, args);
    }
    throw new Error('Audio engine not available');
  },
  async mix_audio_with_media(args) {
    // Already correct: mixAudioWithMedia({mediaPath, audioPath, durationSeconds})
    // destructures an object, and args already carries matching keys.
    // (schema's platform/volume fields are accepted but unused by the engine)
    if (mediaMixer?.mixAudioWithMedia) return mediaMixer.mixAudioWithMedia(args);
    throw new Error('Media mixer engine not available');
  }
};

rpc.start({ name: 'lavira-media', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
