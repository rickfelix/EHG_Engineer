/**
 * Stage 23 Analysis Step — Launch Readiness Kill Gate
 * SD: SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 (FR-1, FR-3, FR-4)
 *
 * Aggregates readiness signals from S20-S22. Returns checklist with
 * pass/fail/advisory per category and overall launch verdict.
 *
 * FR-3 (ADVISORY mode):
 *   analytics, monitoring categories are ADVISORY (PASS-eligible; verdict logic
 *   ignores them when computing kill-gate fail), never REQUIRED. Originally
 *   neither had an automated producer and both fell back to a bare "chairman
 *   attestation suffices" string (risk-agent recommendation, sub_agent_execution_
 *   results 081c9190). Both are now backed by real producers wired at the
 *   checklist layer -- analytics via checkTelemetryAnalyticsWired
 *   (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C) and monitoring via
 *   checkVentureUptimeWired (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F) -- so the
 *   detail text is data-driven; only an actual read failure still falls back to
 *   the original static string.
 *
 * SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5, chairman-ratified 2026-07-12): 'legal' is
 *   REMOVED from ADVISORY_CATEGORIES now that lib/eva/legal-doc-producer.js exists.
 *   It is scored REQUIRED: a venture without a generated Terms of Service AND
 *   Privacy Policy (venture_legal_overrides, generated_at IS NOT NULL) fails the
 *   category, which forces the overall verdict to HOLD (not silently advisory).
 *
 * FR-4 (canonical-upstream verification + SKIP fallback):
 *   Before scoring, verify canonical upstream artifacts exist with is_current=true:
 *     S20: code_quality_report (canonical) or build_quality_score (legacy)
 *     S21: visual_device_screenshots OR visual_social_graphics
 *     S22: distribution_channel_config OR distribution_ad_copy
 *   If any required upstream missing, emit a structured 'custom' eva event with
 *   event_data.subtype='stage_skipped' + reason='upstream_missing'. Returns a
 *   SKIPPED verdict (does NOT block; surfaces a banner via the event).
 *   NOTE (documentation only): the "S20/S21/S22" labels above describe which
 *   lifecycle stage each artifact_type is historically produced at, for a
 *   reader's orientation. They are NOT read at runtime to score the checklist
 *   below (SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-1) -- code_quality,
 *   marketing_assets, and distribution_channels each read preflightUpstream's
 *   artifactData Map directly by artifact_type, never a CROSS_STAGE_DEPS-derived
 *   stageNData positional param.
 */

// SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-4): per-mode evidence via the shared helper.
import { getLaunchModeStrict, isLiveMode } from '../../launch-mode.js';
import { collectExternalObservations } from '../../external-observation.js';
import { evaluateModeEvidence } from '../../mode-evidence.js';
import {
  verifyCapabilityWired, readCapabilityOverrides, WIRED_CAPABILITY_FEEDBACK_TYPES,
} from '../../utils/validate-venture-default-capabilities.js';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../config/venture-default-capabilities.js';
import { getLatestProbeStatus } from '../../../ops/venture-uptime-probe.js';
import { createLogger } from '../../../logger.js';

const moduleLogger = createLogger('S23LaunchReadiness');

// SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5): 'legal' moved out of ADVISORY_CATEGORIES
// into REQUIRED_CATEGORIES now that a real producer (legal-doc-producer.js)
// exists to satisfy it. Scoring for 'legal' is a dedicated case (see
// checkRequiredLegalDocs / the 'legal' switch branch below), not the generic
// REQUIRED default-pending fallback.
const REQUIRED_CATEGORIES = ['code_quality', 'marketing_assets', 'distribution_channels', 'legal'];
const ADVISORY_CATEGORIES = ['analytics', 'monitoring'];
const CATEGORIES = [...REQUIRED_CATEGORIES, ...ADVISORY_CATEGORIES];
const REQUIRED_LEGAL_TEMPLATE_TYPES = ['terms_of_service', 'privacy_policy'];

// FR-005 (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D): growth_playbook (the pre-launch
// artifact produced by the stage-21 Distribution co-output) and distribution_ad_copy
// become REQUIRED launch categories when LEO_S21_GROWTH_PLAYBOOK_REQUIRED is enabled,
// and ADVISORY (PASS-eligible, non-blocking) when it is OFF — so in-flight ventures
// lacking a pre-launch playbook are NOT blocked during rollout. Default OFF keeps the
// REQUIRED set and verdict byte-identical to the pre-001-D baseline.
const GROWTH_CATEGORIES = ['growth_playbook', 'distribution_ad_copy'];
const GROWTH_FLAG_KEY = 'LEO_S21_GROWTH_PLAYBOOK_REQUIRED';

// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3: verifyCapabilityWired's per-capability
// result joins the checklist as 7 distinct REQUIRED rows, never a single rolled-up
// advisory string. 'capability:' prefix namespaces these from every other category name.
// Gated behind LEO_S24_CAPABILITY_CHECKLIST_REQUIRED (default OFF), mirroring
// LEO_S21_GROWTH_PLAYBOOK_REQUIRED above -- unflagged, EVERY in-flight venture would
// flip HOLD immediately (measured: existing test fixtures with no capability data all
// regressed READY->HOLD once these categories were unconditionally REQUIRED). Default
// OFF keeps every existing venture's checklist/verdict byte-identical until this SD's
// own rollout explicitly enables it (first for AltifyAI, per the PRD's R-1 mitigation).
const CAPABILITY_CHECKLIST_FLAG_KEY = 'LEO_S24_CAPABILITY_CHECKLIST_REQUIRED';
const CAPABILITY_CATEGORY_PREFIX = 'capability:';
const CAPABILITY_IDS = EHG_VENTURE_DEFAULT_CAPABILITIES.map((c) => c.capability_id);
const CAPABILITY_CATEGORIES = CAPABILITY_IDS.map((id) => `${CAPABILITY_CATEGORY_PREFIX}${id}`);
// Only capabilities with a ground-truth wiring signal (WIRED_CAPABILITY_FEEDBACK_TYPES
// keys, plus telemetry-analytics which is RPC-verified) may NEVER be overridden -- the
// override path exists only for the remaining capabilities, which have no signal at all.
const SIGNAL_BACKED_CAPABILITY_IDS = new Set([...Object.keys(WIRED_CAPABILITY_FEEDBACK_TYPES), 'telemetry-analytics']);

// FR-4 canonical upstream artifact types per stage. Each row is OR-able (any of
// these names satisfy the upstream requirement; venture-level any-of). The
// optional flag means missing-but-not-required.
const UPSTREAM_REQUIREMENTS = [
  { stage: 20, anyOf: ['code_quality_report', 'build_quality_score'] },
  { stage: 21, anyOf: ['visual_device_screenshots', 'visual_social_graphics'] },
  { stage: 22, anyOf: ['distribution_channel_config', 'distribution_ad_copy'] },
];

/**
 * FR-005/FR-006: read LEO_S21_GROWTH_PLAYBOOK_REQUIRED. Default OFF (advisory) on any
 * absence/error so in-flight ventures are never blocked by the rollout. Mirrors the
 * stage-22-distribution-setup.js readFeatureFlag pattern (leo_feature_flags table).
 */
async function readFeatureFlag(supabase, flagKey, logger) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('leo_feature_flags')
      .select('is_enabled')
      .eq('flag_key', flagKey)
      .maybeSingle();
    if (error) {
      logger?.warn?.(`[S23-LaunchReadiness] ${flagKey} read error, defaulting OFF: ${error.message}`);
      return false;
    }
    return Boolean(data?.is_enabled);
  } catch (err) {
    logger?.warn?.(`[S23-LaunchReadiness] ${flagKey} read threw, defaulting OFF: ${err.message}`);
    return false;
  }
}

async function readGrowthPlaybookRequiredFlag(supabase, logger) {
  return readFeatureFlag(supabase, GROWTH_FLAG_KEY, logger);
}

// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3: default OFF, same rollout-safety
// contract as readGrowthPlaybookRequiredFlag above.
async function readCapabilityChecklistRequiredFlag(supabase, logger) {
  return readFeatureFlag(supabase, CAPABILITY_CHECKLIST_FLAG_KEY, logger);
}

/**
 * FR-4: Verify canonical upstream artifacts exist for a venture before scoring.
 *
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 (FR-1): widened to also return each
 * artifact's artifact_data, keyed by artifact_type, so the checklist scorer below
 * can read the artifact OF RECORD directly instead of a CROSS_STAGE_DEPS-derived
 * stageNData param -- measured live: CROSS_STAGE_DEPS[24] (lib/eva/contracts/
 * stage-contracts.js) never included stage 20, so stage20Data.verdict was
 * permanently undefined for code_quality regardless of this file's own logic.
 * This lookup is independent of CROSS_STAGE_DEPS entirely.
 *
 * @returns {Promise<{ok: boolean, missing: Array<{stage, anyOf}>, present: Set<string>, artifactData: Map<string, object>}>}
 */
async function preflightUpstream({ supabase, ventureId, requirements = UPSTREAM_REQUIREMENTS, logger }) {
  if (!supabase || !ventureId) {
    logger?.warn?.('[S23-LaunchReadiness] preflight skipped: missing supabase or ventureId');
    return { ok: true, missing: [], present: new Set(), artifactData: new Map() };
  }
  // Probe the gating requirement types PLUS the FR-005 growth categories (so the
  // checklist can score growth_playbook/distribution_ad_copy from artifact presence
  // even while they are ADVISORY). Gating (`missing`) is computed only from `requirements`.
  const probeTypes = [...new Set([...requirements.flatMap(r => r.anyOf), ...GROWTH_CATEGORIES])];
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, is_current, artifact_data')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', probeTypes)
    // Provably bounded (count-truncation-diff-lint): at most one current row per
    // (venture, artifact_type), and probeTypes is always a small, fixed-size set
    // (UPSTREAM_REQUIREMENTS + GROWTH_CATEGORIES) -- 50 is a generous literal cap,
    // far above any realistic probe-type-list size.
    .limit(50);
  if (error) {
    logger?.warn?.(`[S23-LaunchReadiness] preflight DB error (treating as ok): ${error.message}`);
    return { ok: true, missing: [], present: new Set(), artifactData: new Map() };
  }
  const present = new Set((data || []).map(r => r.artifact_type));
  // Payloads live in artifact_data (JSONB), never content -- verified live: content
  // is NULL on the visual/distribution artifacts this checklist reads.
  const artifactData = new Map((data || []).map(r => [r.artifact_type, r.artifact_data]));
  const missing = requirements.filter(r => !r.anyOf.some(t => present.has(t)));
  return { ok: missing.length === 0, missing, present, artifactData };
}

/**
 * SD-FDBK-FIX-BUILD-LEGAL-DOC-001: precompute legal-doc presence (mirrors the
 * preflightUpstream precompute-before-map pattern used for growth categories,
 * since the checklist .map() below is synchronous). Any DB error or missing
 * data resolves to hasRequired=false (fail-closed -- a read error must not
 * silently pass the gate).
 */
async function checkRequiredLegalDocs({ supabase, ventureId, logger }) {
  if (!supabase || !ventureId) return { hasRequired: false, presentTypes: new Set() };
  try {
    const { data, error } = await supabase
      .from('venture_legal_overrides')
      .select('template_id, generated_at, legal_templates!inner(template_type)')
      .eq('venture_id', ventureId)
      .eq('is_active', true)
      .not('generated_at', 'is', null);
    if (error) {
      logger?.warn?.(`[S23-LaunchReadiness] legal docs check DB error (treating as not present): ${error.message}`);
      return { hasRequired: false, presentTypes: new Set() };
    }
    const presentTypes = new Set((data || []).map((r) => r.legal_templates?.template_type).filter(Boolean));
    const hasRequired = REQUIRED_LEGAL_TEMPLATE_TYPES.every((t) => presentTypes.has(t));
    return { hasRequired, presentTypes };
  } catch (err) {
    logger?.warn?.(`[S23-LaunchReadiness] legal docs check threw (treating as not present): ${err.message}`);
    return { hasRequired: false, presentTypes: new Set() };
  }
}

/**
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: precompute telemetry-analytics wired status
 * (mirrors the checkRequiredLegalDocs precompute-before-map pattern, since the checklist
 * .map() below is synchronous). 'analytics' stays in ADVISORY_CATEGORIES -- this makes the
 * checklist detail text data-driven, it does not change verdict logic. Any error (RPC
 * failure, missing sink) degrades to the existing generic advisory message, never a thrown
 * exception into the checklist build.
 */
async function checkTelemetryAnalyticsWired({ supabase, ventureId, logger }) {
  if (!supabase || !ventureId) return null;
  try {
    return await verifyCapabilityWired(supabase, ventureId, 'telemetry-analytics');
  } catch (err) {
    logger?.warn?.(`[S23-LaunchReadiness] telemetry-analytics check threw (falling back to generic advisory): ${err.message}`);
    return null;
  }
}

/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3: precompute all 7 capabilities'
 * wired status plus any recorded overrides (mirrors the checkRequiredLegalDocs /
 * checkTelemetryAnalyticsWired precompute-before-map pattern, since the checklist
 * .map() below is synchronous). Never throws -- a per-capability check failure
 * degrades that capability to wired:false (fail-closed), the overall precompute
 * always returns a full map.
 * @returns {Promise<Map<string, {wired: boolean, reason: string}>>}
 */
async function precheckCapabilities({ supabase, ventureId, logger }) {
  if (!supabase || !ventureId) return new Map();
  const entries = await Promise.all(
    CAPABILITY_IDS.map(async (id) => {
      try {
        const result = await verifyCapabilityWired(supabase, ventureId, id);
        return [id, result];
      } catch (err) {
        logger?.warn?.(`[S23-LaunchReadiness] capability check threw for ${id} (treating as not wired): ${err.message}`);
        return [id, { wired: false, reason: `check threw: ${err.message}` }];
      }
    })
  );
  return new Map(entries);
}

/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.3): precompute venture-uptime-probe wired
 * status (mirrors checkTelemetryAnalyticsWired's precompute-before-map pattern, since the
 * checklist .map() below is synchronous). 'monitoring' stays in ADVISORY_CATEGORIES --
 * this makes the checklist detail text data-driven, it does not change verdict logic. Any
 * error (missing/erroring venture_deployments read, including a test fixture that throws
 * on an unmocked table) degrades to the existing generic advisory message, never a thrown
 * exception into the checklist build.
 */
async function checkVentureUptimeWired({ supabase, ventureId, logger }) {
  if (!supabase || !ventureId) return null;
  try {
    return await getLatestProbeStatus(supabase, ventureId);
  } catch (err) {
    logger?.warn?.(`[S23-LaunchReadiness] uptime probe check threw (falling back to generic advisory): ${err.message}`);
    return null;
  }
}

/**
 * FR-4: Emit a stage_skipped eva_orchestration_events row (event_type='custom',
 * subtype='stage_skipped'). Non-blocking on failure.
 */
async function emitStageSkippedEvent({ supabase, ventureId, missing, logger }) {
  if (!supabase || !ventureId) return;
  try {
    const { error } = await supabase.from('eva_orchestration_events').insert({
      event_type: 'custom',
      event_source: 'stage-23-launch-readiness',
      venture_id: ventureId,
      event_data: {
        subtype: 'stage_skipped',
        stage_number: 23,
        reason: 'upstream_missing',
        missing: missing.map(m => ({ stage: m.stage, anyOf: m.anyOf })),
        sd_origin: 'SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001',
        emitted_at: new Date().toISOString(),
      },
      chairman_flagged: false,
    });
    if (error) logger?.warn?.(`[S23-LaunchReadiness] stage_skipped emit failed: ${error.message}`);
  } catch (err) {
    logger?.warn?.(`[S23-LaunchReadiness] stage_skipped emit threw: ${err.message}`);
  }
}

export async function analyzeStage23LaunchReadiness(params) {
  const {
    ventureName, supabase, ventureId,
    logger = moduleLogger,
  } = params;

  logger.info?.(`[S23-LaunchReadiness] Aggregating readiness for ${ventureName || 'unknown'}`);

  // FR-005/FR-006: growth_playbook + distribution_ad_copy join the checklist as REQUIRED
  // categories ONLY when LEO_S21_GROWTH_PLAYBOOK_REQUIRED is ON. When OFF (default) they
  // are entirely absent — the checklist, counts, verdict, and REQUIRED set are byte-identical
  // to the pre-001-D baseline, so no in-flight venture is affected by the rollout.
  const growthRequired = await readGrowthPlaybookRequiredFlag(supabase, logger);
  // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3: default OFF -- see
  // CAPABILITY_CHECKLIST_FLAG_KEY's own comment for why this must be flagged.
  const capabilityChecklistRequired = await readCapabilityChecklistRequiredFlag(supabase, logger);
  const allCategories = [
    ...CATEGORIES,
    ...(growthRequired ? GROWTH_CATEGORIES : []),
    ...(capabilityChecklistRequired ? CAPABILITY_CATEGORIES : []),
  ];

  // FR-4: Preflight canonical-upstream check; SKIP if any required upstream missing.
  // The SKIP-gating upstream set stays at the pre-001-D baseline in BOTH flag states
  // (growth_playbook is gated via the REQUIRED checklist mode below, not via SKIP — so
  // an absent playbook yields NOT_READY, not a non-blocking SKIPPED). The preflight
  // still probes growth_playbook/distribution_ad_copy presence for checklist scoring.
  const preflight = await preflightUpstream({ supabase, ventureId, logger });
  if (!preflight.ok) {
    await emitStageSkippedEvent({ supabase, ventureId, missing: preflight.missing, logger });
    return {
      checklist: [],
      verdict: 'SKIPPED',
      skip_reason: 'upstream_missing',
      missing_upstream: preflight.missing,
      venture_name: ventureName,
      pass_count: 0,
      fail_count: 0,
      pending_count: 0,
      advisory_count: 0,
      total_categories: allCategories.length,
      readiness_pct: 0,
    };
  }

  // SD-FDBK-FIX-BUILD-LEGAL-DOC-001: precompute before the sync .map() below.
  const legalDocsCheck = await checkRequiredLegalDocs({ supabase, ventureId, logger });
  // SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: precompute before the sync .map() below.
  const telemetryAnalyticsCheck = await checkTelemetryAnalyticsWired({ supabase, ventureId, logger });
  // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3: precompute before the sync .map() below.
  // Skipped entirely when the flag is OFF -- CAPABILITY_CATEGORIES isn't in allCategories
  // in that case, so these maps would go unused, and skipping avoids requiring every
  // caller's supabase mock to implement venture_capability_overrides.
  const capabilityWiredMap = capabilityChecklistRequired
    ? await precheckCapabilities({ supabase, ventureId, logger })
    : new Map();
  const capabilityOverrides = capabilityChecklistRequired
    ? await readCapabilityOverrides({ supabase, ventureId, logger })
    : new Map();
  // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.3): precompute before the sync .map() below.
  const ventureUptimeCheck = await checkVentureUptimeWired({ supabase, ventureId, logger });

  const checklist = allCategories.map(cat => {
    const isAdvisory = ADVISORY_CATEGORIES.includes(cat);
    let status = 'pending';
    let detail = '';

    // FR-3: capability rows are keyed by a dynamic 'capability:<id>' category name, so
    // they can't be a static switch-case label -- handled here before the switch.
    if (cat.startsWith(CAPABILITY_CATEGORY_PREFIX)) {
      const capabilityId = cat.slice(CAPABILITY_CATEGORY_PREFIX.length);
      const wiredResult = capabilityWiredMap.get(capabilityId) || { wired: false, reason: 'not checked' };
      if (wiredResult.wired) {
        status = 'pass';
        detail = `Wired: ${wiredResult.reason}`;
      } else if (!SIGNAL_BACKED_CAPABILITY_IDS.has(capabilityId) && capabilityOverrides.has(capabilityId)) {
        // Only a no-signal capability may be overridden; a signal-backed capability
        // (feedback-widget, error-capture-middleware, telemetry-analytics) can only
        // reach pass via a genuine wired:true read, matching this FR's own rule.
        status = 'pass';
        detail = `Overridden: ${capabilityOverrides.get(capabilityId).override_reason}`;
      } else {
        status = 'fail';
        detail = SIGNAL_BACKED_CAPABILITY_IDS.has(capabilityId)
          ? `Not wired (no override permitted -- has a ground-truth signal): ${wiredResult.reason}`
          : `Not wired, no override recorded: ${wiredResult.reason}`;
      }
      return { category: cat, status, detail, mode: 'REQUIRED' };
    }

    switch (cat) {
      // SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 (FR-1): reads the artifact of record
      // directly by artifact_type (preflight.artifactData), not a CROSS_STAGE_DEPS-
      // derived stageNData param -- measured live: CROSS_STAGE_DEPS[24] never included
      // stage 20, so stage20Data.verdict was permanently undefined here regardless of
      // this file's own logic. code_quality_report is canonical; build_quality_score is
      // the legacy artifact_type this same UPSTREAM_REQUIREMENTS anyOf also accepts.
      case 'code_quality': {
        const cq = preflight.artifactData.get('code_quality_report') || preflight.artifactData.get('build_quality_score');
        if (cq?.verdict === 'PASS') { status = 'pass'; detail = 'Code quality gate passed'; }
        else if (cq?.verdict === 'FAIL') { status = 'fail'; detail = `${cq?.summary?.by_severity?.critical || 0} critical issues`; }
        else if (cq?.verdict === 'WARN') { status = 'warn'; detail = 'Warnings present but no critical issues'; }
        break;
      }
      // FR-1: real per-artifact-type counts (total_screenshots / total_socials) --
      // total_assets is not a field either visual artifact actually emits.
      case 'marketing_assets': {
        const screenshots = preflight.artifactData.get('visual_device_screenshots')?.total_screenshots ?? 0;
        const socials = preflight.artifactData.get('visual_social_graphics')?.total_socials ?? 0;
        const assets = screenshots + socials;
        if (assets > 0) { status = 'pass'; detail = `${assets} assets generated (${screenshots} screenshots, ${socials} social graphics)`; }
        break;
      }
      // FR-1: distribution_channel_config carries no channel-count field of any kind
      // (measured live: files/opt_in/status/deployed/page_type/hero_proof/pricing_shown/etc,
      // no active_channels) -- score its real status/deployed fields instead.
      case 'distribution_channels': {
        const dist = preflight.artifactData.get('distribution_channel_config');
        const deployed = dist?.deployed === true || dist?.status === 'deployed';
        if (deployed) { status = 'pass'; detail = `Distribution channel deployed (status: ${dist?.status || 'deployed'})`; }
        else if (dist) { detail = `Distribution channel not yet deployed (status: ${dist.status || 'unknown'})`; }
        break;
      }
      // FR-005: the growth categories are present here ONLY when the flag is ON (REQUIRED).
      // Score them from is_current artifact presence (robust to post-resequence positional-
      // param ambiguity); absence is `pending` => verdict NOT_READY (blocks launch).
      case 'growth_playbook':
        if (preflight.present.has('growth_playbook')) { status = 'pass'; detail = 'Pre-launch growth playbook present'; }
        else { status = 'pending'; detail = 'Pre-launch growth playbook missing'; }
        break;
      case 'distribution_ad_copy':
        if (preflight.present.has('distribution_ad_copy')) { status = 'pass'; detail = 'Distribution ad copy present'; }
        else { status = 'pending'; detail = 'Distribution ad copy missing'; }
        break;
      // SD-FDBK-FIX-BUILD-LEGAL-DOC-001: REQUIRED -- a venture missing either
      // required legal document FAILS launch-readiness (was previously ignored
      // as advisory with no real check). Run the legal-doc producer
      // (lib/eva/legal-doc-producer.js) to remediate before this venture can
      // reach READY.
      case 'legal':
        if (legalDocsCheck.hasRequired) {
          status = 'pass';
          detail = 'Required legal documents (Terms of Service + Privacy Policy) generated';
        } else {
          status = 'fail';
          const missing = REQUIRED_LEGAL_TEMPLATE_TYPES.filter((t) => !legalDocsCheck.presentTypes.has(t));
          detail = `Missing required legal documents: ${missing.join(', ')}`;
        }
        break;
      // SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: real, data-driven check replacing the
      // generic advisory stub -- stays PASS-eligible/non-blocking (mode stays ADVISORY
      // below), this only changes the detail text from a hardcoded string to a real
      // per-venture wired-check result.
      case 'analytics':
        status = 'advisory';
        if (telemetryAnalyticsCheck?.wired) {
          detail = `Usage telemetry wired: ${telemetryAnalyticsCheck.reason}`;
        } else if (telemetryAnalyticsCheck) {
          detail = `Usage telemetry not yet wired: ${telemetryAnalyticsCheck.reason}`;
        } else {
          detail = 'No automated producer; chairman attestation suffices';
        }
        break;
      // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.3): real, data-driven check replacing
      // the generic advisory stub -- stays PASS-eligible/non-blocking (mode stays ADVISORY
      // below), this only changes the detail text from a hardcoded string to a real
      // per-venture uptime-probe result. reachable is a LIVENESS signal only (status
      // 200-499 counts as reachable, per checkReachability) -- detail surfaces
      // status_code/last_checked_at rather than asserting a bare health claim the
      // underlying probe does not support.
      case 'monitoring':
        status = 'advisory';
        if (ventureUptimeCheck) {
          const checkedAt = ventureUptimeCheck.last_checked_at || 'unknown time';
          if (ventureUptimeCheck.reachable) {
            detail = `Uptime probe: reachable (status ${ventureUptimeCheck.status_code ?? 'n/a'}, last checked ${checkedAt})`;
          } else {
            const surfacedNote = ventureUptimeCheck.surfaced ? ' [surfaced to ops_product_health]' : '';
            const errorNote = ventureUptimeCheck.last_error ? `, error: ${ventureUptimeCheck.last_error}` : '';
            detail = `Uptime probe: unreachable${surfacedNote} (last checked ${checkedAt}${errorNote})`;
          }
        } else {
          detail = 'No automated producer; chairman attestation suffices';
        }
        break;
      default:
        // FR-3: ADVISORY categories default to advisory status
        if (isAdvisory) {
          status = 'advisory';
          detail = 'No automated producer; chairman attestation suffices';
        } else {
          status = 'pending';
          detail = 'Not yet configured';
        }
    }
    return { category: cat, status, detail, mode: isAdvisory ? 'ADVISORY' : 'REQUIRED' };
  });

  // SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-4): mode-matched evidence joins the
  // checklist as a REQUIRED category IN LIVE MODE ONLY — a live launch-readiness
  // claim must be backed by external observations (fail-closed), never internal
  // artifacts. Simulated mode is byte-identical to the pre-002 baseline (the sim
  // labeling law is enforced at S24, where launch evidence is emitted).
  // Adversarial review W10, S23 posture: the mode is read STRICTLY so a failed
  // read is DISTINGUISHED from "read says simulated" — but S23 is re-runnable
  // advisory readiness, so a degraded read falls back to the -001 simulated
  // baseline WITH a recorded degradation flag + warn (byte-identical checklist,
  // pinned by the pre-002 suites), rather than holding every venture on any
  // transient read fault. The IRREVERSIBLE gate (S24 go-live) is where a
  // degraded read hard-HOLDs.
  const strictMode = await getLaunchModeStrict(supabase, ventureId);
  const columnUnapplied = !strictMode.ok && /does not exist/i.test(strictMode.reason || '');
  const launchMode = strictMode.ok ? strictMode.mode : 'simulated';
  const launchModeReadDegraded = !strictMode.ok && !columnUnapplied;
  if (launchModeReadDegraded) {
    logger.warn?.(`[S23-LaunchReadiness] launch_mode read degraded (${strictMode.reason}) — scoring as simulated baseline; S24 will hold if this persists`);
  }
  let modeEvidence = null;
  if (strictMode.ok && isLiveMode(launchMode)) {
    const observations = await collectExternalObservations({ supabase, ventureId });
    modeEvidence = evaluateModeEvidence({ mode: launchMode, observations });
    checklist.push({
      category: 'live_external_evidence',
      status: modeEvidence.pass ? 'pass' : 'fail',
      detail: modeEvidence.reason,
      mode: 'REQUIRED',
    });
  }

  const passCount = checklist.filter(c => c.status === 'pass').length;
  const failCount = checklist.filter(c => c.status === 'fail').length;
  const advisoryCount = checklist.filter(c => c.status === 'advisory').length;
  const requiredFail = checklist.some(c => c.mode === 'REQUIRED' && c.status === 'fail');
  const requiredAllPass = checklist.filter(c => c.mode === 'REQUIRED').every(c => c.status === 'pass');

  // FR-3 verdict logic:
  //   HOLD if any REQUIRED category is fail
  //   READY if all REQUIRED categories pass (advisory categories ignored)
  //   NOT_READY otherwise (some REQUIRED still pending)
  const verdict = requiredFail ? 'HOLD' : requiredAllPass ? 'READY' : 'NOT_READY';

  // Effective readiness: count both pass and advisory toward the percentage
  // (advisory entries are PASS-eligible per chairman attestation per FR-3).
  const effectivePass = passCount + advisoryCount;

  return {
    checklist,
    verdict,
    venture_name: ventureName,
    pass_count: passCount,
    fail_count: failCount,
    advisory_count: advisoryCount,
    pending_count: checklist.filter(c => c.status === 'pending').length,
    // Adversarial review W7: denominators derive from the ACTUAL checklist (which
    // may carry the live_external_evidence category in live mode) so
    // total_categories always equals checklist entries and readiness_pct is
    // never >100. Simulated mode: checklist.length === allCategories.length, so
    // the baseline is byte-identical.
    total_categories: checklist.length,
    readiness_pct: checklist.length > 0 ? Math.round((effectivePass / checklist.length) * 100) : 0,
    growth_playbook_required: growthRequired,
    // SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-4): observability of the mode branch.
    launch_mode: launchMode,
    mode_evidence: modeEvidence,
    launch_mode_read_degraded: launchModeReadDegraded || undefined,
  };
}

export {
  CATEGORIES, REQUIRED_CATEGORIES, ADVISORY_CATEGORIES, UPSTREAM_REQUIREMENTS,
  GROWTH_CATEGORIES, GROWTH_FLAG_KEY, readGrowthPlaybookRequiredFlag,
  REQUIRED_LEGAL_TEMPLATE_TYPES, checkRequiredLegalDocs,
  checkTelemetryAnalyticsWired, checkVentureUptimeWired,
  CAPABILITY_CATEGORY_PREFIX, CAPABILITY_IDS, CAPABILITY_CATEGORIES,
  SIGNAL_BACKED_CAPABILITY_IDS, precheckCapabilities,
  CAPABILITY_CHECKLIST_FLAG_KEY, readCapabilityChecklistRequiredFlag,
};
