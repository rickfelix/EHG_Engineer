/**
 * Named live reader for the opportunity-blueprint calibration cohort.
 * SD-LEO-INFRA-REALIZE-GATE-CALIBRATION-001 (FR-2)
 *
 * WHAT THIS IS, AND WHAT IT ISN'T:
 * The cohort this reader consumes is `opportunity_blueprints` rows carrying
 * `metadata.calibration_cohort=true` + `metadata.intake_bar` (a 7-point advisory score,
 * lib/discovery/intake-bar.js), stamped by lib/discovery/opportunity-discovery-service.js's
 * buildBlueprintRow() for the sibling SD-MAN-INFRA-GATE-BAR-REGIME-001 (a future
 * opportunity-blueprint auto-approve/reject bar). Census confirmed this is NOT the
 * LEO-protocol venture-lifecycle gate machinery (fn_chairman_decide / kill-gate /
 * direction-blind checks) that failed four ways on 2026-08-29 -- different domain,
 * different record shape (opportunity_blueprints vs chairman_decisions /
 * venture_stage_transitions). The four 2026-08-29 incidents are therefore DOCUMENTED HERE
 * as unusable fixtures for this cohort, not silently dropped: their record shape cannot be
 * expressed as an opportunity_blueprints row with an intake_bar score, so no adapter exists
 * to feed them through readCalibrationCohort().
 *
 * Before this SD, the cohort was computed and stamped but had ZERO consumers anywhere in the
 * codebase (grep-verified) -- "code presence is intent, not realization" (vision-gauge
 * probe's own diagnosis). This reader IS the missing consumer: it aggregates the cohort's
 * intake_bar check outcomes into a report a human (or the future GATE-BAR-REGIME threshold
 * decision) can actually read, and marks each row it consumes so the vision-gauge probe can
 * measure realized output instead of code presence (see lib/vision/vdr-registry.js's
 * "Calibrate the gates" probe, flipped by FR-5 of this SD).
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/**
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (or a fake with matching shape for tests)
 * @param {boolean} [deps.stamp=false] - when true, marks each consumed row's
 *   metadata.calibration_read_at with the current ISO timestamp (metadata-only write, no
 *   schema migration -- matches the existing "metadata stamp by design" convention already
 *   used for calibration_cohort itself).
 * @returns {Promise<{
 *   cohort_size: number,
 *   checks: Record<string, {label: string, pass: number, fail: number}>,
 *   score_histogram: Record<number, number>,
 *   stamped: number,
 * }>}
 */
export async function readCalibrationCohort({ supabase, stamp = false } = {}) {
  const report = { cohort_size: 0, checks: {}, score_histogram: {}, stamped: 0 };
  if (!supabase) return report;

  // count-truncation-diff-lint: the cohort grows without bound over time, so this must be a
  // full paginated read, not a single unbounded .select() capped at PostgREST's default page.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('opportunity_blueprints')
      .select('id, metadata')
      .eq('metadata->>calibration_cohort', 'true'));
  } catch {
    return report;
  }

  if (!Array.isArray(rows)) return report;

  report.cohort_size = rows.length;

  for (const row of rows) {
    const bar = row?.metadata?.intake_bar;
    if (!bar || !Array.isArray(bar.checks)) continue;

    for (const check of bar.checks) {
      if (!check?.id) continue;
      if (!report.checks[check.id]) {
        report.checks[check.id] = { label: check.label || check.id, pass: 0, fail: 0 };
      }
      if (check.pass) report.checks[check.id].pass += 1;
      else report.checks[check.id].fail += 1;
    }

    const score = Number.isFinite(bar.score) ? bar.score : null;
    if (score !== null) {
      report.score_histogram[score] = (report.score_histogram[score] || 0) + 1;
    }
  }

  if (stamp) {
    const now = new Date().toISOString();
    for (const row of rows) {
      const { error: updateError } = await supabase
        .from('opportunity_blueprints')
        .update({ metadata: { ...(row.metadata || {}), calibration_read_at: now } })
        .eq('id', row.id);
      if (!updateError) report.stamped += 1;
    }
  }

  return report;
}

export default readCalibrationCohort;
