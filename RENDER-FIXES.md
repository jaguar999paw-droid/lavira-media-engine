# Lavira Media Engine — Render Quality Fix Roadmap
_Synthesized from live code audit + reported UX issues — April 2026_

---

## Issues & Fixes

### P0 CRITICAL: No Logo
- compositor.js draws letter 'L' in circle — real SVG never fetched
- Fix: NEW logo-loader.js downloads/caches SVG→PNG; compositor composites it

### P0 CRITICAL: Text/Element Collisions
- hookSection rect at h*0.42→h*0.57 covers wildlife subject (center)
- destSection at h*0.56 overlaps hook rect independently
- promoSection + dateSection both below topBar with no collision guard
- Fix: Hook→lower-third h*0.72-0.82, dest inside hook band, date→topBar right

### P0: Text/Element Scaling
- titleFSize based on topBarH (px-relative), breaks at non-1080 sizes
- Fix: Scale all fonts to w-relative units

### P1 HIGH: Deep Shadows + Oversized Hook Padding
- Video: shadowx=2:shadowy=2 too heavy. Hook rect: 15% height covers scenery
- Fix: shadow→1:1, box=1:boxcolor=black@0.35. Hook rect→10% height, opacity 0.62

### P1 HIGH: Wrong Brand Dark Color + Bars Too Opaque
- compositor uses #0A1612, brand spec is #1B2830
- Top bar 0.85, bottom 0.88 — near solid, blocks view
- Fix: correct dark color; topBar→0.80, botBar→0.82, minimal→0.65

### P1 HIGH: Same Headings Everywhere
- Every post: BRAND.name / BRAND.tagline — zero variation
- Fix: headingStyle param: brand|destination|package|usp (rotates per content type)

### P2 MEDIUM: Watermarks Too Visible
- card-templates logoPill opacity 0.82, familyB header 0.95
- Fix: logoPill→0.68, familyB header→0.88

### P2 MEDIUM: Single Output Directory
- All jobs (MCP + UI) write to same outputs/
- Fix: outputs/mcp/ for MCP jobs, outputs/ui/ for Interface jobs

---

## File Change Map

| File | Action | Priority |
|------|--------|----------|
| src/engines/logo-loader.js | NEW — download/cache/serve logo PNG | P0 |
| src/engines/compositor.js | PATCH — logo, layout reflow, colors, heading variants | P0 |
| src/config.js | PATCH — MCP_OUTPUTS_DIR, UI_OUTPUTS_DIR | P1 |
| src/server.js | PATCH — mkdir + serve both output dirs | P1 |
| src/engines/card-templates.js | PATCH — watermark opacity, brand dark color | P2 |

---

## Revised SVG Layout

```
 0%  [REAL LOGO PNG]  LAVIRA SAFARIS  [DEST/PKG]   <- Top bar
10%  [promo badge - small, top-left]                <- optional
     ..........HERO CONTENT CLEAR...................  14-72%
72%  HOOK TEXT AMBER — lower third                  <- hook band
     📍 Destination
82%  gap
87%  📞 +254...  🌐 lavirasafaris.com               <- contacts
100%
```

---
_Last updated: April 2026_
