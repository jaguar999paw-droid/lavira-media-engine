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

const HANDLERS = {
  async process_video(args) {
    if (videoEng?.processVideo) return videoEng.processVideo(args);
    if (videoEnh?.processVideo) return videoEnh.processVideo(args);
    throw new Error('Video engine not available');
  },
  async video_clip(args) {
    if (videoEng?.clipVideo) return videoEng.clipVideo(args);
    if (videoEnh?.clipVideo) return videoEnh.clipVideo(args);
    throw new Error('Video clip engine not available');
  },
  async video_probe(args) {
    if (videoEng?.probeVideo) return videoEng.probeVideo(args);
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
    if (videoEnh?.encodePlatform) return videoEnh.encodePlatform(args);
    if (videoEng?.encodeVideo) return videoEng.encodeVideo(args);
    throw new Error('Video encode engine not available');
  },
  async video_add_watermark(args) {
    if (videoEnh?.addWatermark) return videoEnh.addWatermark(args);
    if (videoEng?.addWatermark) return videoEng.addWatermark(args);
    throw new Error('Watermark engine not available');
  },
  async video_to_reel(args) {
    if (videoEnh?.imageToReel) return videoEnh.imageToReel(args);
    if (videoEng?.imageToReel) return videoEng.imageToReel(args);
    throw new Error('Reel engine not available');
  },
  async full_video_post_pipeline(args) {
    if (videoEnh?.fullVideoPipeline) return videoEnh.fullVideoPipeline(args);
    if (videoEng?.fullVideoPipeline) return videoEng.fullVideoPipeline(args);
    throw new Error('Full pipeline engine not available');
  },
  async process_image(args) {
    if (imageEng?.processImage) return imageEng.processImage(args);
    if (imageEnh?.processImage) return imageEnh.processImage(args);
    throw new Error('Image engine not available');
  },
  async image_smart_crop(args) {
    if (imageEnh?.smartCrop) return imageEnh.smartCrop(args);
    if (imageEng?.smartCrop) return imageEng.smartCrop(args);
    throw new Error('Smart crop engine not available');
  },
  async image_compare(args) {
    if (imageEnh?.compareImages) return imageEnh.compareImages(args);
    throw new Error('Image compare engine not available');
  },
  async image_export_platform(args) {
    if (imageEnh?.exportPlatform) return imageEnh.exportPlatform(args);
    if (imageEng?.exportPlatform) return imageEng.exportPlatform(args);
    throw new Error('Platform export engine not available');
  },
  async image_ocr_prepare(args) {
    if (imageEnh?.ocrPrepare) return imageEnh.ocrPrepare(args);
    throw new Error('OCR prepare engine not available');
  },
  async image_analyze_colors(args) {
    if (imageEnh?.analyzeColors) return imageEnh.analyzeColors(args);
    if (imageEng?.analyzeColors) return imageEng.analyzeColors(args);
    throw new Error('Color analysis engine not available');
  },
  async image_metadata(args) {
    if (imageEnh?.getMetadata) return imageEnh.getMetadata(args);
    const sharp = require('sharp');
    const meta = await sharp(args.filePath).metadata();
    const stat = require('fs').statSync(args.filePath);
    return { width: meta.width, height: meta.height, format: meta.format,
      size: (stat.size / 1024 / 1024).toFixed(2) + ' MB', megapixels: ((meta.width * meta.height) / 1e6).toFixed(2) };
  },
  async image_build_collage(args) {
    if (imageEnh?.buildCollage) return imageEnh.buildCollage(args);
    throw new Error('Collage engine not available');
  },
  async process_audio(args) {
    if (audioEng?.processAudio) return audioEng.processAudio(args);
    throw new Error('Audio engine not available');
  },
  async mix_audio_with_media(args) {
    if (mediaMixer?.mixAudioWithMedia) return mediaMixer.mixAudioWithMedia(args);
    throw new Error('Media mixer engine not available');
  }
};

rpc.start({ name: 'lavira-media', version: '4.0.0', tools: TOOLS, handlers: HANDLERS });
