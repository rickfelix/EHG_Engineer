/**
 * Stage 23 Analysis Step — Launch Readiness Kill Gate
 * SD: SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 (FR-1, FR-3, FR-4)
 *
 * Aggregates readiness signals from S20-S22. Returns checklist with
 * pass/fail/advisory per category and overall launch verdict.
 *
 * FR-3 (ADVISORY mode):
 *   analytics, monitoring, legal categories have no automated producer in S17-S22.
 *   Per risk-agent recommendation (sub_agent_execution_results 081c9190): mark
 *   them as ADVISORY (chairman attestation suffices). They are PASS-eligible
 *   without a producer; verdict logic ignores them when computing kill-gate fail.
 *
 * FR-4 (canonical-upstream verification + SKIP fallback):
 *   Before scoring, verify canonical upstream artifacts exist with is_current=true:
 *     S20: code_quality_report (canonical) or build_quality_score (legacy)
 *     S21: visual_device_screenshots OR visual_social_graphics
 *     S22: distribution_channel_config OR distribution_ad_copy
 *   If any required upstream missing, emit a structured 'custom' eva event with
 *   event_data.subtype='stage_skipped' + reason='upstream_missing'. Returns a
 *   SKIPPED verdict (does NOT block; surfaces a banner via the event).
 */

// SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-4): per-mode evidence via the shared helper.
import { getLaunchMode, isLiveMode } from '../../launch-mode.js';
import { collectExternalObservations } from '../../external-observation.js';
import { evaluateModeEvidence } from '../../mode-evidence.js';

const REQUIRED_CATEGORIES = ['code_quality', 'marketing_assets', 'distribution_channels'];
const ADVISORY_CATEGORIES = ['analytics', 'monitoring', 'legal'];
const CATEGORIES = [...REQUIRED_CATEGORIES, ...ADVISORY_CATEGORIES];

// FR-005 (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D): growth_playbook (the pre-launch
// artifact produced by the stage-21 Distribution co-output) and distribution_ad_copy
// become REQUIRED launch categories when LEO_S21_GROWTH_PLAYBOOK_REQUIRED is enabled,
// and ADVISORY (PASS-eligible, non-blocking) when it is OFF — so in-flight ventures
// lacking a pre-launch playbook are NOT blocked during rollout. Default OFF keeps the
// REQUIRED set and verdict byte-identical to the pre-001-D baseline.
const GROWTH_CATEGORIES = ['growth_playbook', 'distribution_ad_copy'];
const GROWTH_FLAG_KEY = 'LEO_S21_GROWTH_PLAYBOOK_REQUIRED';

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
async function readGrowthPlaybookRequiredFlag(supabase, logger) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('leo_feature_flags')
      .select('is_enabled')
      .eq('flag_key', GROWTH_FLAG_KEY)
      .maybeSingle();
    if (error) {
      logger?.warn?.(`[S23-LaunchReadiness] growth flag read error, defaulting OFF: ${error.message}`);
      return false;
    }
    return Boolean(data?.is_enabled);
  } catch (err) {
    logger?.warn?.(`[S23-LaunchReadiness] growth flag read threw, defaulting OFF: ${err.message}`);
    return false;
  }
}

/**
 * FR-4: Verify canonical upstream artifacts exist for a venture before scoring.
 * @returns {Promise<{ok: boolean, missing: Array<{stage, anyOf}>}>}
 */
async function preflightUpstream({ supabase, ventureId, requirements = UPSTREAM_REQUIREMENTS, logger }) {
  if (!supabase || !ventureId) {
    logger?.warn?.('[S23-LaunchReadiness] preflight skipped: missing supabase or ventureId');
    return { ok: true, missing: [], present: new Set() };
  }
  // Probe the gating requirement types PLUS the FR-005 growth categories (so the
  // checklist can score growth_playbook/distribution_ad_copy from artifact presence
  // even while they are ADVISORY). Gating (`missing`) is computed only from `requirements`.
  const probeTypes = [...new Set([...requirements.flatMap(r => r.anyOf), ...GROWTH_CATEGORIES])];
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, is_current')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', probeTypes);
  if (error) {
    logger?.warn?.(`[S23-LaunchReadiness] preflight DB error (treating as ok): ${error.message}`);
    return { ok: true, missing: [], present: new Set() };
  }
  const present = new Set((data || []).map(r => r.artifact_type));
  const missing = requirements.filter(r => !r.anyOf.some(t => present.has(t)));
  return { ok: missing.length === 0, missing, present };
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
    stage20Data, stage21Data, stage22Data,
    ventureName, supabase, ventureId,
    logger = console,
  } = params;

  logger.info?.(`[S23-LaunchReadiness] Aggregating readiness for ${ventureName || 'unknown'}`);

  // FR-005/FR-006: growth_playbook + distribution_ad_copy join the checklist as REQUIRED
  // categories ONLY when LEO_S21_GROWTH_PLAYBOOK_REQUIRED is ON. When OFF (default) they
  // are entirely absent — the checklist, counts, verdict, and REQUIRED set are byte-identical
  // to the pre-001-D baseline, so no in-flight venture is affected by the rollout.
  const growthRequired = await readGrowthPlaybookRequiredFlag(supabase, logger);
  const allCategories = growthRequired ? [...CATEGORIES, ...GROWTH_CATEGORIES] : CATEGORIES;

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

  const checklist = allCategories.map(cat => {
    const isAdvisory = ADVISORY_CATEGORIES.includes(cat);
    let status = 'pending';
    let detail = '';

    switch (cat) {
      case 'code_quality':
        if (stage20Data?.verdict === 'PASS') { status = 'pass'; detail = 'Code quality gate passed'; }
        else if (stage20Data?.verdict === 'FAIL') { status = 'fail'; detail = `${stage20Data?.summary?.by_severity?.critical || 0} critical issues`; }
        else if (stage20Data?.verdict === 'WARN') { status = 'warn'; detail = 'Warnings present but no critical issues'; }
        break;
      // SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 (first-contact defect #7):
      // post-resequence positional swap — Distribution runs at stage 21 and
      // Visual Assets at stage 22 (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A
      // option-ii; venture_stages SSOT), but this scorer still read the
      // pre-resequence positions, so distribution_channels could NEVER pass
      // (witnessed live: DataDistill NOT_READY/pending despite an active
      // distribution_channel_config). Read BOTH positions (any-of) so the
      // scorer is robust to either era's data.
      case 'marketing_assets': {
        const assets = (stage22Data?.total_assets ?? 0) || (stage21Data?.total_assets ?? 0);
        if (assets > 0) { status = 'pass'; detail = `${assets} assets generated`; }
        break;
      }
      case 'distribution_channels': {
        const active = (stage21Data?.active_channels ?? 0) || (stage22Data?.active_channels ?? 0);
        if (active > 0) { status = 'pass'; detail = `${active} channels active`; }
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
      default:
        // FR-3: ADVISORY categories (analytics, monitoring, legal) default to advisory status
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
  const launchMode = await getLaunchMode(supabase, ventureId);
  let modeEvidence = null;
  if (isLiveMode(launchMode)) {
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
    total_categories: allCategories.length,
    readiness_pct: Math.round((effectivePass / allCategories.length) * 100),
    growth_playbook_required: growthRequired,
    // SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-4): observability of the mode branch.
    launch_mode: launchMode,
    mode_evidence: modeEvidence,
  };
}

export {
  CATEGORIES, REQUIRED_CATEGORIES, ADVISORY_CATEGORIES, UPSTREAM_REQUIREMENTS,
  GROWTH_CATEGORIES, GROWTH_FLAG_KEY, readGrowthPlaybookRequiredFlag,
};
