/**
 * Shared oracle_read_pending hold writer — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-4/FR-5/FR-9/FR-10).
 *
 * Reuse-not-rebuild: SD holds go through the EXISTING metadata.requires_human_action fence
 * (lib/fleet/claim-eligibility.cjs) via the EXISTING atomic-merge chokepoint
 * (lib/coordinator/safe-metadata-merge.mjs). QF holds reuse the EXISTING owner+release_condition
 * shape (lib/fleet/qf-gated-hold.cjs / qf-start.js's isChairmanGatedQF claim-block) — the QF-side
 * enforcement chokepoint only recognizes owner==='chairman' literally, so a QF-side oracle hold
 * sets owner:'chairman' (the only value qf-start.js's guard fires on) and encodes the real reason
 * in release_condition text, rather than inventing a second QF enforcement path.
 *
 * Every write also passes through lib/governance/hold-state-contract.js's checkHoldStamp/
 * buildProvenancedStamp (FR-7 prerequisite) so a future flip of HOLD_STATE_CONTRACT_MODE to
 * 'enforce' does not retroactively break these writers.
 */
import { mergeMetadataKeys } from '../coordinator/safe-metadata-merge.mjs';
import { checkHoldStamp, buildProvenancedStamp, logHoldStateViolation } from '../governance/hold-state-contract.js';

export const ORACLE_READ_PENDING_REASON = 'oracle_read_pending';

/** FR-9: named, exported bounded-wait duration (~30 minutes per the SD success criteria). */
export const BOUNDED_WAIT_MS = 30 * 60 * 1000;

/**
 * FR-9: pure, independently unit-testable with an injected clock. Replaces the prior pattern
 * (TESTING finding T-8) of computing elapsed inline with `new Date()` and no clock seam.
 * @param {string|null|undefined} consultRowCreatedAt - ISO timestamp of the consult row
 * @param {number} nowMs - injected clock (epoch ms)
 * @returns {boolean}
 */
export function isBoundedWaitElapsed(consultRowCreatedAt, nowMs) {
  const created = Date.parse(consultRowCreatedAt);
  if (!Number.isFinite(created) || !Number.isFinite(nowMs)) return false;
  return (nowMs - created) >= BOUNDED_WAIT_MS;
}

/**
 * FR-10: distinguish the two causes of mergeMetadataKeys' collapsed {merged:false}.
 * A deliberate refusal (checkDeciderPairing) always sets `error` naming the decider; a silent
 * zero-row-match no-op (e.g. a UUID passed where sd_key was expected) sets no error field at all.
 * @param {{merged:boolean, error?:string}|null|undefined} result
 * @returns {'ok'|'decider_refused'|'write_error'|'silent_zero_row_no_op'|'unknown'}
 */
export function classifyMergeFailure(result) {
  if (!result) return 'unknown';
  if (result.merged) return 'ok';
  if (typeof result.error === 'string' && /decider/i.test(result.error)) return 'decider_refused';
  if (typeof result.error === 'string' && result.error.trim()) return 'write_error';
  return 'silent_zero_row_no_op';
}

/**
 * FR-4/FR-7: stamp an SD with the oracle_read_pending hold, reusing metadata.requires_human_action
 * (claim-fenced by the existing claim-eligibility.cjs humanActionRequired axis) via the atomic
 * safe-metadata-merge.mjs chokepoint.
 * @param {string} sdKey
 * @param {{reviewAt:string, releaseCondition:string, owner?:string, decider?:string, consultRowId?:string|null}} opts
 * @returns {Promise<{merged:boolean, sdKey:string, error?:string, cause:string, contractOk:boolean}>}
 */
export async function writeSdOracleHold(sdKey, { reviewAt, releaseCondition, owner = 'solomon', decider = 'solomon', consultRowId = null, supabaseClient = null, createClientFn = undefined } = {}) {
  const stamp = buildProvenancedStamp(
    { reason: ORACLE_READ_PENDING_REASON, owner, review_at: reviewAt, release_condition: releaseCondition },
    process.env.CLAUDE_SESSION_ID || null,
  );
  const contractCheck = checkHoldStamp(stamp);
  if (!contractCheck.ok) {
    await logHoldStateViolation(supabaseClient, { surface: 'oracle_read_pending', stamp, errors: contractCheck.errors });
  }

  const now = new Date().toISOString();
  const patch = {
    requires_human_action: true,
    requires_human_action_reason: ORACLE_READ_PENDING_REASON,
    requires_human_action_by: owner,
    requires_human_action_at: now,
    human_decider: decider,
    oracle_read_pending_review_at: reviewAt,
    oracle_read_pending_release_condition: releaseCondition,
    oracle_read_pending_consult_row_id: consultRowId,
  };
  const result = await mergeMetadataKeys(sdKey, patch, createClientFn ? { createClientFn } : {});
  return { ...result, cause: classifyMergeFailure(result), contractOk: contractCheck.ok };
}

/**
 * FR-5: release an SD's oracle_read_pending hold, citing the consult row's id + created_at as the
 * elapsed-wait provenance (rather than a self-supplied timestamp), so the elapsed wait is
 * recomputable by a third party from stored rows.
 * @param {string} sdKey
 * @param {{consultRowId:string|null, consultRowCreatedAt:string|null, releasedBy:string}} opts
 */
export async function releaseSdOracleHold(sdKey, { consultRowId = null, consultRowCreatedAt = null, releasedBy = 'system', createClientFn = undefined } = {}) {
  const patch = {
    requires_human_action: false,
    // TESTING finding D-3: hold-state-sweep.js's oracle_read_pending surface gates isActive() on
    // requires_human_action_reason === 'oracle_read_pending' alone — clearing ONLY the boolean left
    // the reason (and the review_at the sweep reads) in place, so a correctly-released hold read as
    // overdue forever. Both are cleared here, in the SAME atomic merge as the release stamp.
    requires_human_action_reason: null,
    oracle_read_pending_review_at: null,
    unfenced_at: new Date().toISOString(),
    unfenced_by: releasedBy,
    unfenced_consult_row_id: consultRowId,
    unfenced_consult_row_created_at: consultRowCreatedAt,
  };
  const result = await mergeMetadataKeys(sdKey, patch, createClientFn ? { createClientFn } : {});
  return { ...result, cause: classifyMergeFailure(result) };
}

/**
 * FR-4: QF-side oracle_read_pending hold. Reuses the ONLY existing QF-claim-block chokepoint
 * (qf-start.js's isChairmanGatedQF guard, which fires solely on owner==='chairman' literally) —
 * so owner is set to 'chairman' even though the true holder is the oracle-consult mechanism; the
 * real reason is carried in release_condition text plus the sentinel prefix so a reader can tell
 * this apart from a genuine chairman-authored gate.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} qfId
 * @param {{reviewAt:string, releaseCondition:string}} opts
 */
export const QF_ORACLE_HOLD_PREFIX = '[oracle_read_pending]';

export async function writeQfOracleHold(supabaseClient, qfId, { reviewAt, releaseCondition } = {}) {
  if (!supabaseClient) throw new Error('writeQfOracleHold: supabaseClient is required');
  const condition = `${QF_ORACLE_HOLD_PREFIX} review_at=${reviewAt || 'unset'} :: ${releaseCondition || ''}`.trim();
  // SECURITY finding S-1: an unconditioned write silently clobbered a GENUINE chairman gate (a
  // row already carrying owner='chairman' with a non-oracle release_condition, e.g. the live
  // QF-508/QF-970 class documented in lib/fleet/qf-gated-hold.cjs) — destroying its original
  // condition text and leaving the row matching this SD's OWN release marker, so the next
  // batch-mint sweep or release call would clear a hold it never opened. The WHERE clause's
  // `.or()` below asserts, ATOMICALLY inside the single UPDATE (no separate read-then-write
  // TOCTOU window), that the target is NOT already a genuine chairman gate:
  //   NOT (owner = 'chairman' AND release_condition NOT LIKE '[oracle_read_pending]%')
  // i.e. owner IS NULL, OR owner != 'chairman', OR the existing condition already carries this
  // SD's own prefix (a re-stamp of an existing oracle hold, which is fine).
  const { data, error } = await supabaseClient
    .from('quick_fixes')
    .update({ owner: 'chairman', release_condition: condition })
    .eq('id', qfId)
    .or(`owner.is.null,owner.neq.chairman,release_condition.like.${QF_ORACLE_HOLD_PREFIX}%`)
    .select('id, owner, release_condition')
    .maybeSingle();
  if (error) return { merged: false, error: error.message, cause: 'write_error' };
  if (!data) return { merged: false, cause: 'silent_zero_row_no_op' };
  return { merged: true, cause: 'ok', data };
}

/** Pure: does a QF row carry THIS SD's oracle hold marker (vs a genuine chairman gate)? */
export function isOracleHeldQF(qf) {
  if (!qf || typeof qf !== 'object') return false;
  const owner = typeof qf.owner === 'string' ? qf.owner.trim().toLowerCase() : '';
  const cond = typeof qf.release_condition === 'string' ? qf.release_condition : '';
  return owner === 'chairman' && cond.startsWith(QF_ORACLE_HOLD_PREFIX);
}

export async function releaseQfOracleHold(supabaseClient, qfId) {
  if (!supabaseClient) throw new Error('releaseQfOracleHold: supabaseClient is required');
  // TESTING finding D-4 (safety): the update's WHERE clause must itself require the
  // oracle-hold prefix marker — a bare `.not('release_condition', 'is', null)` matches ANY
  // owner='chairman' hold, including a genuine chairman gate (e.g. release_condition=
  // 'EU-send-planned'), and would silently clear it. `%` and `_` are the only LIKE wildcards;
  // QF_ORACLE_HOLD_PREFIX's literal `[`/`]` characters are not special, so this is a safe
  // literal-prefix match, not a pattern injection surface.
  const { data, error } = await supabaseClient
    .from('quick_fixes')
    .update({ owner: null, release_condition: null })
    .eq('id', qfId)
    .eq('owner', 'chairman')
    .like('release_condition', `${QF_ORACLE_HOLD_PREFIX}%`)
    .select('id')
    .maybeSingle();
  if (error) return { merged: false, error: error.message, cause: 'write_error' };
  if (!data) return { merged: false, cause: 'silent_zero_row_no_op' };
  return { merged: true, cause: 'ok' };
}

export default {
  ORACLE_READ_PENDING_REASON,
  BOUNDED_WAIT_MS,
  isBoundedWaitElapsed,
  classifyMergeFailure,
  writeSdOracleHold,
  releaseSdOracleHold,
  writeQfOracleHold,
  isOracleHeldQF,
  releaseQfOracleHold,
  QF_ORACLE_HOLD_PREFIX,
};
