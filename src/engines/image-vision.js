// src/engines/image-vision.js — Claude Vision analysis pipeline
'use strict';
const fs  = require('fs');
const cfg = require('../config');

const VISION_PROMPT = `You are analysing a background photograph for a safari marketing post.
Return ONLY a JSON object with these exact keys — no prose, no markdown fences:

{
  "entities":     [],
  "background":   "savanna",
  "weather":      "sunny",
  "timeOfDay":    "morning",
  "season":       "dry",
  "mood":         "adventure",
  "subjectRegion":"center",
  "clearRegions": ["bottom_left","bottom_right"],
  "primaryColor": "#2D6A4F",
  "safeTextZone": "bottom_left",
  "confidence":   0.85
}

Fill each field based on what you actually see:
- entities: visible animals, people, vehicles, landmarks
- background: savanna|forest|mountain|water|sky|camp|vehicle_interior
- weather: sunny|overcast|golden_hour|blue_hour|rain|misty
- timeOfDay: sunrise|morning|afternoon|sunset|night
- season: dry|wet|migration|post_rain
- mood: adventure|luxury|wildlife|family|conservation
- subjectRegion: top_left|top_center|top_right|middle_left|center|middle_right|bottom_left|bottom_center|bottom_right
- clearRegions: array of regions with no important content (same vocab as subjectRegion)
- primaryColor: dominant hex color
- safeTextZone: best region for text overlay without blocking the main subject
- confidence: float 0–1`;

function getDefaultAnalysis() {
  return {
    entities:      [],
    background:    'savanna',
    weather:       'sunny',
    timeOfDay:     'morning',
    season:        'dry',
    mood:          'adventure',
    subjectRegion: 'center',
    clearRegions:  ['bottom_left', 'bottom_right', 'top_right'],
    primaryColor:  '#2D6A4F',
    safeTextZone:  'bottom_left',
    confidence:    0.0,
    analysed:      false,
  };
}

// Simple cache: imagePath → analysis (in-memory, session-lived)
const _cache = new Map();

async function analyseImage(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return getDefaultAnalysis();
  if (_cache.has(imagePath)) return _cache.get(imagePath);

  const apiKey = cfg.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[vision] No ANTHROPIC_KEY — using defaults');
    return getDefaultAnalysis();
  }

  try {
    const imageData = fs.readFileSync(imagePath);
    const base64    = imageData.toString('base64');
    const mediaType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text',  text: VISION_PROMPT },
          ],
        }],
      }),
    });

    const json = await resp.json();
    const raw  = json.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    const result  = { ...getDefaultAnalysis(), ...parsed, analysed: true };

    _cache.set(imagePath, result);
    return result;
  } catch (err) {
    console.error('[vision] Analysis failed:', err.message);
    return getDefaultAnalysis();
  }
}

// Map safeTextZone region string → SVG anchor coords
function zoneToCoords(zone, w, h, padding = 40) {
  const map = {
    top_left:      { x: padding,         y: padding + 80 },
    top_center:    { x: w / 2,           y: padding + 80, anchor: 'middle' },
    top_right:     { x: w - padding,     y: padding + 80, anchor: 'end' },
    middle_left:   { x: padding,         y: Math.round(h * 0.45) },
    center:        { x: w / 2,           y: Math.round(h * 0.50), anchor: 'middle' },
    middle_right:  { x: w - padding,     y: Math.round(h * 0.45), anchor: 'end' },
    bottom_left:   { x: padding,         y: Math.round(h * 0.70) },
    bottom_center: { x: w / 2,           y: Math.round(h * 0.70), anchor: 'middle' },
    bottom_right:  { x: w - padding,     y: Math.round(h * 0.70), anchor: 'end' },
  };
  return map[zone] || map['bottom_left'];
}

module.exports = { analyseImage, zoneToCoords, getDefaultAnalysis };
