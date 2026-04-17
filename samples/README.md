# Lavira Media Engine — Sample Media Library

This directory contains **test and reference media** for the MCP server, scheduler, and auto-promo generation. All samples are organized by destination and media type.

## Directory Structure

```
samples/
├── images/
│   ├── destinations/
│   │   ├── masai-mara/      # Masai Mara safari images (high-res for processing)
│   │   ├── amboseli/        # Amboseli (elephants, dust storms)
│   │   ├── mt-kenya/        # Mt Kenya scenes (mountain, altitude)
│   │   ├── nakuru/          # Lake Nakuru (flamingos, birdlife)
│   │   ├── ol-pejeta/       # Ol Pejeta Conservancy (rhinos, wildlife)
│   │   ├── samburu/         # Samburu Reserve (arid, camels, giraffes)
│   │   └── tsavo/           # Tsavo ecosystem (vast, predators)
│   └── themes/
│       ├── sunrise-sunset/  # Golden hour media
│       ├── wildlife-action/ # Animals in motion
│       ├── cultural/        # Maasai people, traditions
│       └── conservation/    # Protected space stories
│
├── videos/
│   ├── destinations/
│   │   ├── masai-mara/      # Short clips (30-60s reels)
│   │   └── [other destinations]/
│   └── clips/
│       ├── b-roll/          # General reusable B-roll (transitions, pans)
│       ├── animals/         # Wildlife footage
│       └── storytelling/    # Narrative-style clips
│
└── audio/
    ├── nature/              # Ambient wildlife sounds
    ├── music/               # Royalty-free safari music
    └── voiceovers/          # Sample narration (English)
```

## Usage

### For Web Interface
- Upload media from **samples/** instead of local drive for quick testing
- Example: `file:///home/kamau/lavira-media-engine/samples/images/destinations/masai-mara/[filename]`

### For MCP Server (Claude Desktop)
The MCP server reads from `samples/` when processing:
- **Auto-promo generation** can fall back to samples if Pexels fails
- **Reference tools** suggest samples for destinations
- **Batch processing** can iterate all samples in a destination folder

### For Scheduler
Daily prompts can reference sample media:
```javascript
const samplePath = '/home/kamau/lavira-media-engine/samples/images/destinations/masai-mara/';
// Use a random sample when auto-selecting destination
```

## Adding Samples

### Images
1. Place in `samples/images/destinations/[destination]/` or `samples/images/themes/[theme]/`
2. Recommended: 1080×1080 JPG minimum, ~500KB
3. Name by subject: `elephant-herd.jpg`, `sunset-acacia.jpg`

### Videos
1. Place in `samples/videos/destinations/[destination]/` or `samples/videos/clips/[type]/`
2. Recommended: 1080×1920 MP4, 15-60 seconds, H.264
3. Name by scene: `wildebeest-river.mp4`, `b-roll-pan.mp4`

### Audio
1. Place in `samples/audio/[category]/`
2. Format: MP3 320k or WAV 48kHz
3. Include: nature ambience, royalty-free music (with attribution), sample narration

## Integration Points

### 1. **MCP Tool: `get_sample_media`** (New)
```javascript
// Returns list of samples by destination/theme
const samples = await mcpClient.callTool('get_sample_media', {
  destination: 'masai_mara',
  type: 'image'  // or 'video', 'audio'
});
```

### 2. **Web Interface Gallery**
- Toggle **"Show Samples"** to display samples alongside outputs
- Quick-test: Process sample → Download → Verify platform exports before using production media

### 3. **Auto-Promo Fallback**
When Pexels stock search fails:
```javascript
// In engines/promo.js
const fallback = await getSampleImage(destination);  // Try samples first
```

### 4. **Scheduler Daily Posts**
```javascript
// In scheduler/index.js
const dailySample = getRandomSample(selectedDestination);
const job = await processMedia(dailySample, selectedDestination);
```

## MCP Tools for Sample Management

### `list_sample_media`
```
Returns: {
  destinations: {
    masai_mara: {images: 12, videos: 5, audio: 3},
    amboseli: {images: 8, videos: 2, audio: 2}
  },
  totalSamples: 156
}
```

### `get_sample_by_destination`
```
Input: {destination: "masai_mara", limit: 5}
Returns: [{filename, url, type, resolution}, ...]
```

### `process_sample_media`
```
Input: {destination: "masai_mara", type: "image", platform: "instagram_reel"}
Returns: {jobId, results}  // Processes first sample as test
```

## Best Practices

1. **Organize strictly by destination** — helps MCP select contextually correct media
2. **Tag files with content** — e.g., `masai-mara_elephants_herd.jpg` not just `photo.jpg`
3. **Include diverse types** — portraits, landscape, action, sunrise/sunset per destination
4. **Keep under 100MB total** — samples should be quick to load, not archive-size
5. **Attribution in filename** — e.g., `tsavo_safari_by-john-doe.jpg`

## License & Attribution

Samples should be:
- ✅ Royalty-free or properly licensed
- ✅ Public domain (Unsplash, Pexels, Pixabay downloads)
- ✅ Attribution included in filename if required
- ❌ Never copyrighted professional work without permission

---

**Last Updated:** April 12, 2026
**Managed by:** Lavira Media Engine v3.2
