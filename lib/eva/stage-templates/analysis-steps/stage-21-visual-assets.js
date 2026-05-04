/**
 * Stage 21 Analysis Step — Visual Assets
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001 (refactor of SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D)
 *
 * Generates visual marketing asset specifications from S17 approved designs
 * and S11 brand identity. Produces device-framed screenshot specs and
 * social media graphic specifications per platform.
 *
 * FR-1: emits two canonical venture_artifacts rows (visual_device_screenshots
 *       + visual_social_graphics) instead of one bundled launch_test_plan.
 *       Dual-emits the legacy launch_test_plan row while
 *       LEO_S21_REQUIRED_ARTIFACTS_GATE=false (backward compat).
 * FR-2: Real PNG/SVG file rendering via Playwright deferred to follow-up phase.
 *       Current emission contains structured specs (descriptions, dimensions,
 *       headlines) usable by downstream stages even before real files land.
 * FR-4: refuses to run when S11 visual-identity, S17 archetypes, or S19
 *       deployment_url upstream preconditions absent; emits visual_assets_skipped
 *       artifact noting which precondition is missing.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-21-visual-assets
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

const DEVICE_FRAMES = ['iphone_15', 'macbook_pro', 'ipad', 'android_phone'];

// PLAN-DESIGN cond #4: 4 mandatory + 1 optional platform.
const SOCIAL_SIZES = [
  { platform: 'instagram', format: 'square',   width: 1080, height: 1080, required: true },
  { platform: 'instagram', format: 'portrait', width: 1080, height: 1350, required: true, platform_label: 'Instagram (4:5)' },
  { platform: 'twitter',   format: 'banner',   width: 1500, height: 500,  required: true, platform_label: 'X' },
  { platform: 'facebook',  format: 'cover',    width: 820,  height: 312,  required: true },
  { platform: 'opengraph', format: 'card',     width: 1200, height: 630,  required: false },
];

const REQUIRED_UPSTREAM = [
  { artifact_type: 'visual_color_palette', source_stage: 11, param_key: 'stage11ColorData' },
  { artifact_type: 'visual_typography',    source_stage: 11, param_key: 'stage11TypographyData' },
  { artifact_type: 'visual_logo_spec',     source_stage: 11, param_key: 'stage11LogoData' },
  { artifact_type: 's17_archetypes',       source_stage: 17, param_key: 'stage17Data' },
];

const FEATURE_FLAG_KEY = 'LEO_S21_REQUIRED_ARTIFACTS_GATE';

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
      "platform": "instagram|twitter|facebook|opengraph",
      "format": "square|portrait|banner|cover|card",
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
- Generate at least 2 device screenshots (iphone_15 + macbook_pro minimum)
- Generate at least 4 mandatory social graphics: Instagram square, Instagram portrait, Twitter/X banner, Facebook cover; OpenGraph 1200x630 is recommended
- Generate 3-5 video storyboard scenes
- Use brand colors and typography from S11 visual-identity context
- Screenshots should show the most compelling features rendered against actual deployed app (FR-2 follow-up phase will use Playwright)
- Social graphics should be platform-appropriate in tone`;

/**
 * Pure helper. Returns {ok, missing[]} where missing names which upstream
 * artifact_type or venture_resource is absent. Does not call the database.
 *
 * Checks 5 things: 3 S11 visual-identity artifacts, S17 archetypes, and
 * venture_resources.deployment_url (FR-4 spec).
 */
export function validateEntryPreconditions(params) {
  const missing = [];
  for (const req of REQUIRED_UPSTREAM) {
    const data = params[req.param_key];
    const present = data && typeof data === 'object' && Object.keys(data).length > 0;
    if (!present) missing.push({ artifact_type: req.artifact_type, source_stage: req.source_stage });
  }
  // Special-case: deployment_url comes from venture_resources, not venture_artifacts.
  // Caller passes it as deploymentUrl. Per FR-4 spec, it's required.
  if (!params.deploymentUrl || typeof params.deploymentUrl !== 'string' || params.deploymentUrl.trim().length === 0) {
    missing.push({ artifact_type: 'venture_resources.deployment_url', source_stage: 19 });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Pure helper. Validates that LLM output covers required platforms and devices.
 * Throws a descriptive error on failure (caller catches and converts to fallback).
 */
export function validatePlatformCoverage(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('validatePlatformCoverage: result is not an object');
  }
  const screenshots = Array.isArray(result.device_screenshots) ? result.device_screenshots : [];
  if (screenshots.length < 2) {
    throw new Error(`validatePlatformCoverage: device_screenshots count ${screenshots.length} below minimum 2`);
  }
  const socials = Array.isArray(result.social_graphics) ? result.social_graphics : [];
  const requiredKeys = SOCIAL_SIZES.filter(s => s.required).map(s => `${s.platform}:${s.format}`);
  const seenKeys = new Set(socials.map(s => `${s.platform}:${s.format}`));
  for (const key of requiredKeys) {
    if (!seenKeys.has(key)) {
      throw new Error(`validatePlatformCoverage: missing required social platform "${key}"`);
    }
  }
  return true;
}

/**
 * Pure helper. Splits the LLM result object into the two canonical-pair payloads
 * (visual_device_screenshots + visual_social_graphics). Video storyboard data
 * (if any) attaches to social_graphics under metadata.video_storyboard since the
 * spec doesn't yet declare visual_video_storyboards as a separate canonical type
 * (PLAN out-of-scope decision; deferred to follow-up SD).
 */
export function splitArtifacts(result) {
  const screenshotData = {
    device_screenshots: Array.isArray(result.device_screenshots) ? result.device_screenshots : [],
    total_screenshots: (result.device_screenshots || []).length,
    devices_covered: [...new Set((result.device_screenshots || []).map(s => s.device).filter(Boolean))],
    file_urls: [], // FR-2 will populate this with Playwright-generated PNGs
    rendering_status: 'specs_only',
  };
  const socialData = {
    social_graphics: Array.isArray(result.social_graphics) ? result.social_graphics : [],
    total_socials: (result.social_graphics || []).length,
    platforms_covered: [...new Set((result.social_graphics || []).map(s => s.platform).filter(Boolean))],
    file_urls: [], // FR-2 will populate
    rendering_status: 'specs_only',
    video_storyboard: result.video_storyboard || [],
  };
  return { screenshotData, socialData };
}

async function readFeatureFlag(supabase, logger) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('leo_feature_flags')
      .select('is_enabled')
      .eq('flag_key', FEATURE_FLAG_KEY)
      .maybeSingle();
    if (error) {
      logger?.warn?.(`[S21-VisualAssets] feature flag read error, defaulting OFF: ${error.message}`);
      return false;
    }
    return Boolean(data?.is_enabled);
  } catch (err) {
    logger?.warn?.(`[S21-VisualAssets] feature flag read threw, defaulting OFF: ${err.message}`);
    return false;
  }
}

async function persistCanonicalPair(supabase, ventureId, screenshotData, socialData, fullResult, options) {
  if (!supabase || !ventureId) {
    options.logger?.warn?.('[S21-VisualAssets] persistCanonicalPair skipped: no supabase or ventureId');
    return { persisted: false, reason: 'no_supabase_or_ventureId' };
  }

  const writes = [
    { artifact_type: 'visual_device_screenshots', artifact_data: screenshotData },
    { artifact_type: 'visual_social_graphics',    artifact_data: socialData },
  ];

  // Dual-emit during rollout while flag OFF (backward-compat for any consumer
  // still reading launch_test_plan from S21). Single-emit canonical only when ON.
  if (options.dualEmit) {
    writes.push({
      artifact_type: 'launch_test_plan',
      artifact_data: fullResult,
    });
  }

  const persisted = [];
  for (const w of writes) {
    const { error: e1 } = await supabase
      .from('venture_artifacts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 21)
      .eq('artifact_type', w.artifact_type)
      .eq('is_current', true);
    if (e1) {
      options.logger?.warn?.(`[S21-VisualAssets] mark-stale error on ${w.artifact_type}: ${e1.message}`);
    }

    const { error: e2 } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 21,
        artifact_type: w.artifact_type,
        is_current: true,
        source: 'worker_sd_leo_feat_stage_visual_assets_001',
        artifact_data: w.artifact_data,
      });
    if (e2) {
      options.logger?.warn?.(`[S21-VisualAssets] insert error on ${w.artifact_type}: ${e2.message}`);
    } else {
      persisted.push(w.artifact_type);
    }
  }
  return { persisted: persisted.length > 0, types: persisted };
}

async function persistSkipMarker(supabase, ventureId, missing, logger) {
  if (!supabase || !ventureId) return { persisted: false };
  // Map missing artifact_type to a canonical skip_reason enum.
  // Per PRD AC-4: NO_DEPLOYMENT_URL | NO_S11_VISUAL_IDENTITY | NO_S17_APPROVED_DESIGNS
  let skipReason = 'NO_PRECONDITIONS';
  if (missing.some(m => m.artifact_type === 'venture_resources.deployment_url')) {
    skipReason = 'NO_DEPLOYMENT_URL';
  } else if (missing.some(m => m.source_stage === 17)) {
    skipReason = 'NO_S17_APPROVED_DESIGNS';
  } else if (missing.some(m => m.source_stage === 11)) {
    skipReason = 'NO_S11_VISUAL_IDENTITY';
  }

  try {
    const { error } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 21,
        artifact_type: 'visual_assets_skipped',
        is_current: true,
        source: 'worker_sd_leo_feat_stage_visual_assets_001',
        artifact_data: {
          skip_reason: skipReason,
          missing_preconditions: missing.map(m => m.artifact_type),
          attempted_at: new Date().toISOString(),
          required_upstream: REQUIRED_UPSTREAM,
        },
      });
    if (error) {
      logger?.warn?.(`[S21-VisualAssets] SKIP marker persist error: ${error.message}`);
      return { persisted: false, error: error.message };
    }
    return { persisted: true, skip_reason: skipReason };
  } catch (err) {
    logger?.warn?.(`[S21-VisualAssets] SKIP marker persist threw: ${err.message}`);
    return { persisted: false, error: err.message };
  }
}

export async function analyzeStage21VisualAssets(params) {
  const {
    stage17Data, stage11Data, stage10Data,
    stage11ColorData, stage11TypographyData, stage11LogoData,
    deploymentUrl,
    ventureName, ventureId, supabase,
    logger = console,
  } = params;

  logger.info?.(`[S21-VisualAssets] Generating visual asset specs for ${ventureName || 'unknown'}`);

  // FR-4: entry-precondition check. Refuse to fabricate visual assets without source material.
  const preflight = validateEntryPreconditions(params);
  if (!preflight.ok) {
    const skipResult = await persistSkipMarker(supabase, ventureId, preflight.missing, logger);
    logger.warn?.(
      `[S21-VisualAssets] SKIP — missing preconditions (skip_reason=${skipResult.skip_reason || 'unknown'}): ${preflight.missing.map(m => m.artifact_type).join(', ')}`
    );
    return {
      _skip: true,
      skip_reason: skipResult.skip_reason || 'NO_PRECONDITIONS',
      precondition_missing: preflight.missing,
      device_screenshots: [],
      social_graphics: [],
      video_storyboard: [],
      total_assets: 0,
      screenshot_count: 0,
      social_count: 0,
      storyboard_count: 0,
      usage: {},
    };
  }

  const flagEnabled = await readFeatureFlag(supabase, logger);

  const context = {
    designs: stage17Data || {},
    brand_palette: stage11ColorData || {},
    brand_typography: stage11TypographyData || {},
    brand_logo: stage11LogoData || {},
    persona: stage10Data || {},
    deployment_url: deploymentUrl,
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
    logger.warn?.('[S21-VisualAssets] LLM error, using fallback:', err.message);
    result = buildFallback(ventureName);
  }

  // Validate platform coverage; if it fails, fall back to deterministic specs.
  try {
    validatePlatformCoverage(result);
  } catch (err) {
    logger.warn?.(`[S21-VisualAssets] LLM output failed platform coverage (${err.message}); using fallback`);
    result = buildFallback(ventureName);
  }

  const { screenshotData, socialData } = splitArtifacts(result);

  // Dual-emit when flag OFF (rollout). Single-emit when flag ON (post-rollout).
  await persistCanonicalPair(
    supabase,
    ventureId,
    screenshotData,
    socialData,
    result,
    { dualEmit: !flagEnabled, logger }
  );

  return {
    ...result,
    device_screenshots: result.device_screenshots || [],
    social_graphics: result.social_graphics || [],
    video_storyboard: result.video_storyboard || [],
    total_assets: (result.device_screenshots?.length || 0) + (result.social_graphics?.length || 0),
    screenshot_count: result.device_screenshots?.length || 0,
    social_count: result.social_graphics?.length || 0,
    storyboard_count: result.video_storyboard?.length || 0,
    canonical_emission: {
      flag_enabled: flagEnabled,
      dual_emit: !flagEnabled,
      types_emitted: flagEnabled
        ? ['visual_device_screenshots', 'visual_social_graphics']
        : ['visual_device_screenshots', 'visual_social_graphics', 'launch_test_plan'],
    },
    usage,
  };
}

function buildFallback(ventureName) {
  return {
    device_screenshots: DEVICE_FRAMES.slice(0, 2).map(device => ({
      device, scene: `${ventureName} main dashboard view`, alt_text: `${ventureName} on ${device}`, key_features_visible: ['main feature'],
    })),
    social_graphics: SOCIAL_SIZES.filter(s => s.required).map(s => ({
      platform: s.platform,
      format: s.format,
      width: s.width,
      height: s.height,
      headline: `Introducing ${ventureName}`,
      description: `Launch graphic for ${s.platform} ${s.format}`,
      brand_colors_used: true,
    })),
    video_storyboard: [
      { scene_number: 1, duration_seconds: 5, description: 'Problem statement hook', shot_type: 'wide' },
      { scene_number: 2, duration_seconds: 10, description: 'Product demo walkthrough', shot_type: 'screen-recording' },
      { scene_number: 3, duration_seconds: 5, description: 'CTA with pricing', shot_type: 'close-up' },
    ],
  };
}

export { DEVICE_FRAMES, SOCIAL_SIZES, REQUIRED_UPSTREAM, FEATURE_FLAG_KEY };
