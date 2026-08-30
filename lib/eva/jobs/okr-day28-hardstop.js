/**
 * OKR Day-28 Hard-Stop — the missing third stage of KR-GOV-3.3.
 *
 * SD-LEO-INFRA-OKR-DRIVEN-PRIORITIZATION-001
 *
 * KR-GOV-3.3 ("Monthly OKR automation operational") measures 3 stages: auto-generate draft
 * OKRs (day 1-5, lib/eva/jobs/okr-monthly-generator.js), schedule chairman review (day 15,
 * lib/eva/jobs/okr-mid-month-review.js), and hard-stop SD creation (day 28) -- this file. The
 * SD's own LEAD-phase census corrected a stale premise: "hard-stop SD creation" does NOT mean
 * hooking the SD-creation write path (multiple independent entry points exist: leo-create-sd.js,
 * refill-auto-promote.js, corrective-sd-creator.js, verification-sd-generator.js,
 * okr-stale-kr-sd-creator.js -- a shared write-gate is a larger, separate integration effort).
 * Instead this stage surfaces a CHAIRMAN DECISION carrying the cycle's live OKR/KR readings --
 * the same surfaced-decision-not-autonomous-kill shape SD-LEO-INFRA-REJECT-PATH-VENTURE-001
 * established. It NEVER writes to ventures or strategic_directives_v2.
 *
 * @module lib/eva/jobs/okr-day28-hardstop
 */

import { computeObjectiveScore } from './okr-monthly-handler.js';

const DECISION_TYPE = 'okr_month_close_review';
/** Non-venture chairman_decisions sentinel -- established convention (see reject-path SDs). */
const NON_VENTURE_LIFECYCLE_STAGE = 0;

/** Period key (YYYY-MM) for a given date, UTC. */
export function periodFor(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Pure predicate: has the calendar reached day 28 (UTC) of the month? */
export function isDay28OrLater(date) {
  return date.getUTCDate() >= 28;
}

/**
 * Run the day-28 hard-stop check. Idempotent per calendar period; never writes to
 * ventures/strategic_directives_v2 -- only ever inserts one chairman_decisions row per period.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service-role)
 * @param {Object} [deps.logger] - Logger (defaults to console)
 * @param {Date} [deps.now] - Injectable clock for tests
 * @returns {Promise<{fired: boolean, reason: string, period?: string, decisionId?: string}>}
 */
export async function runOkrDay28HardStop({ supabase, logger = console, now = new Date() }) {
  if (!isDay28OrLater(now)) {
    return { fired: false, reason: 'before-day-28' };
  }

  const period = periodFor(now);

  // Idempotency: has this period already fired?
  const { data: existing, error: existingError } = await supabase
    .from('chairman_decisions')
    .select('id')
    .eq('decision_type', DECISION_TYPE)
    .eq('context->>period', period)
    .limit(1);

  if (existingError) {
    logger.warn(`[OKR-Day28] Idempotency check failed: ${existingError.message}`);
    return { fired: false, reason: 'idempotency-check-error' };
  }
  if (existing && existing.length > 0) {
    return { fired: false, reason: 'already-fired-this-period', period };
  }

  // Live OKR/KR readings for the decision packet — mirrors okr-mid-month-review.js's fetch.
  // Bounded: key_results is a curated, company-level OKR set (not per-venture/per-SD), well
  // under 500 rows -- the limit is a provable-boundedness marker, not an operational cap.
  const { data: krs, error: krError } = await supabase
    .from('key_results')
    .select('id, code, title, objective_id, baseline_value, current_value, target_value, direction, status')
    .eq('is_active', true)
    .limit(500);

  if (krError) {
    throw new Error(`Failed to fetch key results: ${krError.message}`);
  }

  const eligibleSubjects = krs ? krs.length : 0;

  let objectivesScored = [];
  if (eligibleSubjects > 0) {
    const objectiveIds = [...new Set(krs.map((kr) => kr.objective_id))];
    objectivesScored = objectiveIds.map((objId) => ({
      objective_id: objId,
      score: computeObjectiveScore(krs.filter((kr) => kr.objective_id === objId)),
    }));
  }

  const context = {
    period,
    eligible_subjects: eligibleSubjects,
    objectives_scored: objectivesScored,
    krs: (krs || []).map((kr) => ({
      code: kr.code,
      title: kr.title,
      current_value: kr.current_value,
      target_value: kr.target_value,
      status: kr.status,
    })),
  };

  const summary = eligibleSubjects === 0
    ? `Day-28 OKR month-close review for ${period}: no active KRs this cycle (zero-subjects, not satisfied-by-absence).`
    : `Day-28 OKR month-close review for ${period}: ${eligibleSubjects} active KR(s) across ${objectivesScored.length} objective(s). Chairman decision required: continue / stop / re-scope.`;

  const { data: inserted, error: insertError } = await supabase
    .from('chairman_decisions')
    .insert({
      decision_type: DECISION_TYPE,
      venture_id: null,
      lifecycle_stage: NON_VENTURE_LIFECYCLE_STAGE,
      decision: 'pending',
      status: 'pending',
      context,
      summary,
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to surface day-28 chairman decision: ${insertError.message}`);
  }

  logger.log(`[OKR-Day28] Surfaced chairman decision ${inserted.id} for period ${period} (${eligibleSubjects} eligible subjects)`);

  return { fired: true, reason: 'surfaced', period, decisionId: inserted.id };
}
