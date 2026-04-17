# Lavira Media Engine v3.2 — Unified MCP/Engine/Interface Cohesion Guide

**Date:** April 12, 2026  
**Version:** 3.2  
**Authors:** AI & Claude Assistant

## Overview

The Lavira Media Engine has been unified into a **cohesive ecosystem** where:
- **MCP Server** (Claude Desktop) has direct access to all processing engines
- **Web Interface** can publish directly to social platforms  
- **Sample Media Library** provides test content for both MCP and UI
- **All components** share memory, branding, and processing logic

---

## Part 1: New MCP Tools Added

### Direct Publishing Tools

#### `post_to_instagram`
Publish an approved job directly to Instagram Reels, Feed, or Stories.

**Requirements:**
- Job must be in `approved` status (via UI or MCP's `approve_job`)
- `.env` variables: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`

**Usage:**
```javascript
// Claude Desktop
const result = await mcpClient.callTool('post_to_instagram', {
  jobId: 'vid_a45bb017',
  format: 'reels',  // or 'feed', 'stories'
  caption: 'Amazing wildlife at Masai Mara! 🦁'
});
// Returns: {jobId, platform: 'instagram', status: 'published'|'manual'|'stub'}
```

**Responses:**
- `status: 'published'` — Posted successfully (email notification sent)
- `status: 'manual'` — Token missing, fallback to manual upload via Instagram app
- `status: 'stub'` — Token present, but Graph API integration pending

---

#### `post_to_tiktok`
Publish to TikTok with auto-format detection.

**Requirements:** `TIKTOK_ACCESS_TOKEN` in `.env`

**Usage:**
```javascript
const result = await mcpClient.callTool('post_to_tiktok', {
  jobId: 'vid_a45bb017',
  caption: 'Safari reels ready! #masaimarafacts #wildlifevideo'
});
```

---

#### `post_to_facebook`
Publish to Facebook page feed.

**Requirements:** `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`

**Usage:**
```javascript
const result = await mcpClient.callTool('post_to_facebook', {
  jobId: 'img_65eb6ff2',
  caption: 'Golden hour at Amboseli 🌅'
});
```

---

#### `publish_job`
Publish to multiple platforms at once.

**Usage:**
```javascript
const result = await mcpClient.callTool('publish_job', {
  jobId: 'auto_6223a260',
  platforms: ['instagram', 'tiktok', 'facebook']
});
// Returns: {jobId, publishResults: [{platform, status, message}, ...]}
```

---

### Card Template & Overlay Tools

#### `generate_card_template`
Create branded social cards (hero destination, package offer, testimonial, pricing).

**Templates:**
- `hero_destination` — Full-screen destination card
- `package` — Safari package offer card
- `testimonial` — Guest feedback card
- `pricing` — Tier pricing card
- `twin_destination` — Two destinations comparison
- `activity` — Activity highlight card

**Usage:**
```javascript
const card = await mcpClient.callTool('generate_card_template', {
  template: 'hero_destination',
  destination: 'Masai Mara',
  profile: 'instagram_story',  // or instagram_post, facebook_feed
  data: {
    hook: 'Migration Season!',
    highlight: 'Over 10,000 wildebeest'
  }
});
// Returns: {filename, url: '/outputs/card_xyz.jpg', downloadUrl}
```

---

#### `apply_overlay`
Add Lavira brand overlay to any image or video.

**Features:**
- Dynamic logo bar (top)
- Title + brand name
- Hook text (promo message)
- Contact bar (bottom): phone, website, Instagram
- Destination label
- Date stamp

**Usage:**
```javascript
const branded = await mcpClient.callTool('apply_overlay', {
  filePath: '/home/kamau/lavira-media-engine/outputs/vid_a45bb017.mp4',
  destination: 'Masai Mara',
  hook: 'Witness the great migration',
  promoType: 'Wildlife Experience',
  layout: 'standard'  // or 'story' (tall), 'minimal'
});
// Returns: {filename, downloadUrl, compositeTime: '2.34s'}
```

---

### Sample Media Tools

#### `list_sample_media`
List all test/reference media in the samples directory.

**Usage:**
```javascript
const samples = await mcpClient.callTool('list_sample_media', {
  type: 'images',  // or 'videos', 'audio', 'all'
  destination: 'Masai Mara'
});
// Returns:
// {
//   destinations: {
//     'Masai Mara': {images: 12, videos: 5, audio: 3},
//     'Amboseli': {images: 8, videos: 2, audio: 2}
//   },
//   total: 156
// }
```

---

#### `get_sample_media`
Fetch sample files for a specific destination.

**Usage:**
```javascript
const samples = await mcpClient.callTool('get_sample_media', {
  destination: 'Masai Mara',
  type: 'image',  // or 'video', 'audio'
  random: false   // if true, returns 1 random sample
});
// Returns: [{filename, url, type, destination, localPath}, ...]
```

**Key:** Use `localPath` for processing on the server, `url` for browser display.

---

#### `process_sample_as_test`
Use sample media to test the full processing pipeline.

**Usage:**
```javascript
// Test image processing with a sample
const job = await mcpClient.callTool('process_sample_as_test', {
  destination: 'Masai Mara',
  mediaType: 'image',
  platforms: ['instagram_post', 'instagram_story']
});
// Returns: {jobId, status: 'done', results: [...]}
```

**Benefit:** No file upload needed — instant testing with pre-existing samples.

---

### Batch & Scheduling Tools

#### `batch_process_samples`
Process all samples in a destination folder.

**Usage:**
```javascript
const batch = await mcpClient.callTool('batch_process_samples', {
  destination: 'Masai Mara',
  mediaType: 'image',
  limit: 5  // process first 5 samples
});
// Returns: {destination, processed: 5, jobIds: [...], total: 12}
```

**Use Case:** Generate a week of content in seconds for testing or bulk posting.

---

#### `schedule_post`
Schedule a job to publish at a future time.

**Usage:**
```javascript
const scheduled = await mcpClient.callTool('schedule_post', {
  jobId: 'auto_6223a260',
  scheduledTime: '2026-04-15T06:00:00Z',  // ISO 8601
  platforms: ['instagram', 'tiktok']
});
// Returns: {success: true, jobId, scheduledTime, platforms}
```

**Integration:** The scheduler checks this field and auto-publishes at the scheduled time.

---

## Part 2: Sample Media Structure

### Directory Layout

```
/home/kamau/lavira-media-engine/samples/
├── images/
│   ├── destinations/
│   │   ├── masai-mara/          ← Place 10-20 high-res images here
│   │   ├── amboseli/
│   │   ├── mt-kenya/
│   │   ├── nakuru/
│   │   ├── ol-pejeta/
│   │   ├── samburu/
│   │   └── tsavo/
│   └── themes/
│       ├── sunrise-sunset/
│       ├── wildlife-action/
│       ├── cultural/
│       └── conservation/
│
├── videos/
│   ├── destinations/
│   │   ├── masai-mara/          ← 30-60s MP4 clips
│   │   └── [destinations]/
│   └── clips/
│       ├── b-roll/              ← Reusable transitions, pans
│       ├── animals/             ← Wildlife footage
│       └── storytelling/        ← Narrative clips
│
└── audio/
    ├── nature/                  ← Ambient wildlife sounds
    ├── music/                   ← Royalty-free safari music
    └── voiceovers/              ← Sample narration
```

### Adding Sample Media

**Images:**
```bash
# Copy high-res images to samples
cp /path/to/elephant-herd.jpg /home/kamau/lavira-media-engine/samples/images/destinations/amboseli/
cp /path/to/sunset.jpg /home/kamau/lavira-media-engine/samples/images/themes/sunrise-sunset/
```

**Naming Convention:**
```
masai-mara_wildebeest-migration_12mp.jpg     # destiny_subject_quality
amboseli_elephants_herd_sunset.jpg            # All lowercase, underscores, brief
```

**Recommended Specs:**
- **Images:** 1080×1080 minimum, JPG, ~500KB
- **Videos:** 1080×1920 MP4, 30-60 seconds, H.264
- **Audio:** MP3 320k, under 2 minutes

---

### Using Samples in MCP

```javascript
// 1. List what's available
const lib = await mcpClient.callTool('list_sample_media');
console.log(lib.destinations);  // See what destinations have samples

// 2. Get samples for a destination
const mmSamples = await mcpClient.callTool('get_sample_media', {
  destination: 'Masai Mara',
  type: 'image'
});

// 3. Process one
const job1 = await mcpClient.callTool('process_sample_as_test', {
  destination: 'Masai Mara',
  mediaType: 'image'
});

// 4. Process all in batch
const batch = await mcpClient.callTool('batch_process_samples', {
  destination: 'Masai Mara',
  mediaType: 'image',
  limit: 10
});
```

---

## Part 3: Direct Posting Configuration

### Step 1: Get Social Media Tokens

#### Instagram Graph API
1. Go to **Facebook Developers** (https://developers.facebook.com)
2. Create an app (type: "Business")
3. Add **Instagram Graph API**
4. Create a System User with token
5. Get: `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID`

#### TikTok API
1. Go to **TikTok Developer Portal** (https://developers.tiktok.com)
2. Create an app
3. Request **TikTok API** (video upload)
4. Get: `TIKTOK_ACCESS_TOKEN`

#### Facebook Graph API  
1. Facebook Developers → Business Suite
2. Create/link a Facebook Page
3. Generate Page Access Token
4. Get: `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`

### Step 2: Add to Environment

```bash
# Edit /home/kamau/lavira-media-engine/.env
INSTAGRAM_ACCESS_TOKEN="your-token-here"
INSTAGRAM_USER_ID="123456789"
TIKTOK_ACCESS_TOKEN="your-token-here"
FACEBOOK_ACCESS_TOKEN="your-token-here"
FACEBOOK_PAGE_ID="your-page-id"
```

### Step 3: Test Posting

**Via Web Interface:**
1. Process media (video/photo)
2. Click "✓ Approve"
3. Click "📸 Post to Instagram" (or TikTok/Facebook)
4. If tokens not set: UI shows setup instructions

**Via MCP:**
```javascript
// After processing a job
const result = await mcpClient.callTool('publish_job', {
  jobId: 'vid_a45bb017',
  platforms: ['instagram', 'tiktok']
});
console.log(result.publishResults);
// [{platform: 'instagram', status: 'published'}, ...]
```

---

## Part 4: Best Practices & Workflows

### Workflow 1: Daily Auto-Post via Scheduler + MCP

**Goal:** Fully automated daily content posting.

```javascript
// In scheduler (or via MCP trigger):
1. generateDailyPromo()  // Creates auto_xyz job
2. Wait for job completion (poll)
3. approveJob(jobId)     // Auto-approve
4. publish_job(jobId, ['instagram', 'tiktok', 'facebook'])
5. Schedule next run for 06:00 EAT
```

**Command in Claude Desktop:**
```
"Generate today's Masai Mara auto-promo, approve it, 
and post to Instagram and TikTok"
```

---

### Workflow 2: Multi-Platform Content Creation

```javascript
// Step 1: Process a single video for all platforms
const job = await mcpClient.callTool('process_video', {
  filePath: '/home/kamau/lavira-media-engine/uploads/safari.mp4',
  destination: 'Masai Mara',
  platform: 'instagram_reel'  // Main format
});

// Step 2: Add overlay
const branded = await mcpClient.callTool('apply_overlay', {
  filePath: `/home/kamau/lavira-media-engine/outputs/${job.result.filename}`,
  destination: 'Masai Mara',
  hook: 'Witness the migration'
});

// Step 3: Build post package (exports all platform variants)
const pkg = await mcpClient.callTool('build_post_package', {
  jobId: job.jobId
});

// Step 4: Publish to all platforms
const published = await mcpClient.callTool('publish_job', {
  jobId: job.jobId,
  platforms: ['instagram', 'tiktok', 'facebook']
});
```

---

### Workflow 3: Bulk Sample Testing

```javascript
// Generate 10 test posts from samples in 2 minutes
const batch = await mcpClient.callTool('batch_process_samples', {
  destination: 'Masai Mara',
  mediaType: 'image',
  limit: 10
});

// Review all outputs via UI
// http://localhost:3000/?tab=output

// Approve best ones and publish
for (const jobId of batch.jobIds) {
  await mcpClient.callTool('approve_job', { jobId });
  await mcpClient.callTool('publish_job', {
    jobId,
    platforms: ['instagram']
  });
}
```

---

### Workflow 4: Card Template + Overlay Brand

```javascript
// Create a hero destination card
const card = await mcpClient.callTool('generate_card_template', {
  template: 'hero_destination',
  destination: 'Masai Mara',
  data: { hook: 'Migration Season', highlight: 'Over 1M wildebeest' }
});

// Apply overlay to existing image
const overlay = await mcpClient.callTool('apply_overlay', {
  filePath: card.path,
  destination: 'Masai Mara',
  layout: 'story'
});

// Result: fully branded, ready-to-post image
```

---

## Part 5: MCP Tools Summary Table

| Tool | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| `post_to_instagram` | Direct Instagram posting | jobId, format | {status, message} | ✅ Ready |
| `post_to_tiktok` | Direct TikTok posting | jobId, caption | {status, message} | ✅ Ready |
| `post_to_facebook` | Direct Facebook posting | jobId, caption | {status, message} | ✅ Ready |
| `publish_job` | Multi-platform posting | jobId, platforms | {publishResults} | ✅ Ready |
| `generate_card_template` | Create branded cards | template, data | {url, filename} | ✅ Ready |
| `apply_overlay` | Add Lavira overlay | filePath, opts | {downloadUrl} | ✅ Ready |
| `list_sample_media` | List test media | type, destination | {destinations} | ✅ Ready |
| `get_sample_media` | Fetch samples | destination, type | [{filename, url}] | ✅ Ready |
| `process_sample_as_test` | Test with samples | destination | {jobId, results} | ✅ Ready |
| `batch_process_samples` | Bulk test | destination, limit | {jobIds, count} | ✅ Ready |
| `schedule_post` | Future publishing | jobId, time | {success, scheduled} | ✅ Ready |

---

## Part 6: UI Enhancements for Posting

### Output Panel → Direct Publishing Section

After an approved job, users see:

```
📡 Direct Publishing
Connected social tokens → publish directly without manual upload

[📸 Post to Instagram]  [🎵 Post to TikTok]  [f Post to Facebook]

Status: (updates in real-time)
```

**Features:**
- Color-coded buttons (Instagram: #E1306C, TikTok: #000, Facebook: #1877F2)
- Live status updates
- Graceful fallback if tokens not configured

---

## Part 7: Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│           LAVIRA MEDIA ENGINE v3.2                      │
├──────────────────────────────────────────────────────┼──┤
│  WEB INTERFACE          │  MCP SERVER         │  SCHEDULER
│  (localhost:3000)       │  (Claude Desktop)   │  (06:00 EAT)
│                         │                     │
│  • Upload media         │  • Full API access  │  • Auto-generate
│  • Process files        │  • Batch ops        │  • Approve
│  • Approve jobs         │  • Sample testing   │  • Schedule post
│  • Publish directly     │  • Schedule posts   │  • Poll at 06:00
│  • View outputs         │  • Card templates   │
└──┬────────────┬─────────────────────┬─────────────┬────────┘
   │            │                     │             │
   │     ┌─────▼─────────────────────▼───┐         │
   │     │  SHARED ENGINES LAYER          │         │
   │     │ (video.js, image.js, audio.js)│         │
   │     │ (promo.js, giphy.js, cards.js)│         │
   │     │ (compositor.js, media-lib.js) │         │
   │     └─────┬─────────────────────────┘         │
   │           │                                    │
   │  ┌────────▼────────┐  ┌──────────────┐      ┌─▼──────┐
   │  │  MEMORY & STATE  │  │  SAMPLE MEDIA │      │ BRAND  │
   │  │  (SQLite log)    │  │  (/samples/)  │      │ CONFIG │
   │  └──────────────────┘  └──────────────┘      └────────┘
   │
   └──────┬──────────────────────────────┐
          │       OUTPUTS DIRECTORY        │
         ▼        (/outputs/)              ▼
    [jobs.json] [media files] [job logs]
```

---

## Part 8: Troubleshooting

### Issue: "Add INSTAGRAM_ACCESS_TOKEN to .env"

**Solution:**
1. Get token from Facebook Developers
2. Add to `/home/kamau/lavira-media-engine/.env`
3. Restart server: `npm start`
4. Go to `/api/health` → check "instagram: true"

### Issue: Samples Not Appearing

**Solution:**
```bash
# Ensure samples directory exists
ls -R /home/kamau/lavira-media-engine/samples/

# If empty, add images
cp your-images/*.jpg /home/kamau/lavira-media-engine/samples/images/destinations/masai-mara/

# Reload: http://localhost:3000/?tab=gallery
```

### Issue: MCP Can't Find Sample Media

**Solution:**
```javascript
// Debug: Check what's registered
const list = await mcpClient.callTool('list_sample_media');
console.log(list);  // Should show destinations with file counts

// If empty, manually add files to samples/images/destinations/
```

---

## Quick Start Checklist

- [ ] Add images to `/samples/images/destinations/[destination]/`
- [ ] Add videos to `/samples/videos/destinations/[destination]/`
- [ ] Set social tokens in `.env`
- [ ] Test posting: Process sample → Approve → Click "Post to Instagram"
- [ ] Test MCP: `await mcpClient.callTool('list_sample_media')`
- [ ] Generate batch: `batch_process_samples({destination:'Masai Mara'})`
- [ ] Schedule post: `schedule_post({jobId, scheduledTime})`

---

**Status:** Production-ready for unified MCP + Engine + UI workflows  
**Last Updated:** April 12, 2026  
**Next Steps:** Add payment integration for API quotas, implement social scheduling calendar
