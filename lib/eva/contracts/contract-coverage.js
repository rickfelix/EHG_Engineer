/**
 * contract-coverage.js — runtime cross-stage contract-enforcement coverage signal.
 *
 * SD-REFILL-00V67JEB (FR-1): the cross-stage data-contract validators (validatePreStage /
 * validatePostStage) are wired + enforced live in eva-orchestrator, but nothing PERSISTS the
 * outcome of each enforced transition. The vision ordinal-19 "Cross-stage data contracts" gauge
 * probe is therefore a code_grep (band-capped at 'partial' by the anti-inflation rule) and can
 * never advance — there is no measurable signal of contracts being ENFORCED at runtime.
 *
 * This emits one append-only coverage row per enforced transition into the generic `audit_log`
 * table (event_type='contract_coverage'), so a future count_ratio/row_predicate probe (FR-2,
 * dependent follow-up — needs accumulated rows) can repoint ordinal-19 off code_grep onto a real
 * enforcement-coverage ratio.
 *
 * FAIL-OPEN by contract: a coverage-write failure (or a missing client) NEVER throws and never
 * affects the venture pipeline — coverage is observability, not a gate. audit_log only constrains
 * `severity` (info/warning/error/critical); event_type is free.
 */

/**
 * Derive the coverage shape from a validatePreStage/validatePostStage result.
 * Exported pure for unit testing (no I/O).
 * @param {{valid?: boolean, blocked?: boolean, errors?: any[], warnings?: any[]}} result
 * @returns {{valid: boolean, blocked: boolean, error_count: number, warning_count: number}}
 */
export function summarizeContractResult(result) {
  const r = result || {};
  return {
    valid: r.valid === true,
    blocked: r.blocked === true,
    error_count: Array.isArray(r.errors) ? r.errors.length : 0,
    warning_count: Array.isArray(r.warnings) ? r.warnings.length : 0,
  };
}

/**
 * Build the audit_log row for a contract-coverage event. Exported pure for unit testing.
 * severity: 'error' when blocked, 'warning' when invalid-but-not-blocked, else 'info'
 * (all members of the audit_log severity CHECK set).
 * @returns {object} an audit_log insert payload
 */
export function buildCoverageRow({ ventureId, stageNumber, phase, result, enforcementMode, createdBy = 'eva-contract-validator' }) {
  const s = summarizeContractResult(result);
  const severity = s.blocked ? 'error' : (s.valid ? 'info' : 'warning');
  return {
    event_type: 'contract_coverage',
    entity_type: 'venture_stage_contract',
    entity_id: `${ventureId ?? 'unknown'}:${stageNumber ?? '?'}:${phase ?? '?'}`,
    new_value: { valid: s.valid, blocked: s.blocked },
    metadata: {
      venture_id: ventureId ?? null,
      stage_number: stageNumber ?? null,
      phase: phase ?? null,              // 'pre' | 'post'
      valid: s.valid,
      blocked: s.blocked,
      error_count: s.error_count,
      warning_count: s.warning_count,
      enforcement_mode: enforcementMode ?? null,
    },
    severity,
    created_by: createdBy,
  };
}

/**
 * Emit one contract-coverage row. FAIL-OPEN: returns {emitted:boolean, reason?:string} and never
 * throws — a write failure or absent client is swallowed so the venture pipeline is never affected.
 * @param {object} supabase - supabase client (may be null/undefined → no-op)
 * @param {object} args - { ventureId, stageNumber, phase, result, enforcementMode }
 * @returns {Promise<{emitted: boolean, reason?: string}>}
 */
export async function emitContractCoverage(supabase, args) {
  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return { emitted: false, reason: 'no_client' };
    }
    const row = buildCoverageRow(args || {});
    const { error } = await supabase.from('audit_log').insert(row);
    if (error) return { emitted: false, reason: error.message };
    return { emitted: true };
  } catch (e) {
    return { emitted: false, reason: e && e.message ? e.message : String(e) };
  }
}
