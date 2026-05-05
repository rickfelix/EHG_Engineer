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

const REQUIRED_CATEGORIES = ['code_quality', 'marketing_assets', 'distribution_channels'];
const ADVISORY_CATEGORIES = ['analytics', 'monitoring', 'legal'];
const CATEGORIES = [...REQUIRED_CATEGORIES, ...ADVISORY_CATEGORIES];

// FR-4 canonical upstream artifact types per stage. Each row is OR-able (any of
// these names satisfy the upstream requirement; venture-level any-of). The
// optional flag means missing-but-not-required.
const UPSTREAM_REQUIREMENTS = [
  { stage: 20, anyOf: ['code_quality_report', 'build_quality_score'] },
  { stage: 21, anyOf: ['visual_device_screenshots', 'visual_social_graphics'] },
  { stage: 22, anyOf: ['distribution_channel_config', 'distribution_ad_copy'] },
];

/**
 * FR-4: Verify canonical upstream artifacts exist for a venture before scoring.
 * @returns {Promise<{ok: boolean, missing: Array<{stage, anyOf}>}>}
 */
async function preflightUpstream({ supabase, ventureId, logger }) {
  if (!supabase || !ventureId) {
    logger?.warn?.('[S23-LaunchReadiness] preflight skipped: missing supabase or ventureId');
    return { ok: true, missing: [] };
  }
  const allTypes = UPSTREAM_REQUIREMENTS.flatMap(r => r.anyOf);
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, is_current')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', allTypes);
  if (error) {
    logger?.warn?.(`[S23-LaunchReadiness] preflight DB error (treating as ok): ${error.message}`);
    return { ok: true, missing: [] };
  }
  const present = new Set((data || []).map(r => r.artifact_type));
  const missing = UPSTREAM_REQUIREMENTS.filter(r => !r.anyOf.some(t => present.has(t)));
  return { ok: missing.length === 0, missing };
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

  // FR-4: Preflight canonical-upstream check; SKIP if any required upstream missing
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
      total_categories: CATEGORIES.length,
      readiness_pct: 0,
    };
  }

  const checklist = CATEGORIES.map(cat => {
    const isAdvisory = ADVISORY_CATEGORIES.includes(cat);
    let status = 'pending';
    let detail = '';

    switch (cat) {
      case 'code_quality':
        if (stage20Data?.verdict === 'PASS') { status = 'pass'; detail = 'Code quality gate passed'; }
        else if (stage20Data?.verdict === 'FAIL') { status = 'fail'; detail = `${stage20Data?.summary?.by_severity?.critical || 0} critical issues`; }
        else if (stage20Data?.verdict === 'WARN') { status = 'warn'; detail = 'Warnings present but no critical issues'; }
        break;
      case 'marketing_assets':
        if (stage21Data?.total_assets > 0) { status = 'pass'; detail = `${stage21Data.total_assets} assets generated`; }
        break;
      case 'distribution_channels':
        if (stage22Data?.active_channels > 0) { status = 'pass'; detail = `${stage22Data.active_channels} channels active`; }
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
    total_categories: CATEGORIES.length,
    readiness_pct: Math.round((effectivePass / CATEGORIES.length) * 100),
  };
}

export { CATEGORIES, REQUIRED_CATEGORIES, ADVISORY_CATEGORIES, UPSTREAM_REQUIREMENTS };
