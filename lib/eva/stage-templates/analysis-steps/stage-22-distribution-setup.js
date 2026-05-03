/**
 * Stage 22 Analysis Step — Distribution Setup
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (refactor of SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D)
 *
 * Configures distribution channels from GTM strategy (S12) and persona
 * demographics (S10). Generates platform-specific ad copy with targeting.
 *
 * FR-1: emits two canonical venture_artifacts rows (distribution_channel_config
 *       + distribution_ad_copy) instead of one bundled launch_deployment_runbook.
 *       Dual-emits the legacy row while LEO_S22_GATES_ENABLED=false (backward compat).
 * FR-3: refuses to run when upstream preconditions absent; emits SKIP marker
 *       artifact noting which precondition is missing.
 * FR-4: validates all 6 spec'd channels with explicit enabled+skip_reason.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

const CHANNELS = ['app_store', 'google_ads', 'facebook_instagram', 'twitter_x', 'email', 'blog_seo'];

const REQUIRED_UPSTREAM = [
  { artifact_type: 'engine_pricing_model',          source_stage: 7,  param_key: 'stage7Data' },
  { artifact_type: 'identity_persona_brand',        source_stage: 10, param_key: 'stage10Data' },
  { artifact_type: 'identity_gtm_sales_strategy',   source_stage: 12, param_key: 'stage12Data' },
  { artifact_type: 'visual_social_graphics',        source_stage: 21, param_key: 'stage21SocialData' },
  { artifact_type: 'visual_device_screenshots',     source_stage: 21, param_key: 'stage21ScreenshotData' },
];

const FEATURE_FLAG_KEY = 'LEO_S22_GATES_ENABLED';

const SYSTEM_PROMPT = `You are EVA's Distribution Planner. Configure marketing distribution channels and generate ad copy based on GTM strategy and target personas.

Output valid JSON:
{
  "channels": [
    {
      "channel": "app_store|google_ads|facebook_instagram|twitter_x|email|blog_seo",
      "status": "active|pending|skipped",
      "reason": "Why this channel is active or skipped",
      "ad_copy": {
        "headline": "Ad headline for this channel",
        "body": "Ad body text (channel-appropriate length)",
        "cta": "Call to action text"
      },
      "targeting": {
        "audience": "Target audience description",
        "demographics": "Age, location, interests",
        "keywords": ["keyword1", "keyword2"]
      }
    }
  ],
  "email_sequences": [
    {
      "sequence_name": "welcome|onboarding|reengagement",
      "emails_count": 3,
      "cadence": "Day 0, Day 3, Day 7",
      "preview": "Brief description of the sequence"
    }
  ],
  "budget_allocation": {
    "total_monthly": "Recommended monthly budget",
    "by_channel": { "google_ads": "40%", "facebook_instagram": "35%", "twitter_x": "15%", "blog_seo": "10%" }
  }
}

Rules:
- Configure at least 3 channels as active
- Each active channel must have ad copy and targeting
- Email sequences should reference the S18 copy (welcome, onboarding, re-engagement)
- Budget allocation based on GTM strategy channel priorities
- Targeting should use persona demographics (age, interests, pain points)`;

/**
 * Pure helper. Returns {ok, missing[]} where missing names which upstream
 * artifact_type is absent. Does not call the database.
 */
export function validateEntryPreconditions(params) {
  const missing = [];
  for (const req of REQUIRED_UPSTREAM) {
    const data = params[req.param_key];
    const present = data && typeof data === 'object' && Object.keys(data).length > 0;
    if (!present) missing.push({ artifact_type: req.artifact_type, source_stage: req.source_stage });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Pure helper. Validates that LLM output covers all 6 spec'd channels with
 * the required {enabled, skip_reason?, targeting?, ad_copy?} shape. Throws
 * a descriptive error on failure (caller catches and converts to SKIP).
 */
export function validateChannelCoverage(channels) {
  if (!Array.isArray(channels)) {
    throw new Error('validateChannelCoverage: channels is not an array');
  }
  const seen = new Set();
  for (const ch of channels) {
    if (!ch || typeof ch !== 'object') {
      throw new Error('validateChannelCoverage: non-object channel entry');
    }
    const name = ch.channel || ch.channel_name;
    if (!name) throw new Error('validateChannelCoverage: channel entry missing channel name');
    if (!CHANNELS.includes(name)) {
      throw new Error(`validateChannelCoverage: unrecognized channel "${name}" (valid: ${CHANNELS.join(', ')})`);
    }
    seen.add(name);
    const enabled = typeof ch.enabled === 'boolean'
      ? ch.enabled
      : (ch.status === 'active');
    if (typeof enabled !== 'boolean') {
      throw new Error(`validateChannelCoverage: channel "${name}" missing boolean enabled flag`);
    }
    if (!enabled) {
      const reason = ch.skip_reason || ch.reason;
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        throw new Error(`validateChannelCoverage: disabled channel "${name}" missing skip_reason`);
      }
    } else {
      if (!ch.ad_copy || typeof ch.ad_copy !== 'object') {
        throw new Error(`validateChannelCoverage: enabled channel "${name}" missing ad_copy object`);
      }
      if (!ch.targeting || typeof ch.targeting !== 'object') {
        throw new Error(`validateChannelCoverage: enabled channel "${name}" missing targeting object`);
      }
    }
  }
  for (const expected of CHANNELS) {
    if (!seen.has(expected)) {
      throw new Error(`validateChannelCoverage: missing channel "${expected}" (all 6 must appear)`);
    }
  }
  return true;
}

/**
 * Pure helper. Splits the LLM result object into the canonical pair payloads.
 */
export function splitArtifacts(result) {
  const channels = Array.isArray(result.channels) ? result.channels : [];
  const channelConfig = {
    channels: channels.map(ch => {
      const { ad_copy: _ac, ad_creative: _acr, ad_variants: _av, ...config } = ch;
      const enabled = typeof ch.enabled === 'boolean' ? ch.enabled : (ch.status === 'active');
      return { ...config, enabled, skip_reason: enabled ? null : (ch.skip_reason || ch.reason) };
    }),
    total_channels: channels.length,
    active_channels: channels.filter(ch => (typeof ch.enabled === 'boolean' ? ch.enabled : ch.status === 'active')).length,
    budget_allocation: result.budget_allocation || {},
  };
  const adCopy = {
    channels_with_copy: channels
      .filter(ch => (typeof ch.enabled === 'boolean' ? ch.enabled : ch.status === 'active'))
      .map(ch => ({
        channel: ch.channel || ch.channel_name,
        ad_copy: ch.ad_copy || null,
        ad_creative: ch.ad_creative || null,
        ad_variants: ch.ad_variants || null,
      })),
    email_sequences: result.email_sequences || [],
  };
  return { channelConfig, adCopy };
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
      logger?.warn?.(`[S22-Distribution] feature flag read error, defaulting OFF: ${error.message}`);
      return false;
    }
    return Boolean(data?.is_enabled);
  } catch (err) {
    logger?.warn?.(`[S22-Distribution] feature flag read threw, defaulting OFF: ${err.message}`);
    return false;
  }
}

async function persistCanonicalPair(supabase, ventureId, channelConfig, adCopy, fullResult, options) {
  if (!supabase || !ventureId) {
    options.logger?.warn?.('[S22-Distribution] persistCanonicalPair skipped: no supabase or ventureId');
    return { persisted: false, reason: 'no_supabase_or_ventureId' };
  }

  const writes = [
    { artifact_type: 'distribution_channel_config', artifact_data: channelConfig },
    { artifact_type: 'distribution_ad_copy',        artifact_data: adCopy },
  ];

  if (options.dualEmit) {
    writes.push({
      artifact_type: 'launch_deployment_runbook',
      artifact_data: fullResult,
    });
  }

  const persisted = [];
  for (const w of writes) {
    const { error: e1 } = await supabase
      .from('venture_artifacts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 22)
      .eq('artifact_type', w.artifact_type)
      .eq('is_current', true);
    if (e1) {
      options.logger?.warn?.(`[S22-Distribution] mark-stale error on ${w.artifact_type}: ${e1.message}`);
    }

    const { error: e2 } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 22,
        artifact_type: w.artifact_type,
        is_current: true,
        source: `worker_sd_leo_feat_stage_distribution_setup_001`,
        artifact_data: w.artifact_data,
      });
    if (e2) {
      options.logger?.warn?.(`[S22-Distribution] insert error on ${w.artifact_type}: ${e2.message}`);
    } else {
      persisted.push(w.artifact_type);
    }
  }
  return { persisted: persisted.length > 0, types: persisted };
}

async function persistSkipMarker(supabase, ventureId, missing, logger) {
  if (!supabase || !ventureId) return { persisted: false };
  try {
    const { error } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 22,
        artifact_type: 'distribution_skip_marker',
        is_current: true,
        source: 'worker_sd_leo_feat_stage_distribution_setup_001',
        artifact_data: {
          precondition_missing: missing.map(m => m.artifact_type),
          attempted_at: new Date().toISOString(),
          required_upstream: REQUIRED_UPSTREAM,
        },
      });
    if (error) {
      logger?.warn?.(`[S22-Distribution] SKIP marker persist error: ${error.message}`);
      return { persisted: false, error: error.message };
    }
    return { persisted: true };
  } catch (err) {
    logger?.warn?.(`[S22-Distribution] SKIP marker persist threw: ${err.message}`);
    return { persisted: false, error: err.message };
  }
}

export async function analyzeStage22Distribution(params) {
  const {
    stage12Data, stage10Data, stage18Data, stage7Data,
    ventureName, ventureId, supabase,
    logger = console,
  } = params;

  logger.info?.(`[S22-Distribution] Configuring channels for ${ventureName || 'unknown'}`);

  const preflight = validateEntryPreconditions(params);
  if (!preflight.ok) {
    logger.warn?.(
      `[S22-Distribution] SKIP — missing preconditions: ${preflight.missing.map(m => m.artifact_type).join(', ')}`
    );
    await persistSkipMarker(supabase, ventureId, preflight.missing, logger);
    return {
      _skip: true,
      precondition_missing: preflight.missing,
      channels: [],
      email_sequences: [],
      budget_allocation: {},
      total_channels: 0,
      active_channels: 0,
      channels_with_copy: 0,
      usage: {},
    };
  }

  const flagEnabled = await readFeatureFlag(supabase, logger);

  const context = {
    gtm_strategy: stage12Data || {},
    personas: stage10Data || {},
    marketing_copy: stage18Data || {},
    pricing: stage7Data || {},
    venture_name: ventureName,
  };

  let result;
  let usage = {};

  try {
    const client = getLLMClient();
    const response = await client.complete(SYSTEM_PROMPT, `Configure distribution for: ${ventureName}\n\nContext:\n${JSON.stringify(context, null, 2)}`);
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};
    result = parsed?.channels ? parsed : buildFallback(ventureName);
  } catch (err) {
    logger.warn('[S22-Distribution] LLM error, using fallback:', err.message);
    result = buildFallback(ventureName);
  }

  const channels = Array.isArray(result.channels) ? result.channels : [];
  const activeChannels = channels.filter(c => (typeof c.enabled === 'boolean' ? c.enabled : c.status === 'active'));

  const fullResult = {
    ...result,
    channels,
    email_sequences: result.email_sequences || [],
    budget_allocation: result.budget_allocation || {},
    total_channels: channels.length,
    active_channels: activeChannels.length,
    channels_with_copy: activeChannels.filter(c => c.ad_copy?.headline).length,
    usage,
  };

  try {
    validateChannelCoverage(channels);
  } catch (err) {
    logger.warn?.(`[S22-Distribution] coverage validation failed: ${err.message}`);
    await persistSkipMarker(
      supabase, ventureId,
      [{ artifact_type: 'channel_coverage_violation', source_stage: 22, detail: err.message }],
      logger
    );
    return { ...fullResult, _skip: true, _validation_error: err.message };
  }

  const { channelConfig, adCopy } = splitArtifacts(fullResult);
  await persistCanonicalPair(
    supabase, ventureId,
    channelConfig, adCopy, fullResult,
    { dualEmit: !flagEnabled, logger }
  );

  return {
    ...fullResult,
    _canonical_pair: { channelConfig, adCopy },
    _flag_enabled: flagEnabled,
    _dual_emitted: !flagEnabled,
  };
}

function buildFallback(ventureName) {
  return {
    channels: CHANNELS.map(ch => {
      const isActive = ['app_store', 'google_ads', 'email'].includes(ch);
      return {
        channel: ch,
        enabled: isActive,
        status: isActive ? 'active' : 'skipped',
        skip_reason: isActive ? null : 'Awaiting GTM data — fallback skip',
        reason: ch === 'app_store' ? 'Primary distribution' : 'Awaiting GTM data',
        ad_copy: isActive
          ? { headline: `Try ${ventureName}`, body: `[Fallback — regenerate with GTM data]`, cta: 'Get Started' }
          : null,
        targeting: isActive
          ? { audience: 'Target audience', demographics: 'specified-by-EXEC from persona data', keywords: [ventureName?.toLowerCase() || 'product'] }
          : null,
      };
    }),
    email_sequences: [
      { sequence_name: 'welcome', emails_count: 3, cadence: 'Day 0, Day 1, Day 3', preview: 'Welcome + quick start' },
      { sequence_name: 'onboarding', emails_count: 3, cadence: 'Day 3, Day 5, Day 7', preview: 'Feature highlights' },
      { sequence_name: 'reengagement', emails_count: 2, cadence: 'Day 14, Day 30', preview: 'Come back + incentive' },
    ],
    budget_allocation: { total_monthly: 'specified-by-EXEC', by_channel: { google_ads: '40%', facebook_instagram: '35%', email: '15%', blog_seo: '10%' } },
  };
}

export { CHANNELS, REQUIRED_UPSTREAM, FEATURE_FLAG_KEY };
