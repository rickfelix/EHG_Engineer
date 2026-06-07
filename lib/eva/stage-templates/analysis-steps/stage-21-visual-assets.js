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

// SD-LEO-FIX-FIX-STAGE-VISUAL-001: preconditions read the WHOLE-STAGE upstream keys
// the execution engine actually provides (stage<N>Data from fetchUpstreamArtifacts),
// not granular per-artifact keys (stage11ColorData/…/deploymentUrl) that nothing
// populates. S11 brand identity lives inside stage11Data (visualIdentity / logoSpec /
// brandExpression); S17 approved designs are signalled by a non-empty stage17Data.
// The deployment precondition is resolved separately from venture_resources.
const REQUIRED_UPSTREAM = [
  {
    artifact_type: 'identity_visual', source_stage: 11, param_key: 'stage11Data',
    hasContent: (d) => Boolean(d && typeof d === 'object' && (d.visualIdentity || d.logoSpec || d.brandExpression)),
  },
  {
    artifact_type: 's17_designs', source_stage: 17, param_key: 'stage17Data',
    hasContent: (d) => Boolean(d && typeof d === 'object' && Object.keys(d).some((k) => k !== '__byType')),
  },
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
    const present = typeof req.hasContent === 'function'
      ? req.hasContent(data)
      : Boolean(data && typeof data === 'object' && Object.keys(data).length > 0);
    if (!present) missing.push({ artifact_type: req.artifact_type, source_stage: req.source_stage });
  }
  // Special-case: deployment_url comes from venture_resources, not venture_artifacts.
  // The analyzer resolves it via resolveDeploymentUrl() and passes it as deploymentUrl.
  if (!params.deploymentUrl || typeof params.deploymentUrl !== 'string' || params.deploymentUrl.trim().length === 0) {
    missing.push({ artifact_type: 'venture_resources.deployment_url', source_stage: 19 });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Resolve the venture's live deployment URL. Primary source is venture_resources
 * (resource_type='replit_deployment'); falls back to ventures.deployment_url. Returns
 * '' when none is found. All DB errors are swallowed → '' so the precondition simply
 * reports NO_DEPLOYMENT_URL rather than throwing. The engine never passes a
 * deploymentUrl param, so this is the canonical resolver.
 */
export async function resolveDeploymentUrl(supabase, ventureId) {
  if (!supabase || !ventureId) return '';
  const pick = (row) => {
    if (!row) return '';
    // SD-LEO-FIX-FIX-STAGE-DEPLOYMENT-001: venture_resources has no `resource_url`
    // column — the live deployment URL lives in `deployment_url`. Reading the wrong
    // column always yielded '' → S21 false-skipped every deployed venture (NO_DEPLOYMENT_URL).
    const url = row.deployment_url || row.metadata?.deployment_url || row.metadata?.url || '';
    return (typeof url === 'string' && url.trim()) ? url.trim() : '';
  };
  try {
    const { data, error } = await supabase
      .from('venture_resources')
      .select('deployment_url, metadata, status')
      .eq('venture_id', ventureId)
      .eq('resource_type', 'replit_deployment')
      .limit(5);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const url = pick(row);
        if (url) return url;
      }
    }
  } catch { /* fall through to ventures fallback */ }
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('deployment_url')
      .eq('id', ventureId)
      .maybeSingle();
    if (!error && data?.deployment_url && typeof data.deployment_url === 'string' && data.deployment_url.trim()) {
      return data.deployment_url.trim();
    }
  } catch { /* ignore */ }
  return '';
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

  // SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001: title is required (venture_artifacts.title
  // is NOT NULL). The prior shape omitted it, so these inserts silently failed the
  // NOT-NULL constraint (in addition to the artifact_type CHECK now fixed by
  // 20260607_venture_artifacts_visual_types.sql). Every write now supplies a title.
  const writes = [
    { artifact_type: 'visual_device_screenshots', title: 'S21 Visual Assets — Device Screenshots', artifact_data: screenshotData },
    { artifact_type: 'visual_social_graphics',    title: 'S21 Visual Assets — Social Graphics',    artifact_data: socialData },
  ];

  // Dual-emit during rollout while flag OFF (backward-compat for any consumer
  // still reading launch_test_plan from S21). Single-emit canonical only when ON.
  if (options.dualEmit) {
    writes.push({
      artifact_type: 'launch_test_plan',
      title: 'S21 Visual Assets — Launch Test Plan',
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
        title: w.title,
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

/**
 * FR-4 (SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001): persist the chairman's OPTIONAL
 * finished visual assets uploaded at the S21 creative_handoff gate, as
 * venture_artifacts artifact_type='visual_final_assets'. The upload UI is the EHG
 * frontend (coordinated follow-on SD); this is the backend writer it calls.
 * Idempotent mark-stale (is_current=false) then insert is_current=true.
 * `title` is REQUIRED (venture_artifacts.title is NOT NULL).
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {object} assets - structured metadata about the uploaded final assets (urls, types, counts)
 * @param {object} [options]
 * @returns {Promise<{persisted: boolean, reason?: string, error?: string}>}
 */
export async function persistVisualFinalAssets(supabase, ventureId, assets, options = {}) {
  const logger = options.logger;
  if (!supabase || !ventureId) {
    logger?.warn?.('[S21-VisualAssets] persistVisualFinalAssets skipped: no supabase or ventureId');
    return { persisted: false, reason: 'no_supabase_or_ventureId' };
  }
  try {
    await supabase
      .from('venture_artifacts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 21)
      .eq('artifact_type', 'visual_final_assets')
      .eq('is_current', true);

    const { error } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 21,
        artifact_type: 'visual_final_assets',
        title: (assets && assets.title) || 'S21 Final Visual Assets (chairman upload)',
        is_current: true,
        source: 'chairman_upload',
        artifact_data: assets || {},
      });
    if (error) {
      logger?.warn?.(`[S21-VisualAssets] persistVisualFinalAssets insert error: ${error.message}`);
      return { persisted: false, error: error.message };
    }
    return { persisted: true };
  } catch (err) {
    logger?.warn?.(`[S21-VisualAssets] persistVisualFinalAssets threw: ${err.message}`);
    return { persisted: false, error: err.message };
  }
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
    // SD-LEO-FIX-FIX-STAGE-SKIP-001: idempotent skip marker. The worker re-runs S21 on
    // every poll (~30s) while the precondition stays unmet, so a plain INSERT would grow
    // venture_artifacts unboundedly. Refresh the existing current marker in place; only
    // INSERT when none exists. Result: exactly one `visual_assets_skipped` row per venture.
    const artifactData = {
      skip_reason: skipReason,
      missing_preconditions: missing.map(m => m.artifact_type),
      attempted_at: new Date().toISOString(),
      required_upstream: REQUIRED_UPSTREAM,
    };
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 21)
      .eq('artifact_type', 'visual_assets_skipped')
      .eq('is_current', true)
      .limit(1);
    let error;
    if (existing && existing.length > 0) {
      ({ error } = await supabase
        .from('venture_artifacts')
        .update({ artifact_data: artifactData })
        .eq('id', existing[0].id));
    } else {
      ({ error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: ventureId,
          lifecycle_stage: 21,
          artifact_type: 'visual_assets_skipped',
          is_current: true,
          source: 'worker_sd_leo_feat_stage_visual_assets_001',
          artifact_data: artifactData,
        }));
    }
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
    ventureName, ventureId, supabase,
    logger = console,
  } = params;

  logger.info?.(`[S21-VisualAssets] Generating visual asset specs for ${ventureName || 'unknown'}`);

  // SD-LEO-FIX-FIX-STAGE-VISUAL-001: the execution engine never passes a deploymentUrl
  // param — resolve it from venture_resources here. Honour an explicit override when a
  // caller/test pre-resolves it.
  const deploymentUrl = params.deploymentUrl || await resolveDeploymentUrl(supabase, ventureId);

  // FR-4: entry-precondition check. Refuse to fabricate visual assets without source
  // material. Check the whole-stage upstream keys the engine provides + resolved deployment.
  const preflight = validateEntryPreconditions({ stage11Data, stage17Data, deploymentUrl });
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

  // SD-LEO-FIX-FIX-STAGE-VISUAL-001: brand inputs come from S11's stage11Data
  // (visualIdentity holds palette/typography, logoSpec holds the logo) — not the
  // granular stage11*Data params the engine never produced.
  const context = {
    designs: stage17Data || {},
    brand_palette: stage11Data?.visualIdentity || {},
    brand_typography: stage11Data?.brandExpression || stage11Data?.visualIdentity || {},
    brand_logo: stage11Data?.logoSpec || {},
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
