/**
 * SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 — FR-1/FR-3 pure helpers.
 *
 * FR-1: normalize the already-computed preflight issue/violation lists into one
 * persistable shape, and defensively truncate before insert (validation_details has
 * a CHECK (length(...::text) <= 102400) constraint with no prior JS-side guard —
 * an untruncated write that trips it causes recordFailure to swallow the error and
 * return null, silently dropping the entire rejection row).
 *
 * FR-3: identity-based remediation stamping. sd_phase_handoffs has no session_id
 * column and created_by is trigger-locked to a 4-value allowlist, so "same session"
 * cannot be inferred from the rejection row itself — instead each rejection is
 * stamped at write time with resolveClaimIdentity()'s {sessionId, source}, and a
 * later acceptance for the same sd_id+to_phase looks up any matching prior stamp.
 */

import { safeTruncate } from '../../../../lib/utils/safe-truncate.js';

/** Safety margin under the DB's 102400-char CHECK constraint on validation_details. */
export const VALIDATION_DETAILS_MAX_CHARS = 95000;

/**
 * Normalize the two shapes preflight failures carry into one persistable array.
 * - SAEM / general prerequisite-preflight issues: {code, message, remediation}
 * - artifact-preflight violations: {field, expected, got, hint}
 * @param {object} result - the ResultBuilder.rejected() object passed to recordFailure
 * @returns {Array<{code:string, message:string, remediation:string}>}
 */
export function buildPreflightRemediation(result) {
  const out = [];
  if (Array.isArray(result?.preflightIssues)) {
    for (const issue of result.preflightIssues) {
      if (!issue) continue;
      out.push({
        code: issue.code || 'UNKNOWN',
        message: issue.message || '',
        remediation: issue.remediation || '',
      });
    }
  }
  if (Array.isArray(result?.preflightViolations)) {
    for (const v of result.preflightViolations) {
      if (!v) continue;
      out.push({
        code: v.field ? `ARTIFACT_SHAPE:${v.field}` : 'ARTIFACT_SHAPE',
        message: `expected ${v.expected ?? '(unspecified)'}, got ${v.got ?? '(unspecified)'}`,
        remediation: v.hint || '',
      });
    }
  }
  return out;
}

/**
 * Defensively truncate a validation_details object before insert. Layers:
 * 1. Cap each preflight_remediation[].remediation string.
 * 2. If still over budget, drop trailing preflight_remediation entries.
 * 3. If STILL over budget (pathological), fall back to a minimal safe summary.
 * Never throws; never silently drops the whole row by exceeding the DB constraint.
 * @param {object} details
 * @param {number} [maxChars]
 * @returns {object}
 */
export function truncateValidationDetails(details, maxChars = VALIDATION_DETAILS_MAX_CHARS) {
  if (!details) return details;
  let serialized = JSON.stringify(details);
  if (serialized.length <= maxChars) return details;

  const result = { ...details, preflight_remediation_truncated: true };
  if (Array.isArray(result.preflight_remediation)) {
    result.preflight_remediation = result.preflight_remediation.map((item) => ({
      ...item,
      remediation: safeTruncate(item.remediation || '', 300),
    }));
    serialized = JSON.stringify(result);
    while (serialized.length > maxChars && result.preflight_remediation.length > 0) {
      result.preflight_remediation.pop();
      serialized = JSON.stringify(result);
    }
    if (result.preflight_remediation.length === 0) {
      result.preflight_remediation = '[TRUNCATED: remediation list omitted to fit the validation_details size limit]';
      serialized = JSON.stringify(result);
    }
  }
  if (serialized.length > maxChars) {
    // Pathological case: even the trimmed shape doesn't fit. Fall back to a minimal
    // safe summary rather than let the insert fail and silently drop the row.
    return {
      summary: details.summary,
      rejected_at: details.rejected_at,
      reason: details.reason,
      message: safeTruncate(details.message || '', 500),
      preflight_remediation_truncated: true,
    };
  }
  return result;
}

/**
 * FR-3 acceptance-side lookup: does a prior SAEM (or other preflight-remediation-bearing)
 * rejection exist for this sd_id+to_phase, attributable to the same identity as the
 * accepting call? Fail-open on error, but distinguishably: callers must never treat an
 * `error` result as equivalent to a genuine "never rejected" (`found:false, error:undefined`)
 * negative control.
 * @param {object} supabase
 * @param {{sdId:string, toPhase:string, acceptingIdentity:{sessionId:string|null, source:string}}} params
 * @returns {Promise<{found:boolean, rejectionIds?:string[], error?:string}>}
 */
export async function findPriorSaemRemediation(supabase, { sdId, toPhase, acceptingIdentity }) {
  try {
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .select('id, validation_details, created_at')
      .eq('sd_id', sdId)
      .eq('to_phase', toPhase)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return { found: false, error: error.message };

    const matches = (data || []).filter((row) => {
      const vd = row.validation_details || {};
      if (!vd.preflight_remediation) return false;
      const ident = vd.rejecting_identity;
      if (!ident) return false;
      // Explicit defined fallback (PRD FR-3): when either side is unattributable
      // (source='none'), a reliable identity comparison is impossible — treat any
      // un-attributable prior SAEM rejection for this sd_id+to_phase as a candidate
      // match rather than silently skipping it.
      if (acceptingIdentity.source === 'none' || ident.source === 'none') return true;
      return ident.sessionId === acceptingIdentity.sessionId;
    });
    if (matches.length === 0) return { found: false };
    return { found: true, rejectionIds: matches.map((m) => m.id) };
  } catch (err) {
    return { found: false, error: err.message };
  }
}
