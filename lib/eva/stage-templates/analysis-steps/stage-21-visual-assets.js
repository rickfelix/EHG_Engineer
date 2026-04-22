/**
 * Stage 21 Analysis Step — Visual Assets
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D
 *
 * Generates visual marketing asset specifications from S17 approved designs
 * and S11 brand identity. Produces device-framed screenshot specs and
 * social media graphic specifications per platform.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-21-visual-assets
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

const DEVICE_FRAMES = ['iphone_15', 'macbook_pro', 'ipad', 'android_phone'];
const SOCIAL_SIZES = [
  { platform: 'instagram', format: 'square', width: 1080, height: 1080 },
  { platform: 'twitter', format: 'banner', width: 1500, height: 500 },
  { platform: 'facebook', format: 'cover', width: 1200, height: 630 },
  { platform: 'linkedin', format: 'post', width: 1200, height: 627 },
];

// 2026-04-22: LLM generates asset specifications (descriptions, alt text, recommended scenes)
// Actual image generation deferred to Playwright/CDP integration follow-up SD
const SYSTEM_PROMPT = `You are EVA's Visual Asset Planner. Generate specifications for marketing visual assets based on the venture's approved designs and brand identity.

Output valid JSON:
{
  "device_screenshots": [
    {
      "device": "iphone_15|macbook_pro|ipad|android_phone",
      "scene": "Description of what the screenshot should show",
      "alt_text": "Accessibility text for the screenshot",
      "key_features_visible": ["feature1", "feature2"]
    }
  ],
  "social_graphics": [
    {
      "platform": "instagram|twitter|facebook|linkedin",
      "format": "square|banner|cover|post",
      "width": 1080,
      "height": 1080,
      "headline": "Text overlay for the graphic",
      "description": "What the graphic should convey",
      "brand_colors_used": true
    }
  ],
  "video_storyboard": [
    {
      "scene_number": 1,
      "duration_seconds": 5,
      "description": "What happens in this scene",
      "shot_type": "wide|medium|close-up|screen-recording"
    }
  ]
}

Rules:
- Generate at least 3 device screenshots across different devices
- Generate at least 4 social graphics (one per platform)
- Generate 3-5 video storyboard scenes
- Use brand colors and naming from identity data
- Screenshots should show the most compelling features
- Social graphics should be platform-appropriate in tone`;

export async function analyzeStage21VisualAssets(params) {
  const { stage17Data, stage11Data, stage10Data, ventureName, logger = console } = params;

  logger.info?.(`[S21-VisualAssets] Generating visual asset specs for ${ventureName || 'unknown'}`);

  const context = {
    designs: stage17Data || {},
    brand: stage11Data || {},
    persona: stage10Data || {},
    venture_name: ventureName,
  };

  let result;
  let usage = {};

  try {
    const client = getLLMClient();
    const response = await client.complete(SYSTEM_PROMPT, `Generate visual asset specifications for: ${ventureName}\n\nContext:\n${JSON.stringify(context, null, 2)}`);
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};
    result = parsed?.device_screenshots ? parsed : buildFallback(ventureName);
  } catch (err) {
    logger.warn('[S21-VisualAssets] LLM error, using fallback:', err.message);
    result = buildFallback(ventureName);
  }

  return {
    ...result,
    device_screenshots: result.device_screenshots || [],
    social_graphics: result.social_graphics || [],
    video_storyboard: result.video_storyboard || [],
    total_assets: (result.device_screenshots?.length || 0) + (result.social_graphics?.length || 0),
    screenshot_count: result.device_screenshots?.length || 0,
    social_count: result.social_graphics?.length || 0,
    storyboard_count: result.video_storyboard?.length || 0,
    usage,
  };
}

function buildFallback(ventureName) {
  return {
    device_screenshots: DEVICE_FRAMES.slice(0, 3).map(device => ({
      device, scene: `${ventureName} main dashboard view`, alt_text: `${ventureName} on ${device}`, key_features_visible: ['main feature'],
    })),
    social_graphics: SOCIAL_SIZES.map(s => ({
      ...s, headline: `Introducing ${ventureName}`, description: `Launch graphic for ${s.platform}`, brand_colors_used: true,
    })),
    video_storyboard: [
      { scene_number: 1, duration_seconds: 5, description: 'Problem statement hook', shot_type: 'wide' },
      { scene_number: 2, duration_seconds: 10, description: 'Product demo walkthrough', shot_type: 'screen-recording' },
      { scene_number: 3, duration_seconds: 5, description: 'CTA with pricing', shot_type: 'close-up' },
    ],
  };
}

export { DEVICE_FRAMES, SOCIAL_SIZES };
