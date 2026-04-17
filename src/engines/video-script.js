// src/engines/video-script.js — Claude-powered structured video script generation
// Generates multi-part scripts with timing, cues, and B-roll recommendations
'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const cfg = require('../config');
const BRAND = require('../orchestrator/brand');

async function generateVideoScript({ destination, theme = 'wildlife_spotlight', duration = 30, context = '', recentScripts = [] }) {
  if (!cfg.ANTHROPIC_KEY) {
    return generateFallbackScript(destination, duration);
  }

  try {
    const client = new Anthropic({ apiKey: cfg.ANTHROPIC_KEY });

    const destInfo = BRAND.destination_profiles?.[destination] || {};
    const pkg = BRAND.safari_packages?.find(p => p.destinations?.includes(destination));

    const systemPrompt = `You are a professional video script writer for ${BRAND.name}, a premium safari company.
Brand: ${BRAND.tagline}
Website: ${BRAND.website} | Phone: ${BRAND.phone}
Tone: premium, adventurous, aspirational, grounded in authentic African nature.

CRITICAL: You must output ONLY valid JSON with no preamble. Structure:
{
  "hook": "6-8 word opening that grabs attention (no quotes)",
  "bodyParts": [
    { "section": "B-roll cue", "duration": 5, "text": "voiceover text for this 5s beat" },
    { "section": "B-roll cue", "duration": 7, "text": "voiceover text" }
  ],
  "cta": "15-20 word call-to-action mentioning phone/website",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "brollRecommendations": ["golden hour", "animal behavior", "landscape wide"],
  "musicMood": "adventurous|peaceful|intense|triumphant",
  "totalDuration": 30,
  "destination": "${destination}"
}

Rules:
- Hook is quick, punchy, emotional
- Body parts total duration should slightly under total (leaving room for intro/outro fade)
- Text is conversational but premium, 25-35 words per 5-7s section
- Do NOT include destination in opening — save it for CTA
- Always mention "${BRAND.name}" in CTA
- Always include website and phone in CTA`;

    const userPrompt = `Write a ${duration}s Instagram Reel / social video script for ${destination}.
Theme: ${theme}
${destInfo.wildlife ? `Key wildlife: ${destInfo.wildlife.slice(0, 3).join(', ')}` : ''}
${pkg ? `Featured package: ${pkg.name} (${pkg.duration})` : ''}
${context ? `Additional context: ${context}` : ''}

Generate ONLY the JSON object with no extra text, markdown, or code blocks.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const responseText = msg.content[0].text.trim();
    
    // Extract JSON from response (in case Claude adds backticks despite instructions)
    let jsonStr = responseText;
    if (responseText.includes('{')) {
      jsonStr = responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1);
    }

    const script = JSON.parse(jsonStr);

    return {
      ...script,
      destination,
      theme,
      aiGenerated: true,
      generatedAt: new Date().toISOString(),
      relatedPackage: pkg ? { name: pkg.name, duration: pkg.duration } : null
    };
  } catch (apiErr) {
    console.error('[video-script] API error:', apiErr.message);
    return generateFallbackScript(destination, duration);
  }
}

function generateFallbackScript(destination, duration = 30) {
  const pkg = BRAND.safari_packages?.find(p => p.destinations?.includes(destination));
  const destInfo = BRAND.destination_profiles?.[destination] || {};

  return {
    hook: `Discover the magic of ${destination}`,
    bodyParts: [
      {
        section: 'Opening landscape sweep',
        duration: 5,
        text: `${destination} isn't just a place—it's a feeling. It's the moment you realize you're witnessing nature at its finest.`
      },
      {
        section: 'Wildlife close-up',
        duration: 7,
        text: destInfo.wildlife?.[0] ? `From the majestic ${destInfo.wildlife[0]} to hidden wonders around every corner, ${destination} tells stories only Africa can tell.` : "From wildlife encounters to hidden wonders, Africa's story unfolds before your eyes."
      },
      {
        section: 'Action/activity sequence',
        duration: 6,
        text: pkg ? `Our "${pkg.name}" puts you right in the heart of it — guides who know every trail, every animal, every moment that matters.` : 'Guided by experts who live and breathe these lands, you\'re never just observing—you\'re experiencing.'
      },
      {
        section: 'Sunset/golden hour',
        duration: 8,
        text: `${BRAND.name}: where your safari dreams become memory. Custom journeys, personal attention, unforgettable moments.`
      }
    ],
    cta: `Your African adventure starts at ${BRAND.website} • WhatsApp: ${BRAND.phone}`,
    hashtags: [
      `#${destination.replace(/\\s/g, '')}Safari`,
      '#LaviraSafaris',
      '#AfrikanAdventure',
      '#SafariOfALifetime',
      '#KenyaTourism'
    ],
    brollRecommendations: [
      'landscape wide shots',
      'wildlife behavior',
      'golden hour light',
      'safari vehicle POV',
      'cultural moments'
    ],
    musicMood: 'adventurous',
    totalDuration: duration,
    destination,
    theme: 'default',
    aiGenerated: false,
    generatedAt: new Date().toISOString(),
    relatedPackage: pkg ? { name: pkg.name, duration: pkg.duration } : null
  };
}

module.exports = { generateVideoScript };
