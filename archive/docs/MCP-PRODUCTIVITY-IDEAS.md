# MCP Tool Enhancement Ideas & Productivity Recommendations

**Document Version:** 3.2  
**Date:** April 12, 2026  
**Purpose:** Future-ready MCP tools to maximize productivity with Lavira Media Engine

---

## Current State

✅ **11 Core Processing Tools**
- `process_video`, `process_image`, `process_audio`
- `search_giphy`, `use_giphy`
- `generate_auto_promo`, `search_stock_images`
- `ask_claude`
- `generate_promo_package`, `get_destinations_to_feature`, `get_safari_packages`

✅ **4 Job Management Tools**
- `make_ready_to_post`, `build_post_package`
- `approve_job`, `reject_job`, `get_share_package`
- `get_job_status`

✅ **12 NEW Tools Added (This Session)**
- `post_to_instagram`, `post_to_tiktok`, `post_to_facebook`, `publish_job`
- `generate_card_template`, `apply_overlay`
- `list_sample_media`, `get_sample_media`, `process_sample_as_test`
- `batch_process_samples`, `schedule_post`

**Total Tools Now: 27+**

---

## Suggested Future MCP Tools (Productivity Tier 2)

### 1. **Analytics & Performance Tracking**

#### `get_post_analytics`
*Status: Currently unavailable*

**Goal:** Fetch Instagram/TikTok analytics for posted content (impressions, engagement, saves, shares).

**Proposed Implementation:**
```javascript
mcpClient.callTool('get_post_analytics', {
  platform: 'instagram',  // or 'tiktok', 'facebook'
  timeRange: 'week',  // '24h', 'week', 'month'
  destination: 'Masai Mara',  // Optional filter
  limit: 10  // Top N posts
});
// Returns:
// {
//   posts: [
//     {
//       mediaId: '...',
//       destination: 'Masai Mara',
//       caption: '...',
//       impressions: 4523,
//       engagement: 287,
//       engagementRate: 6.3,
//       saves: 45,
//       shares: 12,
//       postDate: '2026-04-12T14:32:00Z'
//     }
//   ],
//   topPerformer: {...},
//   avgEngagementRate: 5.8
// }
```

**Benefit:** Claude can analyze which destinations/themes perform best and recommend scheduling more of them.

---

#### `get_top_performing_content`
Identify best-performing posts across all platforms.

**Implementation:**
```javascript
const top = await mcpClient.callTool('get_top_performing_content', {
  timeframe: 'month',
  metric: 'engagement_rate',  // or 'impressions', 'saves'
  limit: 5
});
// Claude recommendation: "Amboseli content gets 3x more engagement than Mt Kenya"
```

---

### 2. **Caption & Content Optimization**

#### `refine_caption`
Use Claude to improve/rewrite captions for better engagement.

**Proposed Implementation:**
```javascript
const refined = await mcpClient.callTool('refine_caption', {
  caption: 'Beautiful sunset at Amboseli',
  style: 'emotional',  // 'emotional', 'action', 'educational', 'story'
  platforms: ['instagram', 'tiktok'],
  destination: 'Amboseli',
  targetAudience: 'safari-enthusiasts'
});
// Returns: {improved: "Witness the golden hour glow as elephants roam the plains...", hook: "..."
```

---

#### `generate_carousel_captions`
Create captions for multi-image carousel posts.

**Implementation:**
```javascript
const carousel = await mcpClient.callTool('generate_carousel_captions', {
  destination: 'Masai Mara',
  imageCount: 5,
  theme: 'migration_story',
  captionTone: 'narrative'  // sequential story
});
// Returns: {captions: ["Slide 1: ...", "Slide 2: ...", ...]}
```

---

### 3. **Hashtag & Metadata Management**

#### `suggest_hashtags_by_performance`
Recommend hashtags based on historical data.

**Implementation:**
```javascript
const tags = await mcpClient.callTool('suggest_hashtags_by_performance', {
  destination: 'Masai Mara',
  platform: 'instagram',
  postType: 'video',
  experienceLevel: 'high'
});
// Returns: [
//   {tag: '#masaimarasafari', avgImpressionsIfUsed: 12500, frequency: 'use always'},
//   {tag: '#wildlifeconservation', avgEngagement: 8.2, frequency: 'use 2x/week'},
//   ...
// ]
```

---

### 4. **Content Calendar & Planning**

#### `plan_weekly_content`
Generate a 7-day content plan using sample media and scheduler.

**Proposed Implementation:**
```javascript
const plan = await mcpClient.callTool('plan_weekly_content', {
  startDate: '2026-04-14T06:00:00Z',
  destinations: ['Masai Mara', 'Amboseli', 'Samburu'],
  contentTypes: ['video', 'image', 'carousel'],
  postsPerDay: 1,
  platforms: ['instagram', 'tiktok']
});
// Returns:
// {
//   schedule: [
//     {date: '2026-04-14', destination: 'Masai Mara', type: 'video', 
//      mediaUrl: '/samples/videos/...', scheduledTime: '06:00'},
//     {date: '2026-04-15', destination: 'Amboseli', type: 'image',
//      mediaUrl: '/samples/images/...', scheduledTime: '06:00'},
//     ...
//   ],
//   totalScheduled: 7,
//   estimatedReach: 45000
// }
```

---

#### `get_scheduling_recommendations`
Based on analytics, recommend optimal posting times.

**Implementation:**
```javascript
const schedule = await mcpClient.callTool('get_scheduling_recommendations', {
  platform: 'instagram',
  audience: 'safari-enthusiasts',
  timezone: 'EAT'
});
// Returns: {
//   bestTimes: ['06:00', '12:30', '18:00'],
//   worstTimes: ['02:00', '03:00'],
//   recommendations: "Post between 6-10am for East Africa audience"
// }
```

---

### 5. **Bulk Operations & Workflows**

#### `create_content_variant`
Auto-generate multiple format variants from one asset.

**Implementation:**
```javascript
const variants = await mcpClient.callTool('create_content_variant', {
  sourceJobId: 'vid_a45bb017',
  variants: [
    {type: 'short-form', duration: 15},     // TikTok size
    {type: 'story', aspect: '9:16'},        // Instagram Story
    {type: 'card', template: 'hero_destination'},  // Card overlay
  ]
});
// Returns: {variants: [{type, jobId, downloadUrl}, ...]}
```

---

#### `batch_apply_branding`
Apply overlays/branding to multiple files at once.

**Implementation:**
```javascript
const branded = await mcpClient.callTool('batch_apply_branding', {
  jobIds: ['img_026b001a', 'img_c3c1b582', 'img_ebfe9b9f'],
  overlay: 'standard',
  hook: 'Experience Lavira Safaris',
  promoType: 'Wildlife Package'
});
// Returns: {processed: 3, results: [{jobId, url}, ...]}
```

---

### 6. **Multi-Destination Intelligence**

#### `rank_destinations_by_engagement`
Analyze cross-destination performance.

**Implementation:**
```javascript
const ranking = await mcpClient.callTool('rank_destinations_by_engagement', {
  timeframe: 'month',
  metric: 'engagement_rate'
});
// Returns: [
//   {rank: 1, destination: 'Masai Mara', engagementRate: 7.2, postCount: 8},
//   {rank: 2, destination: 'Amboseli', engagementRate: 5.8, postCount: 6},
//   ...
// ]
```

---

#### `recommend_content_mix`
Suggest optimal mix of destinations/themes based on performance.

**Implementation:**
```javascript
const mix = await mcpClient.callTool('recommend_content_mix', {
  objectiveType: 'maximize_engagement',  // or 'balanced', 'maximize_reach'
  channelCount: 3
});
// Returns: {
//   recommendation: "50% Masai Mara, 30% Amboseli, 20% Mt Kenya",
//   reasoning: "Masai Mara 3x more engagement; diversify to prevent saturation",
//   ratio: {masai_mara: 0.5, amboseli: 0.3, mt_kenya: 0.2}
// }
```

---

### 7. **Story/Narrative Building**

#### `create_content_narrative`
Build a multi-post story arc across 5-7 days.

**Implementation:**
```javascript
const story = await mcpClient.callTool('create_content_narrative', {
  destination: 'Masai Mara',
  theme: 'wildebeest_migration',
  chapters: 5,  // 5-day story arc
  mediaPerChapter: 2,  // 2 posts per day
  usePublishedContent: true  // Reference past published posts
});
// Returns: {
//   narrative: {
//     title: "The Great Migration: A 5-Day Safari Journey",
//     chapters: [
//       {day: 1, hook: "The Journey Begins...", posts: [{content}, ...]},
//       {day: 2, hook: "Crossing the Plains...", posts: [...]},
//       ...
//     ]
//   },
//   scheduledTime: "2026-04-18T06:00:00Z"
// }
```

---

### 8. **Influencer/Brand Collaborations**

#### `generate_partnership_post`
Create co-branded content for influencer partnerships.

**Implementation:**
```javascript
const collab = await mcpClient.callTool('generate_partnership_post', {
  partnerBrand: 'WWF',
  destination: 'Amboseli',
  focus: 'conservation',
  brandColor: 'green'  // Partner brand color
});
// Returns: {
//   card: '/outputs/collab_wwf_amboseli.jpg',
//   caption: 'In partnership with WWF...',
//   brandedOverlay: true
// }
```

---

### 9. **Quick Commands & Shortcuts**

#### `quick_post`
One-line posting without full workflow.

**Implementation:**
```javascript
// Instant: Process sample + Approve + Post
const posted = await mcpClient.callTool('quick_post', {
  destination: 'Masai Mara',
  mediaType: 'image',
  platforms: ['instagram', 'tiktok'],
  caption: 'Morning in Masai Mara 🦁'
});
// Returns: {success: true, jobId, publishedTo: [...]}
```

---

#### `repost_best_performer`
Auto-repost highest-engagement content with new caption/timing.

**Implementation:**
```javascript
const reposted = await mcpClient.callTool('repost_best_performer', {
  destination: 'Masai Mara',
  timeframe: 'month',
  platforms: ['instagram', 'tiktok'],
  newCaption: 'Throwback: one of our best-loved posts! 🔥'
});
// Returns: {repostedJobId, originalDate, engagementThen, newPostTime}
```

---

### 10. **Custom Reporting**

#### `generate_monthly_report`
Comprehensive monthly analytics + recommendations.

**Implementation:**
```javascript
const report = await mcpClient.callTool('generate_monthly_report', {
  month: '2026-04',
  platforms: ['instagram', 'tiktok', 'facebook'],
  includeRecommendations: true
});
// Returns: {
//   summary: {
//     totalPosts: 28,
//     totalReach: 120000,
//     avgEngagementRate: 6.5
//   },
//   topDestinations: [...],
//   topThemes: [...],
//   recommendations: [
//     "Increase Samburu content (recently underperforming)",
//     "Peak engagement times: 6am-10am EAT",
//     "Carousel posts 2x more engagement than single images"
//   ],
//   growthTrend: "↑ 12% vs last month"
// }
```

---

## Implementation Priority Matrix

| Tool | Effort | Impact | Priority | Timeline |
|------|--------|--------|----------|----------|
| `get_post_analytics` | Medium | High | P1 | Week 1-2 |
| `refine_caption` | Low | High | P1 | Week 1 |
| `plan_weekly_content` | Medium | High | P1 | Week 2 |
| `suggest_hashtags_by_performance` | Low | Medium | P2 | Week 2 |
| `create_content_variant` | High | High | P2 | Week 3-4 |
| `rank_destinations_by_engagement` | Medium | Medium | P2 | Week 3 |
| `generate_monthly_report` | Medium | High | P1 | Week 2 |
| `quick_post` | Low | High | P1 | Week 1 |
| `batch_apply_branding` | Low | Medium | P2 | Week 2 |
| `repost_best_performer` | Low | Medium | P3 | Week 4 |

---

## Productivity Gains Summary

### Current State (After This Session)
- **27+ MCP tools** covering publishing, templating, sampling
- **Direct posting** to Instagram, TikTok, Facebook
- **Batch processing** with sample media
- **Scheduler integration** with approval workflow
- **Estimated time:** 5-10 minutes per 1 social post (design, caption, post)

### With Future Tools
- **P1 Tools (Weeks 1-2):** **5-7 minute** per post (analytics-driven, caption optimization, scheduling smart)
- **All Tools Implemented:** **2-3 minutes** per post (full automation, 1-click workflows, AI-driven planning)

### Concrete Productivity Gains

**Scenario: Daily Content Calendar (7 posts/week)**

✅ **Current (Post-Session):**
- Design + Caption: 5 min × 7 = 35 min
- Posting: 2 min × 7 = 14 min
- **Total: ~50 minutes/week**

🚀 **After P1 Tools:**
- Plan week: 10 min (once)
- Captions: 2 min × 7 = 14 min (Claude refines)
- Posting: 1 min × 7 = 7 min (1-click)
- **Total: ~31 minutes/week (38% time savings)**

🔥 **After Full Suite:**
- Plan month: 15 min (once)
- Auto-generate & schedule 28 posts: 5 min (batch + plan_weekly)
- Monitor analytics: 10 min (monthly)
- **Total: ~30 minutes/month for 28 posts (88% time savings)**

---

## Multi-Touch Channel Strategy with MCP

### Channel Optimization Loop

```
1. [Daily] Quick Post
   └→ Sample media → Auto-caption → Post to 3 platforms (5 min)

2. [Weekly] Plan Content
   └→ Analytics review → Recommended destinations → Schedule 7 posts (10 min)

3. [Bi-Weekly] Batch Processing
   └→ Top 5 performers + New destination → Create variants → Schedule (15 min)

4. [Monthly] Strategic Review
   └→ Full analytics → Content mix recommendations → Update focus areas (30 min)

Total: ~5 hours/month for full 3-channel presence → 84 posts with optimal timing
```

---

## Integration with Existing Lavira Ecosystem

### Data Flow
```
┌──────────────────────────────────────────┐
│    MCP REQUEST (Claude Desktop)          │
│  "Post this week's Masai Mara content"   │
└────────────┬─────────────────────────────┘
             │
      ┌──────▼──────────────────┐
      │  New Tool: Plan          │
      │  Weekly Content          │
      └────────┬─────────────────┘
               │
      ┌────────▼──────────────────────────────────┐
      │  Existing Tools: Batch Process + Schedule  │
      │  (batch_process_samples, schedule_post)    │
      └────────┬──────────────────────────────────┘
               │
      ┌────────▼────────────────────┐
      │  Analytics:                  │
      │  Track impressions,          │
      │  engagement, saves           │
      └────────┬─────────────────────┘
               │
      ┌────────▼──────────────────────────────┐
      │  Claude Assistant: Recommend Mix      │
      │  "Do more Masai Mara, less Mt Kenya"  │
      └────────┬──────────────────────────────┘
               │
      ┌────────▼──────────────────┐
      │  Next week's plan adjusted │
      │  More optimal mix          │
      └───────────────────────────┘
```

---

## Recommended Implementation Path

### Phase 1: Analytics & Intelligence (Weeks 1-2)
- `get_post_analytics` ← **Highest ROI**
- `refine_caption`
- `quick_post` ← **Enables lazy posting**
- `plan_weekly_content`

### Phase 2: Content Multiplication (Weeks 3-4)
- `create_content_variant`
- `batch_apply_branding`
- `suggest_hashtags_by_performance`
- `rank_destinations_by_engagement`

### Phase 3: Strategic Automation (Weeks 5-6)
- `generate_monthly_report`
- `recommend_content_mix`
- `repost_best_performer`
- `create_content_narrative`

---

## Getting Started Today

Even without future tools, you can:**now**:

```javascript
// Workflow: Process + Post + Analytics
//using EXISTING tools

// 1. Process sample media
const job = await mcpClient.callTool('process_sample_as_test', {
  destination: 'Masai Mara'
});

// 2. Approve + Publish
await mcpClient.callTool('approve_job', {jobId: job.jobId});
await mcpClient.callTool('publish_job', {
  jobId: job.jobId,
  platforms: ['instagram', 'tiktok']
});

// 3. View outputs
const recent = await mcpClient.callTool('list_recent_jobs', {limit: 5});
console.log('Just posted:', recent[0]);
```

**That's a complete posting workflow in 30 seconds with Claude.**

---

## Questions for Your Feedback

1. **Which of these tools would be most valuable?**
   - Analytics-driven posting (understand what works)?
   - Content multiplication (more content, less effort)?
   - Planning & scheduling (automate workflow)?

2. **What's your biggest bottleneck?**
   - Time to create captions?
   - Scheduling at optimal times?
   - Choosing which destinations/themes to feature?

3. **Integration priorities?**
   - Instagram focus?
   - Multi-platform consistency?
   - Analytics-based optimization?

---

**Document prepared by:** AI Assistant  
**For:** Lavira Media Engine MCP Ecosystem  
**Status:** Ready for implementation roadmap  
**Last Updated:** April 12, 2026
