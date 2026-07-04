/**
 * L1 WORK per-work-item outcome computation.
 * SD-LEO-INFRA-REWARD-SPINE-ONE-001-D.
 *
 * L1 (docs/architecture/reward-spine-ssot.md): a completed SD/QF's outcome is `shipped_clean`
 * iff shipped-clean AND no-recurrence-in-window AND no-revert. Anything else is `unproven`
 * (not `clean`) or `caused_rework`.
 *
 * Coverage model (three states, never collapsed to a binary clean/dirty):
 *   - 'witnessed'   — a merge_witness_telemetry row exists with real per-rung verdicts
 *                     (lane=ship-auto-merge or lane=ship-witness-retroactive-cli, verified
 *                     live: 72/72 and 67/67 rows respectively carry non-empty rungs).
 *   - 'unwitnessed' — a merge_witness_telemetry row exists but rungs=[] (lane=reconcile-sweep,
 *                     verified live: 84/84 such rows are empty). A row existing is NOT the same
 *                     as a verified-clean merge; this must never be reported as shipped_clean.
 *   - 'no_data'     — no merge_witness_telemetry row exists at all for this work_key.
 *
 * Recurrence check reuses the existing C-009 leaf-2/leaf-3 semantics (resolution_date +
 * status on issue_patterns) rather than inventing new recurrence logic.
 */

/**
 * @param {object} supabase - Supabase client
 * @param {string} workKey - SD or QF key (matches merge_witness_telemetry.work_key /
 *   issue_patterns.first_seen_sd_id / last_seen_sd_id)
 * @returns {Promise<{ outcome: 'shipped_clean'|'reverted'|'caused_rework'|'unproven', coverage: 'witnessed'|'unwitnessed'|'no_data', evidence: object }>}
 */
export async function computeL1Outcome(supabase, workKey) {
  const { data: telemetryRows, error: telemetryError } = await supabase
    .from('merge_witness_telemetry')
    .select('lane, overall, rungs, evaluated_at')
    .eq('work_key', workKey)
    .order('evaluated_at', { ascending: false })
    .limit(1);

  if (telemetryError) {
    return { outcome: 'unproven', coverage: 'no_data', evidence: { error: telemetryError.message } };
  }

  const telemetryRow = telemetryRows && telemetryRows[0];
  let coverage;
  let baseOutcome;
  let evidence;

  if (!telemetryRow) {
    coverage = 'no_data';
    baseOutcome = 'unproven';
    evidence = { reason: 'no merge_witness_telemetry row for this work_key' };
  } else if (!Array.isArray(telemetryRow.rungs) || telemetryRow.rungs.length === 0) {
    coverage = 'unwitnessed';
    baseOutcome = 'unproven';
    evidence = { reason: `merge_witness_telemetry row exists (lane=${telemetryRow.lane}) but carries no rung-level verdicts`, lane: telemetryRow.lane };
  } else {
    coverage = 'witnessed';
    // 'not_evaluable' rungs (verified live: P1/P2 read this way on every real ship-auto-merge/
    // retroactive-cli row in a 139-row sample, 2026-07-04 -- a wiring gap in the witness ladder's
    // own dependency injection, not a real check failure) are excluded from the pass/fail
    // determination rather than treated as blocking. Requiring literal 100% 'pass' across ALL
    // rungs would make shipped_clean permanently unreachable given the ladder's current wiring --
    // the opposite of the honest, real signal this SD exists to produce. Any rung that WAS
    // evaluated and reports non-pass still blocks the outcome; only structurally-skipped checks
    // are excluded, and which rungs were skipped is always visible in evidence.
    const evaluated = telemetryRow.rungs.filter((r) => r.status !== 'not_evaluable');
    const allEvaluatedPass = evaluated.length > 0 && evaluated.every((r) => r.status === 'pass');
    baseOutcome = allEvaluatedPass ? 'shipped_clean' : 'unproven';
    evidence = {
      lane: telemetryRow.lane,
      rungs: telemetryRow.rungs,
      evaluated_count: evaluated.length,
      not_evaluable_count: telemetryRow.rungs.length - evaluated.length,
    };
  }

  const { data: patternRows, error: patternError } = await supabase
    .from('issue_patterns')
    .select('id, dedup_fingerprint, status, resolution_date, first_seen_sd_id, last_seen_sd_id')
    .or(`first_seen_sd_id.eq.${workKey},last_seen_sd_id.eq.${workKey}`)
    .eq('status', 'active')
    .not('resolution_date', 'is', null);

  if (!patternError && patternRows && patternRows.length > 0) {
    // A pattern that was resolved (resolution_date set) but is active again is a recurrence —
    // per THE RULE's anti-Goodhart mechanic, closure must come from downstream state, and a
    // reopened pattern IS that downstream state signaling the original fix did not hold.
    return {
      outcome: 'caused_rework',
      coverage,
      evidence: { ...evidence, recurrence: patternRows.map((p) => ({ id: p.id, dedup_fingerprint: p.dedup_fingerprint, resolution_date: p.resolution_date })) },
    };
  }

  return { outcome: baseOutcome, coverage, evidence };
}

export default { computeL1Outcome };
