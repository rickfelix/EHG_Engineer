/**
 * Firing fence — the mechanical, fail-closed predicate for whether the kill-gate teeth-proof
 * regime is permitted to ARM for a given venture's traversal.
 *
 * SD-LEO-INFRA-KILL-GATE-TEETH-001 (ALPHA leg)
 *
 * AUTHORITY FOR THE ARMING RULE (binding citation, mandated by Solomon's pre-LEAD discharge
 * e9087f46 and independently corroborated on-instrument by VALIDATION — see PRD SC3): the rule
 * that this regime must NEVER fire during venture-1's traversal or ANY attended traversal, and
 * may ONLY arm on the first UNATTENDED S0-S5 traversal, rests on: W3 packet ruling, coordination corr 5c4528b0
 * -- co-cited with chairman_decisions rows beca4a47 and d580dac7 (both verified-real,
 * decision_type='session_question', status='approved') — so this authority never rests on a
 * single hard-to-search surface. Do not remove this citation when editing this file.
 *
 * MECHANICAL PREDICATE — WHAT "UNATTENDED" ACTUALLY MEANS HERE, AND WHY:
 * A repo-wide search (this SD's PLAN phase) for an existing attended/unattended tracking
 * mechanism — `attended`/`unattended` columns, chairman-presence flags, a "walk" attendance
 * ledger — found NONE. `ventures.is_demo` and `ventures.is_scaffolding` are real columns but
 * answer a DIFFERENT question (is this row a fixture / a build-out vehicle), not "was a human
 * watching this specific S0-S5 traversal". Inventing a new ad-hoc tracking mechanism from
 * scratch was explicitly out of scope for this ALPHA leg (that is PLAN/run-prep's job, gated on
 * chairman GO — see docs/design/kill-gate-teeth-proof-spec.md §6).
 *
 * So this predicate is FAIL-CLOSED BY ABSENCE: it arms ONLY on the presence of an explicit,
 * positive attestation — a `system_events` row (`event_type = 'PROBE_S0_S5_UNATTENDED_ATTESTATION'`)
 * written by a non-fleet party (`payload.sealed_by IN ('solomon', 'chairman')`) claiming this
 * specific venture's S0-S5 traversal was unattended. ABSENCE of that attestation is treated as
 * "attended" (refuse), NEVER the reverse — a missing/unreachable/errored read is refused, not
 * armed. This is the honest fail-closed default the task explicitly requires when no existing
 * mechanism can be reused: it does not conjure attendance-tracking that does not exist, it simply
 * never arms without affirmative proof.
 *
 * VENTURE-1 HARD EXCLUSION: "ApexNiche" (the already-completed live traversal referenced
 * throughout this codebase, e.g. docs/design/kill-gate-teeth-proof-spec.md's CONTROL) is
 * name-matched and refused UNCONDITIONALLY — even if some future attestation row were ever
 * written for it, the venture-1 exclusion cannot be overridden by an attestation. Belt AND
 * braces: the spec's two independent NEVER-fire conditions ("venture-1" OR "any attended
 * traversal") are both checked, and either alone refuses.
 *
 * @module lib/eva/kill-gate-teeth/firing-fence
 */

const UNATTENDED_ATTESTATION_EVENT_TYPE = 'PROBE_S0_S5_UNATTENDED_ATTESTATION';
const VALID_ATTESTORS = Object.freeze(['solomon', 'chairman']);

/** Venture-1 per spec: the completed ApexNiche traversal. Name-matched, case-insensitive. */
const VENTURE_ONE_NAME_RE = /^apexniche$/i;

export const FENCE_REASON = Object.freeze({
  VENTURE_ONE_EXCLUSION: 'venture_one_exclusion',
  NO_UNATTENDED_PROOF: 'no_unattended_proof_fail_closed',
  VENTURE_READ_FAILED: 'venture_read_failed_fail_closed',
  ARMED: 'unattended_attestation_present',
});

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventureId: string }} args
 * @returns {Promise<{ armed: boolean, reason: string, ventureName: string|null }>}
 */
export async function evaluateFiringFence(supabase, { ventureId }) {
  let ventureName = null;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('name')
      .eq('id', ventureId)
      .maybeSingle();
    if (error) throw error;
    ventureName = data?.name ?? null;
  } catch (_err) {
    // Fail-closed: an unreadable venture identity must never be treated as "definitely not
    // venture-1" — refuse rather than guess.
    return { armed: false, reason: FENCE_REASON.VENTURE_READ_FAILED, ventureName: null };
  }

  if (typeof ventureName === 'string' && VENTURE_ONE_NAME_RE.test(ventureName)) {
    return { armed: false, reason: FENCE_REASON.VENTURE_ONE_EXCLUSION, ventureName };
  }

  let attestationRows = [];
  try {
    const { data, error } = await supabase
      .from('system_events')
      .select('id, payload')
      .eq('venture_id', ventureId)
      .eq('event_type', UNATTENDED_ATTESTATION_EVENT_TYPE);
    if (error) throw error;
    attestationRows = data || [];
  } catch (_err) {
    // Same fail-closed rule: a failed read of the attestation surface is NOT evidence of
    // unattendedness. Absence-by-error refuses exactly like absence-by-empty-result.
    return { armed: false, reason: FENCE_REASON.NO_UNATTENDED_PROOF, ventureName };
  }

  const validAttestation = attestationRows.find((row) => VALID_ATTESTORS.includes(row?.payload?.sealed_by));
  if (!validAttestation) {
    return { armed: false, reason: FENCE_REASON.NO_UNATTENDED_PROOF, ventureName };
  }

  return { armed: true, reason: FENCE_REASON.ARMED, ventureName };
}

export default { evaluateFiringFence, FENCE_REASON };
