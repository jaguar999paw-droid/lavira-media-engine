const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const OUTPUTS_DIR = path.join(__dirname, '../../../outputs');

if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// Platform specs - auto-applied by orchestrator
const PLATFORMS = {
  instagram_reel: { width: 1080, height: 1920, maxDuration: 90, fps: 30, label: 'Instagram Reel' },
  tiktok:         { width: 1080, height: 1920, maxDuration: 60, fps: 30, label: 'TikTok' },
  instagram_post: { width: 1080, height: 1080, maxDuration: 60, fps: 30, label: 'Instagram Post' },
  youtube_short:  { width: 1080, height: 1920, maxDuration: 60, fps: 30, label: 'YouTube Short' },
  facebook:       { width: 1280, height: 720,  maxDuration: 240, fps: 30, label: 'Facebook' },
  twitter:        { width: 1280, height: 720,  maxDuration: 140, fps: 30, label: 'Twitter/X' }
};

function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) return reject(err);
      const vs = meta.streams.find(s => s.codec_type === 'video') || {};
      resolve({
        duration: parseFloat(meta.format.duration) || 0,
        width: vs.width || 1920,
        height: vs.height || 1080,
        fps: eval(vs.r_frame_rate) || 30,
        size: meta.format.size,
        bitrate: meta.format.bit_rate
      });
    });
  });
}

function transformVariant(inputPath, platform, options = {}) {
  return new Promise(async (resolve, reject) => {
    const spec = PLATFORMS[platform];
    if (!spec) return reject(new Error('Unknown platform: ' + platform));

    const info = await getVideoInfo(inputPath).catch(() => ({ duration: 30, width: 1920, height: 1080 }));
    const jobId = uuidv4().slice(0, 8);
    const outFile = path.join(OUTPUTS_DIR, `lavira_${platform}_${jobId}.mp4`);

    const startTime = options.trimStart || 0;
    const duration = Math.min(
      options.trimDuration || info.duration,
      spec.maxDuration
    );

    // Smart crop filter: pad/crop to target aspect ratio
    const srcAR = info.width / info.height;
    const dstAR = spec.width / spec.height;
    let vf;
    if (Math.abs(srcAR - dstAR) < 0.05) {
      // Already close - just scale
      vf = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease,pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
    } else if (srcAR > dstAR) {
      // Source is wider - crop sides (centre crop)
      vf = `crop=ih*${spec.width}/${spec.height}:ih,scale=${spec.width}:${spec.height}`;
    } else {
      // Source is taller - crop top/bottom
      vf = `crop=iw:iw*${spec.height}/${spec.width},scale=${spec.width}:${spec.height}`;
    }

    // Speed adjustment
    if (options.speed && options.speed !== 1) {
      vf += `,setpts=${(1/options.speed).toFixed(3)}*PTS`;
    }

    // Brightness/contrast boost for outdoor safari footage
    vf += ',eq=brightness=0.03:contrast=1.05:saturation=1.1';

    // Lavira watermark text overlay
    const watermark = `drawtext=text='LAVIRASAFARIS.COM':fontcolor=white:fontsize=${Math.round(spec.width*0.022)}:alpha=0.75:x=w-tw-20:y=h-th-20:shadowcolor=black:shadowx=1:shadowy=1`;
    vf += ',' + watermark;

    const cmd = ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(duration)
      .videoFilter(vf)
      .fps(spec.fps)
      .videoBitrate(options.quality === 'low' ? '800k' : '2500k')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions(['-movflags +faststart', '-preset fast', '-crf 23'])
      .output(outFile);

    cmd.on('start', cmdLine => console.log('[FFmpeg]', platform, cmdLine.slice(0, 80) + '...'))
       .on('progress', p => process.stdout.write(`\r[${platform}] ${Math.round(p.percent||0)}%`))
       .on('end', () => {
         console.log(`\n[Done] ${platform} -> ${path.basename(outFile)}`);
         resolve({
           platform,
           label: spec.label,
           file: outFile,
           filename: path.basename(outFile),
           resolution: `${spec.width}x${spec.height}`,
           duration: Math.round(duration)
         });
       })
       .on('error', (err) => {
         console.error('[FFmpeg Error]', err.message);
         reject(err);
       })
       .run();
  });
}

async function transformAll(inputPath, selectedPlatforms, options = {}) {
  const results = [];
  const errors = [];
  for (const platform of selectedPlatforms) {
    try {
      const r = await transformVariant(inputPath, platform, options);
      results.push(r);
    } catch(e) {
      errors.push({ platform, error: e.message });
    }
  }
  return { results, errors };
}

module.exports = { transformAll, transformVariant, getVideoInfo, PLATFORMS };
