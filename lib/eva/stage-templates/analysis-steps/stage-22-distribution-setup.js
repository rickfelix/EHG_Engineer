/**
 * Stage 22 Analysis Step — Distribution Setup (thesis-derived rebuild)
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-B (design D1, parent PRD FR-2;
 *     rebuild of SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001)
 *
 * NOTE: file is named stage-22 but runs as the Distribution stage (stage_number 21)
 * after the 21/22 content swap (migration 20260607_swap_stage_21_22_full_content.sql).
 * All artifact writes pin lifecycle_stage 21.
 *
 * Semantics (inverted from the fixed-six/skip-and-advance original):
 * - Channels DERIVE from the venture's demand-thesis CHANNEL claim
 *   (truth_demand_thesis artifact). Open taxonomy — integration/marketplace/
 *   partnership/referral are first-class; there is NO fixed channel universe.
 * - Persona×channel JOIN: every channel maps to a persona named in the WHO
 *   claim, or that channel is invalidated with COHERENCE_JOIN_GAP.
 * - Fail-PARTIAL: one malformed channel invalidates only that channel's
 *   experiment, never the stage.
 * - BINDING gate: total failure (no thesis / no joinable channels / all
 *   experiments invalid / generation failure) records a blocking
 *   chairman_decisions row + a distribution_block_marker artifact, withholds
 *   the canonical pair (so the artifact-precondition gate blocks advancement),
 *   and returns {_blocked:true}. There is NO _skip:true and NO fabricated
 *   fallback portfolio on this path.
 * - The ONLY skip path is an approved chairman 'distribution_skip' decision,
 *   honored via BUILD_DEVIATION_RECORD rows (the existing artifact-gate valve).
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
// SD-LEO-INFRA-DOWNSTREAM-OPERATING-MODEL-PROPAGATION-001 FR-1: organic-first GTM grounding.
import { getOperatingModelPromptBlock } from '../../standards/operating-model.js';
// SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D (FR-004): pre-launch Growth Playbook co-output.
import { runPrelaunchGrowthCoOutput } from './prelaunch-growth-playbook.js';
import { describeArtifactGap } from '../../contracts/describe-artifact-gap.js';
import { recordPendingDecision } from '../../../chairman/record-pending-decision.mjs';
import { recordDeviation } from '../../deviation-ledger.js';

/** Consumption contract: the demand-thesis artifact this step reads.
 *  Producer is design-only today (docs/design/venture-selection-demand-thesis-design.md);
 *  validateThesisChannelClaim below is the written, tested contract it must satisfy. */
const THESIS_ARTIFACT_TYPE = 'truth_demand_thesis';

const BLOCK_DECISION_TYPE = 'distribution_block';
const SKIP_DECISION_TYPE = 'distribution_skip';
/** Same approved-decision vocabulary advance_venture_stage matches at chairman gates. */
const APPROVED_DECISIONS = ['pass', 'go', 'proceed', 'approve', 'conditional_pass', 'conditional_go', 'continue', 'release'];

const LIFECYCLE_STAGE = 21;
const ARTIFACT_SOURCE = 'worker_sd_leo_infra_venture_demand_distribution_001_b';
const CANONICAL_PAIR_TYPES = ['distribution_channel_config', 'distribution_ad_copy'];
const EXECUTION_TIERS = ['T0', 'T1', 'T2'];

/**
 * Value-domain normalization for the legacy consumer allowlist.
 * selectOrganicChannel (lib/marketing/organic-channel-provisioning.js) filters
 * channels[].channel against a CLOSED set (blog_seo|twitter_x|email|
 * facebook_instagram). Thesis-derived names that cleanly map onto a legacy
 * platform are normalized so that consumer keeps working; unmappable
 * open-taxonomy names (community, integration, marketplace, partnership,
 * referral, ...) pass through unchanged — selectOrganicChannel returning null
 * for those is documented acceptable (it fail-softs with a reason; the Child C
 * execution rail consumes the portfolio directly).
 */
const LEGACY_CHANNEL_NAME_MAP = {
  x: 'twitter_x',
  twitter: 'twitter_x',
  twitter_x: 'twitter_x',
  build_in_public: 'twitter_x',
  seo: 'blog_seo',
  blog: 'blog_seo',
  blog_seo: 'blog_seo',
  content_seo: 'blog_seo',
  email: 'email',
  newsletter: 'email',
  facebook: 'facebook_instagram',
  instagram: 'facebook_instagram',
  facebook_instagram: 'facebook_instagram',
};

/** Pure. Normalizes a thesis channel name onto the legacy platform taxonomy
 *  where a clean mapping exists; open-taxonomy names pass through unchanged. */
export function normalizeChannelName(name) {
  const key = String(name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return LEGACY_CHANNEL_NAME_MAP[key] || key;
}

/** Legacy upstream context (S7 pricing / S10 persona / S12 GTM). These are
 *  OPTIONAL LLM context — no longer skip-triggering preconditions (the old
 *  precondition-skip path was the second silent-skip source). The param_key
 *  convention (stage{N}Data) is pinned by
 *  stage-precondition-whole-stage-key-invariant.test.js. */
const REQUIRED_UPSTREAM = [
  { artifact_type: 'engine_pricing_model', source_stage: 7, param_key: 'stage7Data' },
  { artifact_type: 'identity_persona_brand', source_stage: 10, param_key: 'stage10Data' },
  { artifact_type: 'identity_gtm_sales_strategy', source_stage: 12, param_key: 'stage12Data' },
];

const FEATURE_FLAG_KEY = 'LEO_S22_GATES_ENABLED';

/**
 * Pure helper (unchanged from the pre-rebuild module). Normalizes
 * worker-provided upstream params into the param_keys REQUIRED_UPSTREAM
 * declares. Tolerates absent stages / missing __byType; returns a shallow copy.
 * SD-LEO-FIX-FIX-POST-BUILD-001.
 */
export function normalizeUpstreamParams(params) {
  const out = { ...(params || {}) };
  for (const req of REQUIRED_UPSTREAM) {
    const existing = out[req.param_key];
    if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) continue;

    const stageData = out[`stage${req.source_stage}Data`];
    if (!stageData || typeof stageData !== 'object') continue;

    const byTypeEntry = stageData.__byType && stageData.__byType[req.artifact_type];
    if (byTypeEntry && typeof byTypeEntry === 'object') {
      const data = byTypeEntry.artifact_data || byTypeEntry.content || byTypeEntry;
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        out[req.param_key] = data;
      }
    }
  }
  return out;
}

/**
 * @typedef {Object} ThesisChannelEntry
 * @property {string} channel - reachable-path name from the CHANNEL claim
 *   (open taxonomy; e.g. 'community', 'integration', 'twitter_x', 'blog_seo')
 * @property {string} [channel_type] - taxonomy hint (social|search|email|content|
 *   integration|marketplace|partnership|referral|...)
 * @property {string|string[]} [persona] - name(s) of the WHO-claim persona this
 *   channel reaches (also accepted: persona_name, personas)
 * @property {string} [cost_hypothesis] - cost-to-first-100-strangers hypothesis
 *
 * @typedef {Object} DemandThesis
 * @property {Object|Array} claims - keyed (WHO/CHANNEL/...) object or array of
 *   {claim_type|type|key, ...} entries. CHANNEL claim carries {channels:
 *   ThesisChannelEntry[]}; WHO claim carries {personas: (string|{name})[]}.
 *   Source: docs/design/venture-selection-demand-thesis-design.md (six claims;
 *   persona×channel JOIN rule from docs/design/venture-demand-distribution-engine.md §1.1).
 */

function extractClaim(claims, key) {
  if (!claims) return null;
  if (Array.isArray(claims)) {
    return claims.find((c) => {
      const t = String(c?.claim_type || c?.type || c?.key || '').toUpperCase();
      return t === key;
    }) || null;
  }
  if (typeof claims === 'object') {
    return claims[key] || claims[key.toLowerCase()] || null;
  }
  return null;
}

function personaNamesOf(entry) {
  const raw = entry?.persona ?? entry?.persona_name ?? entry?.personas;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((p) => (typeof p === 'string' ? p : p?.name))
    .filter((n) => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.trim());
}

/**
 * Pure. Parses + validates the demand-thesis CHANNEL/WHO claims this step
 * consumes. Tolerates benign extra fields (additive-producer friendly).
 * @param {DemandThesis|null|undefined} thesis - truth_demand_thesis artifact_data
 * @returns {{ok:boolean, channels:ThesisChannelEntry[], personas:string[], problems:string[]}}
 */
export function validateThesisChannelClaim(thesis) {
  const problems = [];
  if (!thesis || typeof thesis !== 'object') {
    return { ok: false, channels: [], personas: [], problems: ['thesis artifact_data is missing or not an object'] };
  }
  const claims = thesis.claims ?? thesis;
  const channelClaim = extractClaim(claims, 'CHANNEL');
  const whoClaim = extractClaim(claims, 'WHO');

  const personas = [];
  const whoPersonas = whoClaim?.personas ?? whoClaim?.persona ?? [];
  for (const p of Array.isArray(whoPersonas) ? whoPersonas : [whoPersonas]) {
    const name = typeof p === 'string' ? p : p?.name;
    if (typeof name === 'string' && name.trim()) personas.push(name.trim());
  }
  if (personas.length === 0) problems.push('WHO claim names no personas');

  let channels = [];
  if (!channelClaim) {
    problems.push('CHANNEL claim is missing');
  } else {
    const rawChannels = channelClaim.channels ?? (Array.isArray(channelClaim) ? channelClaim : null);
    if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
      problems.push('CHANNEL claim has no channels[] entries');
    } else {
      channels = rawChannels.filter((c) => {
        const named = c && typeof c === 'object' && (c.channel || c.channel_type || c.name || c.type);
        if (!named) problems.push('CHANNEL claim entry missing a channel name');
        return named;
      });
      if (channels.length === 0) problems.push('CHANNEL claim entries are all unnamed');
    }
  }

  return { ok: channels.length > 0 && personas.length > 0, channels, personas, problems };
}

/**
 * Pure. Derives channel candidates from a parsed thesis, enforcing the
 * persona×channel JOIN: every channel must reference a persona named in the
 * WHO claim, or it is invalidated with COHERENCE_JOIN_GAP (fail-partial —
 * only that channel is invalidated).
 * @param {{channels:ThesisChannelEntry[], personas:string[]}} parsedThesis
 * @returns {{channels:Array<{channel:string, source_channel:string, channel_type:string|null, persona:string, cost_hypothesis:string|null}>, invalid:Array<{entry:Object, invalid_reason:string}>}}
 */
export function deriveChannelsFromThesis(parsedThesis) {
  const { channels = [], personas = [] } = parsedThesis || {};
  const personaSet = new Set(personas.map((p) => p.toLowerCase()));
  const valid = [];
  const invalid = [];

  for (const entry of channels) {
    const sourceName = String(entry.channel || entry.name || entry.channel_type || entry.type).trim();
    const entryPersonas = personaNamesOf(entry);
    if (entryPersonas.length === 0) {
      invalid.push({ entry, invalid_reason: 'COHERENCE_JOIN_GAP: channel names no persona' });
      continue;
    }
    const joined = entryPersonas.find((p) => personaSet.has(p.toLowerCase()));
    if (!joined) {
      invalid.push({ entry, invalid_reason: `COHERENCE_JOIN_GAP: persona(s) [${entryPersonas.join(', ')}] not named in WHO claim` });
      continue;
    }
    valid.push({
      channel: normalizeChannelName(sourceName),
      source_channel: sourceName,
      channel_type: entry.channel_type || entry.type || null,
      persona: joined,
      cost_hypothesis: entry.cost_hypothesis || entry.cost_to_signal || entry.cost || null,
    });
  }

  return { channels: valid, invalid };
}

/**
 * Pure. Validates one channel experiment for portfolio completeness
 * (fail-partial unit). Returns every failure reason, not just the first.
 * @param {Object} exp
 * @returns {{valid:boolean, reasons:string[]}}
 */
export function validateExperiment(exp) {
  const reasons = [];
  if (!exp || typeof exp !== 'object') return { valid: false, reasons: ['experiment is not an object'] };

  const nonEmpty = (v) => (typeof v === 'string' && v.trim().length > 0)
    || (typeof v === 'number' && Number.isFinite(v))
    || (Array.isArray(v) && v.length > 0)
    || (Boolean(v) && typeof v === 'object' && Object.keys(v).length > 0);

  if (typeof exp.hypothesis !== 'string' || !exp.hypothesis.trim()) reasons.push('missing hypothesis');
  if (typeof exp.persona_mapping !== 'string' || !exp.persona_mapping.trim()) reasons.push('missing persona_mapping');
  if (!nonEmpty(exp.cost_to_signal_bound)) reasons.push('missing cost_to_signal_bound');
  if (!nonEmpty(exp.success_criteria)) reasons.push('missing success_criteria');
  if (!nonEmpty(exp.kill_criteria)) reasons.push('missing kill_criteria');
  if (!EXECUTION_TIERS.includes(exp.execution_tier)) reasons.push(`execution_tier must be one of ${EXECUTION_TIERS.join('/')}`);

  const variants = Array.isArray(exp.message_variants) ? exp.message_variants : [];
  const wellFormed = variants.filter((v) => v && typeof v === 'object'
    && typeof v.headline === 'string' && v.headline.trim()
    && typeof v.body === 'string' && v.body.trim()
    && typeof v.cta === 'string' && v.cta.trim());
  if (wellFormed.length < 2) reasons.push(`requires >=2 well-formed message variants (headline/body/cta), got ${wellFormed.length}`);

  const utm = exp.utm;
  const utmOk = utm && typeof utm === 'object'
    && ['utm_source', 'utm_medium', 'utm_campaign'].every((k) => typeof utm[k] === 'string' && utm[k].trim());
  if (!utmOk) reasons.push('missing utm {utm_source, utm_medium, utm_campaign}');

  return { valid: reasons.length === 0, reasons };
}

/**
 * Pure. Stable-ranks experiments (numeric exp.rank when the generator provided
 * one, else original order) and stamps 1-based rank + first-touch attribution.
 */
export function rankExperiments(experiments) {
  const indexed = (experiments || []).map((exp, i) => ({ exp, i }));
  indexed.sort((a, b) => {
    const ra = Number.isFinite(Number(a.exp?.rank)) ? Number(a.exp.rank) : Number.POSITIVE_INFINITY;
    const rb = Number.isFinite(Number(b.exp?.rank)) ? Number(b.exp.rank) : Number.POSITIVE_INFINITY;
    return ra === rb ? a.i - b.i : ra - rb;
  });
  return indexed.map(({ exp }, i) => ({ ...exp, rank: i + 1, attribution: 'first_touch' }));
}

// SD-LEO-INFRA-DOWNSTREAM-OPERATING-MODEL-PROPAGATION-001 FR-1: flag (advisory, non-blocking) when
// PAID channels exceed 20% of the budget allocation — EHG's GTM is organic-first. Pure + exported.
const PAID_CHANNELS = ['google_ads', 'facebook_instagram', 'paid_search', 'paid_social'];
export function paidBudgetAdvisory(budgetAllocation) {
  const byChannel = (budgetAllocation && budgetAllocation.by_channel) || {};
  const pct = (v) => { const n = parseFloat(String(v).replace('%', '').trim()); return Number.isFinite(n) ? n : 0; };
  const paidPct = Object.entries(byChannel)
    .filter(([ch]) => PAID_CHANNELS.includes(String(ch).toLowerCase()))
    .reduce((sum, [, v]) => sum + pct(v), 0);
  if (paidPct > 20) {
    return { flagged: true, paid_pct: paidPct, message: `Paid channels are ${paidPct}% of budget (>20%) — EHG GTM is organic-first; paid is a later-stage opt-in. Re-weight toward organic.` };
  }
  return { flagged: false, paid_pct: paidPct };
}

/**
 * Pure. Splits the assembled portfolio into the canonical pair payloads.
 * Back-compat contract (TR-3): channels[].{channel,status,enabled,skip_reason}
 * with status pinned 'active' for valid experiments, plus total_channels /
 * active_channels counts (stage-23 reads active_channels; selectOrganicChannel
 * reads channels[].{channel,status}). Message variants live ONLY in the
 * distribution_ad_copy artifact.
 */
export function splitArtifacts(portfolio) {
  const experiments = Array.isArray(portfolio.experiments) ? portfolio.experiments : [];
  const invalidExperiments = Array.isArray(portfolio.invalid_experiments) ? portfolio.invalid_experiments : [];

  const backCompatChannels = [
    ...experiments.map((exp) => ({ channel: exp.channel, status: 'active', enabled: true, skip_reason: null })),
    ...invalidExperiments.map((inv) => ({
      channel: normalizeChannelName(inv.channel || inv.entry?.channel || inv.entry?.name || 'unknown'),
      status: 'skipped',
      enabled: false,
      skip_reason: inv.invalid_reason,
    })),
  ];

  const channelConfig = {
    experiments: experiments.map(({ message_variants: variants, ...rest }) => ({
      ...rest,
      variant_count: Array.isArray(variants) ? variants.length : 0,
    })),
    invalid_experiments: invalidExperiments,
    channels: backCompatChannels,
    total_channels: backCompatChannels.length,
    active_channels: experiments.length,
    budget_allocation: portfolio.budget_allocation || {},
    paid_budget_advisory: paidBudgetAdvisory(portfolio.budget_allocation),
    attribution: 'first_touch',
    thesis_version: portfolio.thesis_version || null,
  };

  const adCopy = {
    channels_with_copy: experiments.map((exp) => ({
      channel: exp.channel,
      persona_mapping: exp.persona_mapping,
      message_variants: exp.message_variants || [],
    })),
    email_sequences: portfolio.email_sequences || [],
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
      logger?.warn?.(`[S21-Distribution] feature flag read error, defaulting OFF: ${error.message}`);
      return false;
    }
    return Boolean(data?.is_enabled);
  } catch (err) {
    logger?.warn?.(`[S21-Distribution] feature flag read threw, defaulting OFF: ${err.message}`);
    return false;
  }
}

async function readDemandThesis(supabase, ventureId, logger) {
  if (!supabase || !ventureId) return null;
  try {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('id, artifact_data, created_at')
      .eq('venture_id', ventureId)
      .eq('artifact_type', THESIS_ARTIFACT_TYPE)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      logger?.warn?.(`[S21-Distribution] demand-thesis read error: ${error.message}`);
      return null;
    }
    return (data && data[0]) || null;
  } catch (err) {
    logger?.warn?.(`[S21-Distribution] demand-thesis read threw: ${err.message}`);
    return null;
  }
}

/** Latest approved chairman 'distribution_skip' decision for this venture, or null. */
async function findApprovedSkipDecision(supabase, ventureId, logger) {
  if (!supabase || !ventureId) return null;
  try {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id, decision, summary, status')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', LIFECYCLE_STAGE)
      .eq('decision_type', SKIP_DECISION_TYPE)
      .in('decision', APPROVED_DECISIONS)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      logger?.warn?.(`[S21-Distribution] skip-decision read error: ${error.message}`);
      return null;
    }
    return (data && data[0]) || null;
  } catch (err) {
    logger?.warn?.(`[S21-Distribution] skip-decision read threw: ${err.message}`);
    return null;
  }
}

/** Existing PENDING distribution_block decision for dedup (FR-5b), or null. */
async function findPendingBlockDecision(supabase, ventureId, logger) {
  if (!supabase || !ventureId) return null;
  try {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', LIFECYCLE_STAGE)
      .eq('decision_type', BLOCK_DECISION_TYPE)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      logger?.warn?.(`[S21-Distribution] pending-block read error: ${error.message}`);
      return null;
    }
    return (data && data[0]) || null;
  } catch (err) {
    logger?.warn?.(`[S21-Distribution] pending-block read threw: ${err.message}`);
    return null;
  }
}

/**
 * Persists the self-describing distribution_block_marker (title NOT NULL).
 * Marks any prior current marker stale first — venture_artifacts has a partial
 * unique index on (venture, stage, type) WHERE is_current=true, so repeated
 * blocks must retire the previous marker.
 */
export async function persistBlockMarker(supabase, ventureId, detail, logger) {
  if (!supabase || !ventureId) return { persisted: false };
  try {
    const { error: staleErr } = await supabase
      .from('venture_artifacts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', LIFECYCLE_STAGE)
      .eq('artifact_type', 'distribution_block_marker')
      .eq('is_current', true);
    if (staleErr) {
      logger?.warn?.(`[S21-Distribution] block marker mark-stale error: ${staleErr.message}`);
    }
    const { error } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: LIFECYCLE_STAGE,
        artifact_type: 'distribution_block_marker',
        title: 'Distribution blocked',
        is_current: true,
        source: ARTIFACT_SOURCE,
        artifact_data: { ...detail, attempted_at: new Date().toISOString() },
      });
    if (error) {
      logger?.warn?.(`[S21-Distribution] block marker persist error: ${error.message}`);
      return { persisted: false, error: error.message };
    }
    return { persisted: true };
  } catch (err) {
    logger?.warn?.(`[S21-Distribution] block marker persist threw: ${err.message}`);
    return { persisted: false, error: err.message };
  }
}

/**
 * FR-5 binding gate. Records (or reuses, dedup) a blocking pending chairman
 * decision, persists the block marker, and returns the {_blocked:true}
 * contract. NEVER emits _skip:true and NEVER persists the canonical pair —
 * advancement stays blocked via the artifact-precondition gate.
 */
async function blockDistribution({ supabase, ventureId, ventureName, reason, detail, logger }) {
  const label = ventureName || ventureId || 'unknown venture';
  logger?.warn?.(`[S21-Distribution] BLOCKED (${reason}) for ${label}`);

  if (!supabase || !ventureId) {
    return { _blocked: true, block_reason: reason, block_detail: detail || null, decision_id: null, persisted: false };
  }

  let decisionId = null;
  let decisionError = null;
  const existing = await findPendingBlockDecision(supabase, ventureId, logger);
  if (existing) {
    decisionId = existing.id;
    logger?.info?.(`[S21-Distribution] reusing pending ${BLOCK_DECISION_TYPE} decision ${decisionId}`);
  } else {
    // camelCase opts are the helper's real API (decisionType/lifecycleStage/title) —
    // snake_case keys would silently default to session_question @ stage 0.
    const res = await recordPendingDecision(supabase, {
      title: `Distribution blocked for ${label}: ${reason}`,
      decisionType: BLOCK_DECISION_TYPE,
      lifecycleStage: LIFECYCLE_STAGE,
      ventureId,
      blocking: true,
      context: { block_reason: reason, detail: detail || null },
    });
    if (res.recorded) {
      decisionId = res.id;
    } else {
      // NC-7: a zero-row decision write must surface loudly, not vanish into a warn.
      decisionError = res.error || 'unknown insert failure';
      logger?.warn?.(`[S21-Distribution] chairman decision insert FAILED: ${decisionError} — venture stays blocked via withheld artifacts`);
    }
  }

  await persistBlockMarker(supabase, ventureId, {
    block_reason: reason,
    detail: detail || null,
    decision_id: decisionId,
    ...(decisionError ? { decision_insert_error: decisionError } : {}),
  }, logger);

  return { _blocked: true, block_reason: reason, block_detail: detail || null, decision_id: decisionId };
}

/**
 * FR-7 skip valve. An APPROVED chairman distribution_skip decision is honored
 * by writing one BUILD_DEVIATION_RECORD per canonical type (the existing
 * artifact-gate valve: the gate matches artifact_data->>artifact_ref and then
 * reports deviated-not-blocking). recordDeviation THROWS unless weight + a
 * non-empty why are supplied.
 */
async function applyApprovedSkip({ supabase, ventureId, decision, logger }) {
  const deviationIds = [];
  const errors = [];
  for (const artifactRef of CANONICAL_PAIR_TYPES) {
    try {
      const id = await recordDeviation(supabase, {
        ventureId,
        artifactRef,
        what: `${artifactRef} (Distribution stage canonical output)`,
        instead: 'Distribution stage skipped by explicit chairman decision',
        why: `Chairman-approved distribution skip (chairman_decisions ${decision.id}): ${decision.summary || 'no summary recorded'}`,
        decidedBy: 'chairman',
        weight: 'declared-descope',
        lifecycleStage: LIFECYCLE_STAGE,
      });
      deviationIds.push(id);
    } catch (err) {
      errors.push(`${artifactRef}: ${err.message}`);
      logger?.warn?.(`[S21-Distribution] deviation record failed for ${artifactRef}: ${err.message}`);
    }
  }

  await persistBlockMarker(supabase, ventureId, {
    block_reason: 'skipped_by_chairman_decision',
    skipped_by_decision: true,
    decision_id: decision.id,
    deviation_ids: deviationIds,
    ...(errors.length ? { deviation_errors: errors } : {}),
  }, logger);

  logger?.info?.(`[S21-Distribution] skip honored via chairman decision ${decision.id} (${deviationIds.length}/${CANONICAL_PAIR_TYPES.length} deviation records)`);
  return {
    _blocked: true,
    skipped_by_decision: true,
    decision_id: decision.id,
    deviation_ids: deviationIds,
    ...(errors.length ? { deviation_errors: errors } : {}),
  };
}

export async function persistCanonicalPair(supabase, ventureId, channelConfig, adCopy, fullResult, options) {
  if (!supabase || !ventureId) {
    options.logger?.warn?.('[S21-Distribution] persistCanonicalPair skipped: no supabase or ventureId');
    return { persisted: false, reason: 'no_supabase_or_ventureId' };
  }

  // venture_artifacts.title is NOT NULL (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-B FR-4).
  const writes = [
    { artifact_type: 'distribution_channel_config', title: 'Distribution channel config', artifact_data: channelConfig },
    { artifact_type: 'distribution_ad_copy', title: 'Distribution ad copy', artifact_data: adCopy },
  ];

  if (options.dualEmit) {
    writes.push({
      artifact_type: 'launch_deployment_runbook',
      title: 'Launch deployment runbook',
      artifact_data: fullResult,
    });
  }

  const persisted = [];
  for (const w of writes) {
    const { error: e1 } = await supabase
      .from('venture_artifacts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', LIFECYCLE_STAGE)
      .eq('artifact_type', w.artifact_type)
      .eq('is_current', true);
    if (e1) {
      options.logger?.warn?.(`[S21-Distribution] mark-stale error on ${w.artifact_type}: ${e1.message}`);
    }

    const { error: e2 } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: LIFECYCLE_STAGE,
        artifact_type: w.artifact_type,
        title: w.title,
        is_current: true,
        source: ARTIFACT_SOURCE,
        artifact_data: w.artifact_data,
      });
    if (e2) {
      options.logger?.warn?.(`[S21-Distribution] insert error on ${w.artifact_type}: ${e2.message}`);
    } else {
      persisted.push(w.artifact_type);
    }
  }
  return { persisted: persisted.length > 0, types: persisted };
}

function buildGenerationPrompt(derivedChannels, ventureName) {
  const channelLines = derivedChannels
    .map((c) => `- channel: "${c.channel}" (thesis name: "${c.source_channel}"${c.channel_type ? `, type: ${c.channel_type}` : ''}) → persona: "${c.persona}"${c.cost_hypothesis ? ` | cost hypothesis: ${c.cost_hypothesis}` : ''}`)
    .join('\n');

  const system = `You are EVA's Distribution Planner. Design a ranked, budget-boxed channel-experiment portfolio for the channels DERIVED FROM THIS VENTURE'S DEMAND THESIS. Do not invent channels beyond the provided list; do not omit any provided channel.

Output valid JSON:
{
  "experiments": [
    {
      "channel": "<exactly one of the provided channel names>",
      "rank": 1,
      "hypothesis": "Falsifiable statement of why this channel reaches the mapped persona",
      "persona_mapping": "<the provided persona for this channel>",
      "cost_to_signal_bound": "Budget box, e.g. '$50 or 10 hours to reach 100 relevant strangers'",
      "success_criteria": "Measurable funnel target, e.g. '25 landing visits, 5 waitlist signups in 14 days'",
      "kill_criteria": "Pre-set kill condition, e.g. '<1% CTR after 200 impressions'",
      "execution_tier": "T0|T1|T2",
      "message_variants": [
        { "variant_id": "A", "headline": "...", "body": "...", "cta": "..." },
        { "variant_id": "B", "headline": "...", "body": "...", "cta": "..." }
      ],
      "utm": { "utm_source": "<channel>", "utm_medium": "<taxonomy type>", "utm_campaign": "<venture>-launch" }
    }
  ],
  "email_sequences": [
    { "sequence_name": "welcome|onboarding|reengagement", "emails_count": 3, "cadence": "Day 0, Day 3, Day 7", "preview": "Brief description" }
  ],
  "budget_allocation": { "total_monthly": "...", "by_channel": { "<channel>": "N%" } }
}

Rules:
- EXACTLY one experiment per provided channel; rank ALL experiments by expected cost-to-signal (cheapest signal first).
- Every experiment carries AT LEAST 2 message variants (the message-test protocol: variants are compared by conversion).
- Execution tiers: T0 = deterministic/template-level, T1/T2 = cheap-model content production per the D2 allocation matrix.
- UTM discipline on every experiment; attribution is first-touch.

${getOperatingModelPromptBlock()}

DISTRIBUTION RULES (EHG operating model — organic-first GTM, solo + AI-agent):
- ORGANIC channels are the PRIMARY/default at launch; PAID channels are a later-stage opt-in with $0 budget at launch.
- budget_allocation at launch should be ~$0 paid: weight organic. Total monthly should reflect the operating-model marketing band ($0-200/mo).`;

  const user = `Design the channel-experiment portfolio for: ${ventureName}\n\nTHESIS-DERIVED CHANNELS (persona×channel JOIN already enforced):\n${channelLines}`;
  return { system, user };
}

/**
 * Pure. Assembles per-channel experiments from the generator output against the
 * derived channel set (fail-partial): every derived channel needs exactly one
 * well-formed experiment; malformed/missing/off-thesis entries are invalidated
 * individually.
 */
export function assembleExperiments(derivedChannels, generated) {
  const rawExperiments = Array.isArray(generated?.experiments) ? generated.experiments : [];
  const byChannel = new Map();
  for (const exp of rawExperiments) {
    const key = normalizeChannelName(exp?.channel);
    if (!byChannel.has(key)) byChannel.set(key, exp);
  }

  const valid = [];
  const invalid = [];
  const derivedKeys = new Set(derivedChannels.map((c) => c.channel));

  for (const derived of derivedChannels) {
    const exp = byChannel.get(derived.channel);
    if (!exp) {
      invalid.push({ channel: derived.channel, entry: derived, invalid_reason: 'not_generated: generator returned no experiment for this thesis channel' });
      continue;
    }
    const candidate = {
      ...exp,
      channel: derived.channel,
      source_channel: derived.source_channel,
      channel_type: derived.channel_type,
      persona_mapping: exp.persona_mapping || derived.persona,
      cost_hypothesis: derived.cost_hypothesis,
    };
    const check = validateExperiment(candidate);
    if (check.valid) {
      valid.push(candidate);
    } else {
      invalid.push({ channel: derived.channel, entry: exp, invalid_reason: check.reasons.join('; ') });
    }
  }

  for (const exp of rawExperiments) {
    const key = normalizeChannelName(exp?.channel);
    if (!derivedKeys.has(key)) {
      invalid.push({ channel: key, entry: exp, invalid_reason: 'not_in_thesis: generator proposed a channel outside the thesis CHANNEL claim' });
    }
  }

  return { valid, invalid };
}

export async function analyzeStage22Distribution(params) {
  const normalized = normalizeUpstreamParams(params);
  const {
    stage7Data, stage10Data, stage12Data, stage18Data,
    ventureName, ventureId, supabase,
    logger = console,
  } = normalized;

  logger.info?.(`[S21-Distribution] Planning thesis-derived distribution for ${ventureName || 'unknown'}`);

  // FR-7: the ONLY skip path — an approved chairman distribution_skip decision.
  const skipDecision = await findApprovedSkipDecision(supabase, ventureId, logger);
  if (skipDecision) {
    return applyApprovedSkip({ supabase, ventureId, decision: skipDecision, logger });
  }

  // FR-1/FR-5: the demand thesis is the hard input. Absent/invalid → binding block.
  if (!supabase || !ventureId) {
    return blockDistribution({
      supabase, ventureId, ventureName, logger,
      reason: 'no_supabase_or_ventureId',
      detail: 'Distribution planning requires database access to read the demand thesis',
    });
  }

  const thesisRow = await readDemandThesis(supabase, ventureId, logger);
  if (!thesisRow) {
    let gapDetail = null;
    try {
      const gap = await describeArtifactGap({
        supabase, ventureId, stage: LIFECYCLE_STAGE,
        requiredTypes: [THESIS_ARTIFACT_TYPE],
        logger,
      });
      if (gap) gapDetail = gap.rendered;
    } catch { /* fail-soft */ }
    return blockDistribution({
      supabase, ventureId, ventureName, logger,
      reason: 'demand_thesis_missing',
      detail: gapDetail || `No current ${THESIS_ARTIFACT_TYPE} artifact exists for this venture`,
    });
  }

  const parsedThesis = validateThesisChannelClaim(thesisRow.artifact_data);
  if (!parsedThesis.ok) {
    return blockDistribution({
      supabase, ventureId, ventureName, logger,
      reason: 'demand_thesis_invalid',
      detail: parsedThesis.problems.join('; '),
    });
  }

  const derivation = deriveChannelsFromThesis(parsedThesis);
  if (derivation.channels.length === 0) {
    return blockDistribution({
      supabase, ventureId, ventureName, logger,
      reason: 'no_joinable_channels',
      detail: derivation.invalid.map((i) => i.invalid_reason).join('; ') || 'CHANNEL claim yielded no persona-joinable channels',
    });
  }

  // Portfolio generation: one retry, then binding block. NO fabricated fallback
  // portfolio (TR-4) — a recorded block is strictly more honest than fake data.
  const { system, user } = buildGenerationPrompt(derivation.channels, ventureName);
  const context = {
    gtm_strategy: stage12Data || {},
    personas: stage10Data || {},
    marketing_copy: stage18Data || {},
    pricing: stage7Data || {},
  };
  let generated = null;
  let usage = {};
  let lastErr = null;
  for (let attempt = 1; attempt <= 2 && !generated; attempt++) {
    try {
      const client = getLLMClient();
      const response = await client.complete(system, `${user}\n\nOptional context:\n${JSON.stringify(context, null, 2)}`);
      const parsed = parseJSON(response);
      usage = extractUsage(response) || {};
      if (parsed && Array.isArray(parsed.experiments)) {
        generated = parsed;
      } else {
        lastErr = new Error('generator output missing experiments[]');
      }
    } catch (err) {
      lastErr = err;
      logger.warn?.(`[S21-Distribution] generation attempt ${attempt} failed: ${err.message}`);
    }
  }
  if (!generated) {
    return blockDistribution({
      supabase, ventureId, ventureName, logger,
      reason: 'generation_failed',
      detail: lastErr?.message || 'portfolio generation failed after retry',
    });
  }

  // FR-4 fail-partial: per-experiment validation; JOIN gaps merge in as invalid entries.
  const assembly = assembleExperiments(derivation.channels, generated);
  const invalidExperiments = [
    ...derivation.invalid.map((i) => ({ channel: normalizeChannelName(i.entry?.channel || i.entry?.name || 'unknown'), entry: i.entry, invalid_reason: i.invalid_reason })),
    ...assembly.invalid,
  ];
  if (assembly.valid.length === 0) {
    return blockDistribution({
      supabase, ventureId, ventureName, logger,
      reason: 'all_experiments_invalid',
      detail: invalidExperiments.map((i) => `${i.channel}: ${i.invalid_reason}`).join(' | '),
    });
  }
  if (invalidExperiments.length > 0) {
    logger.warn?.(`[S21-Distribution] fail-partial: ${invalidExperiments.length} invalidated entr${invalidExperiments.length === 1 ? 'y' : 'ies'} (${assembly.valid.length} valid persist)`);
  }

  const portfolio = {
    experiments: rankExperiments(assembly.valid),
    invalid_experiments: invalidExperiments,
    email_sequences: generated.email_sequences || [],
    budget_allocation: generated.budget_allocation || {},
    thesis_version: thesisRow.id || null,
  };

  const flagEnabled = await readFeatureFlag(supabase, logger);
  const { channelConfig, adCopy } = splitArtifacts(portfolio);
  const fullResult = {
    ...channelConfig,
    experiments: portfolio.experiments,
    email_sequences: portfolio.email_sequences,
    channels_with_copy: adCopy.channels_with_copy.length,
    usage,
  };

  await persistCanonicalPair(
    supabase, ventureId,
    channelConfig, adCopy, fullResult,
    { dualEmit: !flagEnabled, logger },
  );

  // FR-004 (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D): pre-launch Growth Playbook co-output.
  // Runs unconditionally on the success path; failures are swallowed (non-blocking).
  let growthCoOutput;
  try {
    growthCoOutput = await runPrelaunchGrowthCoOutput({
      supabase, ventureId, ventureName,
      context: {
        gtm_strategy: stage12Data || {},
        personas: stage10Data || {},
        pricing: stage7Data || {},
        marketing_copy: stage18Data || {},
        distribution: channelConfig,
      },
      logger,
    });
  } catch (err) {
    logger.warn?.(`[S21-Distribution] pre-launch growth co-output failed (non-blocking): ${err.message}`);
    growthCoOutput = { status: 'skipped', reason: 'unexpected_error' };
  }

  return {
    ...fullResult,
    _canonical_pair: { channelConfig, adCopy },
    _flag_enabled: flagEnabled,
    _dual_emitted: !flagEnabled,
    _growth_co_output: growthCoOutput,
  };
}

export {
  THESIS_ARTIFACT_TYPE,
  BLOCK_DECISION_TYPE,
  SKIP_DECISION_TYPE,
  APPROVED_DECISIONS,
  REQUIRED_UPSTREAM,
  FEATURE_FLAG_KEY,
  LEGACY_CHANNEL_NAME_MAP,
};
