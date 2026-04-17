# Lavira Media Engine — Frontend-Backend Mapping Analysis

**Generated:** April 12, 2026  
**Scope:** public/index.html, src/routes/, src/engines/

---

## 1. UI MEDIA BUTTONS & CONTROLS

### Main Studio Tabs
| Button | ID | Action | Icon |
|--------|----|---------|----|
| Video | `st-video` | Show video processing tab | 🎬 |
| Photo | `st-photo` | Show photo processing tab | 📷 |
| Audio | `st-audio` | Show audio processing tab | 🎵 |
| GIF Search | `st-gif` | Show GIPHY search UI | 🦁 |
| Auto Promo | `st-auto` | Show auto-generation UI | 🤖 |
| Processing | `st-processing` | Show active job queue | ⚙️ |
| Output | `st-output` | Show completed jobs | ✅ |
| History | `st-history` | Show job history + schedule | 🗃️ |
| Gallery | `st-gallery` | Show all media library | 🖼️ |

### Processing Action Buttons

#### **Video Processing**
- Button: `▶ Process Video` (`vBtn`)
- Calls: `submitVideo()`
- Inputs:
  - File upload (video file, `vfi`)
  - Platform selection: `instagram_reel`, `tiktok`, `instagram_post`, `youtube_short`, `facebook`, `twitter`
  - Trim Start (seconds): `vtrimS`
  - Clip Length (seconds): `vtrimL`
  - Playback Speed: `vspeed` (dropdown: 0.5x, 1x, 1.5x, 2x)
  - Quality: `vqual` (high/medium/low)
- Backend: **POST /api/video**

#### **Photo Processing**
- Button: `📷 Process Photo` (`pBtn`)
- Calls: `submitPhoto()`
- Inputs:
  - File upload (image file, `pfi`)
  - Profile selection: `instagram_post`, `instagram_story`, `instagram_portrait`, `facebook_feed`, `facebook_story`, `twitter_card`, `youtube_thumb`, `linkedin`
  - Fit mode: `cover` or `contain`
  - Brand tint: toggle option
  - Manual editor (collapse): crop, rotate (0°/90°/180°/270°), flip H/V, color adjustments
- Backend: **POST /api/photo**

#### **Audio Processing**
- Button: `🎵 Process Audio` (`aBtn`)
- Calls: `submitAudio()`
- Inputs:
  - File upload (audio file, `afi`)
  - Profile selection: `instagram_story`, `tiktok_audio`, `podcast_promo`, `whatsapp`
  - Trim Start (seconds): `atrimS`
  - Duration preset buttons: 15s, 30s, 45s, **60s ✅** (default)
- Backend: **POST /api/audio**

#### **GIF Search & Use**
- Search Button: `Search` → calls `searchGif()`
- Inputs:
  - Destination: `gifDest` (auto-populated from smart destination)
  - Query: `gifQuery`
  - Results grid with image selection (`gif-grid`, click to select)
  - Suggestion chips auto-populated by `suggestQueries()`
- Use Button: `🦁 Use Selected GIF` → calls `submitGif()`
- Backend: 
  - **GET /api/giphy/search** (with `q`, `destination`, `limit`)
  - **POST /api/giphy/use** (with `giphyId`, `destination`, `context`)

#### **Auto Promo (Zero-Media)**
- Button: `🤖 Generate Auto Promo` (`autoBtn`)
- Calls: `submitAuto()`
- Inputs:
  - Destination: `autoDest` (smart default)
  - Theme: `autoTheme` (dropdown from BRAND.content_themes)
  - Context: `autoContext` (optional override)
  - Profiles: `autoProfs` (default: instagram_post, instagram_story, facebook)
- Backend: **POST /api/auto**

---

## 2. OUTPUT & APPROVAL CONTROLS

### Job Processing View
Located in "Processing" tab (`panel-processing`), updated real-time via job polling.

| Control | Endpoint | Purpose |
|---------|----------|---------|
| Poll status | **GET /api/job/:jobId** | Check job completion |
| View Output button | `viewOutput(jobId)` | Navigate to Output tab with job details |

### Output/Ready View
Located in "Output" tab, shows completed jobs with media variants.

| Button | Function | Backend Route |
|--------|----------|---|
| **View Output & Download →** | `viewOutput(jobId)` | GET /api/job/:jobId/share |
| **🏷 Build Post Package** | `makeReadyToPost(jobId)` | *(no route found)* |
| **✓ Approve** | `approveJob(jobId)` | **POST /api/job/:jobId/approve** |
| **✗ Reject** | `rejectJob(jobId)` | **POST /api/job/:jobId/reject** |

### Capability Details
- **Approve**: Marks job as approved, enables download
- **Reject**: Sets status to rejected, accepts optional note: `rejectNote`
- **Build Post Package**: Creates read-to-post variant (caption + multiplatform files)
- **Share Package**: Returns caption, hook, hashtags, CTA block, per-platform file mappings

---

## 3. BACKEND ROUTES/ENDPOINTS

### Input Routes (`src/routes/intake.js`)

#### **POST /api/video**
```javascript
// Multipart form upload
{
  video: File,
  destination?: string (auto if omitted),
  context?: string,
  platforms?: JSON array ["instagram_reel","tiktok",...],
  trimStart?: float (seconds),
  duration?: int (seconds),
  speed?: float (1=normal),
  quality?: "high"|"medium"|"low"
}
// Returns: { jobId, status, destination, promo, videoInfo, platforms, pollUrl }
```

#### **POST /api/photo**
```javascript
{
  photo: File,
  destination?: string,
  context?: string,
  profiles?: JSON array ["instagram_post","twitter_card",...],
  fit?: "cover"|"contain",
  brandTint?: boolean,
  edits?: {crop, rotate, brightness, saturation, ...}  // from manual editor
}
// Returns: { jobId, status, destination, promo, imageInfo, profiles, pollUrl }
```

#### **POST /api/audio**
```javascript
{
  audio: File,
  destination?: string,
  context?: string,
  profiles?: JSON array ["instagram_story","tiktok_audio",...],
  trimStart?: float,
  presets?: JSON array [15,30,45,60]  // durations in seconds
}
// Returns: { jobId, status, destination, promo, audioInfo, profiles, pollUrl }
```

#### **POST /api/auto**
```javascript
// NO file upload — zero-media generation
{
  destination?: string (smart default),
  theme?: string (from BRAND.content_themes, default "wildlife_spotlight"),
  context?: string,
  profiles?: array ["instagram_post","instagram_story",...] (defaults provided)
}
// Returns: { jobId, status, destination, theme, profiles, pollUrl }
// Runs async: writes complete result with stockCredit, query, promo details
```

#### **GET /api/giphy/search**
```javascript
Query: ?q=safari&destination=Masai%20Mara&limit=8
// Also auto-suggests queries for destination
// Returns: {
//   results: [{id, title, url, preview, mp4, width, height}, ...],
//   suggestions: ["masai mara", "wildebeest migration", ...],
//   query, destination
// }
```

#### **POST /api/giphy/use**
```javascript
{
  giphyId: string,
  destination?: string,
  context?: string
}
// Fetches from GIPHY, saves locally, generates caption
// Returns: { jobId, status, destination, promo, pollUrl }
```

### Output Routes (`src/routes/output.js`)

#### **GET /api/job/:jobId**
```javascript
// Poll any job to check status
// Returns: { status, jobId, mediaType, destination, promo, results, errors, ... }
// statuses: "processing" | "done" | "approved" | "rejected" | "error"
```

#### **POST /api/job/:jobId/approve**
```javascript
// Mark job as approved (ready for sharing)
// Returns: { success, jobId, status: "approved" }
```

#### **POST /api/job/:jobId/reject**
```javascript
{
  note?: string  // optional rejection reason
}
// Returns: { success, jobId, status: "rejected" }
```

#### **GET /api/files**
```javascript
// List all processed output media (jpg, png, mp4, gif, mp3, ogg)
// Returns: [{filename, url, size, created}, ...] sorted newest first
```

#### **GET /api/recent?n=20**
```javascript
// Get recent jobs from memory log
// Returns array: [{
//   jobId, mediaType, destination, platforms, outputs, caption, 
//   status, created, approvedAt, rejectedAt, ...
// }, ...]
```

#### **GET /api/job/:jobId/share**
```javascript
// Complete share package for a job
// Returns: {
//   caption, hook, hashtags, ctaBlock, destination, mediaType,
//   files: [{label, url, filename}, ...],
//   platform_copy: { "instagram_reel": {...}, "tiktok": {...}, ... }
// }
```

---

## 4. BACKEND ENGINES & UTILITIES

### 📹 **engines/video.js** — FFmpeg Video Processing
**Exports:**
- `probe(filePath)` → {duration, width, height, fps, size, bitrate}
- `processVariant(inputPath, platform, opts)` → {filename, label, downloadUrl}
- `processAll(inputPath, platforms[], opts)` → {results, errors}
- `extractThumbnail(filePath)` → file path

**Platforms:**
| Platform | Resolution | FPS | Allowed Durations | Default |
|----------|-----------|-----|-------------------|---------|
| instagram_reel | 1080×1920 | 30 | 15,30,60 | 30s |
| tiktok | 1080×1920 | 30 | 15,30,60 | 30s |
| instagram_post | 1080×1080 | 30 | 15,30 | 15s |
| youtube_short | 1080×1920 | 30 | 30,60 | 60s |
| facebook | 1280×720 | 30 | 30,60,120 | 60s |
| twitter | 1280×720 | 30 | 15,30 | 30s |

**Features:**
- Centre-clip strategy (smart trimming from middle of video)
- Safari color grading: brightness +0.03, contrast +1.05, saturation +1.1
- Sharpen + denoise (hqdn3d)
- Watermark: "LAVIRASAFARIS.COM" (proportional, bottom-right)

**UI Exposure:** ✅ Video tab (file upload, platform selection, trim, speed, quality)

---

### 🖼️ **engines/image.js** — Sharp Image Processing
**Exports:**
- `applyManualEdits(sharpInstance, edits)` — Manual crop, rotate, flip H/V, color adjustments
- `processImage(inputPath, profiles[], opts)` → {results, errors}

**Profiles:**
| Profile | Resolution | Aspect | Use Case |
|---------|-----------|--------|----------|
| instagram_post | 1080×1080 | 1:1 | Feed photo |
| instagram_story | 1080×1920 | 9:16 | Story |
| instagram_portrait | 1080×1350 | 4:5 | Carousel |
| facebook_feed | 1200×630 | ~2:1 | Feed |
| facebook_story | 1080×1920 | 9:16 | Story |
| twitter_card | 1200×628 | ~2:1 | Card |
| youtube_thumb | 1280×720 | 16:9 | Thumbnail |
| linkedin | 1200×627 | ~2:1 | Feed |
| original | null | — | No resize |

**Manual Edit Capabilities:**
- Crop (x, y, width, height)
- Rotate (0/90/180/270 + free angle)
- Flip Horizontal / Vertical
- Brightness (0.5–2.0, default 1.0)
- Saturation (0–3, default 1.0)
- Hue (-180–180, default 0)
- Contrast (linear adjustment)
- Sharpen (0.5–3, default 1.0)

**UI Exposure:** ✅ Photo tab (file upload, profile selection, fit mode) | ⚠️ Manual editor (rotate/flip buttons visible, color sliders not fully exposed)

---

### 🎵 **engines/audio.js** — FFmpeg Audio Processing
**Exports:**
- `probeAudio(filePath)` → {duration, codec, sampleRate, channels, size}
- `processAudio(inputPath, profiles[], opts)` → {results, errors}

**Profiles:**
| Profile | Format | Bitrate | Max Duration |
|---------|--------|---------|--------------|
| instagram_story | mp3 | 192k | 15s |
| tiktok_audio | mp3 | 192k | 60s |
| podcast_promo | mp3 | 128k | 60s |
| whatsapp | ogg | 64k | 30s |

**Duration Presets:** 15s, 30s, 45s, 60s (exact exports)

**Features:**
- Loudness normalization (I=-16)
- Fade in (0.3s) + fade out (0.8s) for smooth edges
- Trimming + exact duration control

**UI Exposure:** ✅ Audio tab (file upload, profile selection, trim start, preset buttons for 15/30/45/60s)

---

### 🎞️ **engines/giphy.js** — GIPHY Integration
**Exports:**
- `searchGiphy(query, limit)` → {results: [{id, title, url, preview, mp4, width, height}]}
- `fetchGiphy(giphyId, format)` → {file, filename}
- `suggestQueries(destination)` → array of destination-relevant queries

**UI Exposure:** ✅ GIF tab (search field, destination auto-fill, suggestion chips, grid selection, use button)

---

### 🤖 **engines/promo.js** — Zero-Media Auto Promo Generator
**Exports:**
- `generateAutoPromo({destination, theme, context, profiles, recentCaptions})` → {promo, results, stockCredit, query}
- `searchPexels(query, perPage)` → {photos: [{...}]}
- `downloadImage(url, destPath)` → file path
- `generateFallbackSVG(destination, theme, w, h)` → SVG buffer
- `brandImage(inputPath, profile, destination)` → branded JPG

**Pipeline:**
1. Search Pexels for stock image matching destination/theme
2. Download image
3. Apply brand treatment (watermark, color correction)
4. Generate caption via Claude AI
5. Create platform variants (instagram_post, instagram_story, facebook, twitter_card)

**Features:**
- Falls back to SVG graphic if no stock found
- Auto-selects unused destinations/themes (via memory log)
- Context-aware captions from recent history

**UI Exposure:** ✅ Auto Promo tab (destination, theme, context inputs, generate button)

---

### 🎨 **engines/compositor.js** — Brand Overlay System
**Exports:**
- `buildOverlaySVG(w, h, opts)` — Generates dynamic SVG overlay with:
  - Top bar: Logo + brand name + tagline
  - Hook section: Centre promo text
  - Bottom bar: Contact info (phone, website, Instagram)
  - Promo badge, destination, date
- `compositeOnImage(imagePath, overlayOpts)` → branded image
- `compositeOnVideo(inputPath, overlayOpts)` → video with overlay

**UI Exposure:** ❌ No direct UI controls (used internally by video/photo/promo engines)

---

### 🏷️ **engines/card-templates.js** — Card Template Engine
**Exports:**
- `heroDestinationSVG(w, h, {destination, hook, highlight, packageName, packageDuration})`
- `packageCard()` — Safari package offering card
- `testimonialCard()` — Guest feedback card
- `priceCard()` — Pricing tier card
- All output as branded JPG via Sharp

**Card Templates Available:**
1. Hero Destination Card (1080×1080 or 1080×1920)
2. Safari Package Card
3. Testimonial Card
4. Price/Tier Card
5. Twin Destination Card
6. Activity Highlight Card

**UI Exposure:** ❌ No direct UI controls (not integrated into frontend)

---

### 📚 **engines/media-library.js** — Media Indexing & Search
**Exports:**
- `scanDirectory(dir)` → [{path, filename, size, ext, mtime}]
- `autoTag(filename, width, height)` → {tags: [], destination}
- `getRandomByTag(tag)` → random file matching tag
- `getByDestination(destination)` → files tagged for that destination
- `buildLibrary()` → full JSON index

**Tag System:**
- Auto-tagging by filename patterns: flamingo, elephant, masai mara, sunset, etc.
- Dimension-based tags: portrait, landscape, square, high-res
- Destination mapping: "masai mara" → Masai Mara, "amboseli" → Amboseli, etc.

**UI Exposure:** ⚠️ Partial (Gallery tab shows media library, but no tag search, no destination filtering)

---

## 5. MISMATCH ANALYSIS

### ❌ **UI Controls WITH Missing/Hidden Backend Routes**

| UI Control | Function Called | Expected Route | Status |
|-----------|-----------------|-----------------|--------|
| 🗑 Clean Old (Gallery) | `cleanupOldFiles()` | *No route found* | ❌ |
| ⚡ Generate Now (Scheduler) | `triggerDailyPromo()` | POST /api/schedule? | ❌ |
| ↻ Refresh (Scheduler) | `loadSchedule()` | GET /api/schedule? | ❌ |
| ✓ Approve & Post (Today) | `approveTodayPromo()` | *Uses approve but auto-posts?* | ⚠️ |

**Issue:** 3 UI functions lack visible backend endpoints.

---

### ❌ **Backend Utilities WITH Missing/Hidden UI Controls**

| Engine | Feature | Implemented In | UI Status |
|--------|---------|-----------------|-----------|
| **card-templates.js** | All 6 card types | Full SVG templates | ❌ No UI |
| **compositor.js** | Full overlay system | Complete pipeline | ❌ No UI |
| **media-library.js** | Tag-based search | Scanning + filtering | ⚠️ Minimal UI |
| **media-library.js** | Destination filtering | Query functions | ❌ No UI |
| **image.js** | Color sliders | applyManualEdits() | ⚠️ Limited (no brightness/saturation UI buttons) |
| **image.js** | Sharpen control | Modulate filter | ❌ No UI |
| **audio.js** | Custom trim points | trim options | ⚠️ Trim start exists but not trim end |

**Issue:** Multiple production-ready engines have no user-facing controls.

---

### ⚠️ **Partial/Incomplete Connections**

| Feature | UI | Backend | Gap |
|---------|----|---------|----|
| Photo manual editor | Rotate/Flip buttons visible | Full color edit support in code | Sliders not exposed in UI |
| Audio trim | Start point only | Supports start + end | No UI for trim end/custom duration |
| Platform selection (Photo) | Auto-defaults shown | User can override via profiles | Limited visibility of default logic |
| Caption editing | Output shows caption | No PUT /api/job/:jobId/caption route | Can't save edits |

---

## 6. MISSING BACKEND ENDPOINTS (Implied by UI)

```javascript
// Scheduler integration (implied by UI)
POST   /api/schedule/generate     // → triggerDailyPromo()
GET    /api/schedule              // → loadSchedule()
POST   /api/schedule/save         // Save schedule settings (not visible)

// File management
DELETE /api/files/old             // → cleanupOldFiles()
DELETE /api/outputs/:filename     // Delete individual file

// Caption editing
PUT    /api/job/:jobId/caption    // Edit + save new caption
GET    /api/job/:jobId/caption    // Get current caption

// Post packaging
POST   /api/job/:jobId/package    // → makeReadyToPost()
```

---

## 7. SUMMARY TABLE

### ✅ **Well-Connected Features** (UI ↔ Backend ↔ Engine)
- Video processing (tab → submit → POST /api/video → video.js → FFmpeg)
- Photo processing (tab → submit → POST /api/photo → image.js → Sharp)
- Audio processing (tab → submit → POST /api/audio → audio.js → FFmpeg)
- GIF search & use (tab → search/select → GET/POST /api/giphy/\* → giphy.js)
- Auto promo (tab → submit → POST /api/auto → promo.js → Pexels + Claude)
- Job approval (output → approve → POST /api/job/:jobId/approve → memory.log)

### ⚠️ **Partially Connected**
- Scheduler (UI exists, backend routes unclear)
- Media library gallery (UI shows files, no tag/destination filtering)
- Manual image editor (rotate/flip work, color sliders missing)
- Caption editing (shown in output, not saved to backend)

### ❌ **Unconnected** (Backend exists, no UI)
- Card template generation (full engine, zero UI)
- Compositor overlays (full engine, zero UI)
- Media library tag search (full engine, no UI)
- Color adjustment sliders (full code, no UI buttons)
- Promo caption editing/saving (no backend endpoint)

---

## Recommendations

### Quick Wins (UI ← → Backend)
1. Add PUT `/api/job/:jobId/caption` to save edited captions
2. Expose color adjustment sliders in Photo's manual editor
3. Add DELETE `/api/files/old` endpoint for cleanup button
4. Create POST `/api/schedule/generate` for daily promo trigger

### Medium Investment (Engine ← → UI)
1. Add card template builder UI (use existing card-templates.js)
2. Expose media library tag/destination filters in Gallery tab
3. Add audio trim-end control (currently only trim-start)
4. Create scheduler view with save/edit (POST/PUT /api/schedule)

### Strategic (New UI + Engine)
1. Build "Ready-to-Post" UI using existing compositor + card-templates
2. Create batch processing mode (upload multiple files, auto-process all)
3. Add custom theme builder (design new compositor overlays)

