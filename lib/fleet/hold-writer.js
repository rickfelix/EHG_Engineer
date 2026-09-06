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
import { classifyDispatchIneligibility } from './claim-eligibility.cjs';

/**
 * QF-20260902-868: a release only clears ONE predicate. Specimen (witnessed 2026-09-02
 * 12:25-12:28Z, Solomon CAPA 9d8d34b3 CA-7): a hold was released and needs_coordinator_review
 * cleared, yet the dispatch choke still refused the row with unactionable_venture_remediation --
 * an entirely different axis -- and nobody was told, because the release path never re-ran the
 * eligibility classifier. Every hold-release CLI calls this AFTER its own release so a remaining
 * verdict is printed loudly at release time, not discovered later by a confused claimer.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} sdKey
 * @returns {Promise<string|null>} the remaining ineligibility reason, or null if now claimable
 */
export async function printRemainingIneligibility(supabaseClient, sdKey, { logPrefix = '[hold-release]' } = {}) {
  if (!supabaseClient || !sdKey) return null;
  const { data, error } = await supabaseClient
    .from('strategic_directives_v2')
    .select('sd_key, sd_type, status, current_phase, claiming_session_id, target_application, metadata, dependencies, parent_sd_id')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (error || !data) return null; // not an SD (e.g. a QF id) -- nothing to re-check here
  const remaining = classifyDispatchIneligibility(data);
  if (remaining) {
    console.error(`${logPrefix} RELEASED but ${sdKey} remains dispatch-ineligible: ${remaining} -- this release changed nothing observable for a claimer.`);
  }
  return remaining;
}

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
// QF-20260902-868: premisePredicate (one re-measurable line, e.g. "classifyDispatchIneligibility
// returns null") is REQUIRED so the hourly review can re-check this hold without re-deriving why
// it was set. reviewAt already IS the recheck date, stamped below as premise_recheck_by too.
export async function writeSdOracleHold(sdKey, { reviewAt, releaseCondition, owner = 'solomon', decider = 'solomon', consultRowId = null, premisePredicate, supabaseClient = null, createClientFn = undefined } = {}) {
  const trimmedPredicate = typeof premisePredicate === 'string' ? premisePredicate.trim() : '';
  if (!trimmedPredicate) {
    return { merged: false, sdKey, error: 'premisePredicate is required (a re-measurable one-line predicate for the next review)', cause: 'missing_premise_predicate' };
  }
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
    premise_recheck_by: reviewAt,
    premise_predicate: trimmedPredicate,
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
 * @param {{reviewAt:string, releaseCondition:string, consultRowId?:string|null}} opts
 */
export const QF_ORACLE_HOLD_PREFIX = '[oracle_read_pending]';

/**
 * VALIDATION finding V-2: the release-side bounded-wait gate (release-oracle-hold.js) had no
 * producer — no code path ever wrote a consult row and cited it, so every real hold was only
 * releasable via --force. This embeds the consult row id INSIDE the release_condition marker
 * itself (structured, greppable) so a QF's own row carries its own citation — release-oracle-
 * hold.js can auto-resolve it without an operator hunting for the id separately.
 * @param {string|null|undefined} qf release_condition text
 * @returns {string|null}
 */
export function extractConsultRowIdFromQfCondition(releaseCondition) {
  if (typeof releaseCondition !== 'string') return null;
  const m = releaseCondition.match(/consult=([0-9a-f-]{36}|none)/i);
  if (!m || m[1] === 'none') return null;
  return m[1];
}

export async function writeQfOracleHold(supabaseClient, qfId, { reviewAt, releaseCondition, consultRowId = null } = {}) {
  if (!supabaseClient) throw new Error('writeQfOracleHold: supabaseClient is required');
  const condition = `${QF_ORACLE_HOLD_PREFIX} review_at=${reviewAt || 'unset'} consult=${consultRowId || 'none'} :: ${releaseCondition || ''}`.trim();
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

/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-4): the QF release path previously dropped
 * consultRowId/consultRowCreatedAt/releasedBy entirely, unlike releaseSdOracleHold — the spec's
 * "each degraded release writes its own line naming the elapsed wait" requirement was dead by
 * construction on QF holds. quick_fixes has no dedicated provenance columns, so this mirrors
 * scripts/release-chairman-gated-qf.js's existing stamp-into-verification_notes pattern (read
 * current notes, append, write in the SAME guarded UPDATE that already prevents a double-release).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} qfId
 * @param {{consultRowId?:string|null, consultRowCreatedAt?:string|null, releasedBy?:string|null}} [provenance]
 */
export async function releaseQfOracleHold(supabaseClient, qfId, { consultRowId = null, consultRowCreatedAt = null, releasedBy = null } = {}) {
  if (!supabaseClient) throw new Error('releaseQfOracleHold: supabaseClient is required');
  const { data: existing, error: readErr } = await supabaseClient
    .from('quick_fixes')
    .select('verification_notes')
    .eq('id', qfId)
    .maybeSingle();
  if (readErr) return { merged: false, error: readErr.message, cause: 'write_error' };
  const stamp = `[ORACLE-RELEASE ${new Date().toISOString()}] by ${releasedBy || 'system'}: ` +
    `consult_row=${consultRowId || 'none'} consult_created_at=${consultRowCreatedAt || 'none'}`;
  const verification_notes = existing?.verification_notes ? `${existing.verification_notes}\n${stamp}` : stamp;
  // TESTING finding D-4 (safety): the update's WHERE clause must itself require the
  // oracle-hold prefix marker — a bare `.not('release_condition', 'is', null)` matches ANY
  // owner='chairman' hold, including a genuine chairman gate (e.g. release_condition=
  // 'EU-send-planned'), and would silently clear it. `%` and `_` are the only LIKE wildcards;
  // QF_ORACLE_HOLD_PREFIX's literal `[`/`]` characters are not special, so this is a safe
  // literal-prefix match, not a pattern injection surface.
  const { data, error } = await supabaseClient
    .from('quick_fixes')
    .update({ owner: null, release_condition: null, verification_notes })
    .eq('id', qfId)
    .eq('owner', 'chairman')
    .like('release_condition', `${QF_ORACLE_HOLD_PREFIX}%`)
    .select('id')
    .maybeSingle();
  if (error) return { merged: false, error: error.message, cause: 'write_error' };
  if (!data) return { merged: false, cause: 'silent_zero_row_no_op' };
  return { merged: true, cause: 'ok' };
}

/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-1): resolve a cited session_coordination row's
 * created_at + correlation_id, falling back to retention_archive when the row has been archived
 * by cleanup_expired_coordination. An archived row is a FOUND row — its row_data.created_at
 * drives the exact same bounded-wait computation a live row's created_at would. Absent from both
 * tables returns null, preserving the existing fail-closed behavior.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null} consultRowId
 * @returns {Promise<{created_at:string, correlation_id:string|null}|null>}
 */
export async function lookupConsultRowRecord(supabase, consultRowId) {
  if (!consultRowId || !supabase) return null;
  const { data: live } = await supabase
    .from('session_coordination')
    .select('created_at, payload')
    .eq('id', consultRowId)
    .maybeSingle();
  if (live) {
    return { created_at: live.created_at, correlation_id: live.payload?.correlation_id ?? null };
  }
  const { data: archived } = await supabase
    .from('retention_archive')
    .select('row_data')
    .eq('source_table', 'session_coordination')
    .eq('source_id', consultRowId)
    .maybeSingle();
  if (archived?.row_data) {
    return {
      created_at: archived.row_data.created_at,
      correlation_id: archived.row_data.payload?.correlation_id ?? null,
    };
  }
  return null;
}

/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-3): find the earliest coordinator_reply matching
 * a consult row's correlation_id — the review HAVING HAPPENED is what releases the hold, not any
 * particular verdict content (matches scripts/worker-signal.cjs's existing reply-matching
 * convention: payload.reply_to OR payload.correlation_id). Archive-aware for the same reason as
 * lookupConsultRowRecord — a reply can age past the same retention window as the consult row it
 * answers.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} correlationId
 * @returns {Promise<{created_at:string}|null>}
 */
export async function findConsultReply(supabase, correlationId) {
  if (!correlationId || !supabase) return null;
  const { data: live } = await supabase
    .from('session_coordination')
    .select('id, created_at, payload')
    .or(`payload->>reply_to.eq.${correlationId},payload->>correlation_id.eq.${correlationId}`)
    .eq('payload->>kind', 'coordinator_reply')
    .order('created_at', { ascending: true })
    .limit(1);
  if (Array.isArray(live) && live.length > 0) return { created_at: live[0].created_at };
  // Archive fallback: filter client-side rather than a nested JSONB path query, since the
  // archived population for this kind is small (bounded by how many oracle consults ever fire).
  const { data: archived } = await supabase
    .from('retention_archive')
    .select('row_data')
    .eq('source_table', 'session_coordination')
    .order('archived_at', { ascending: true })
    .limit(500);
  const match = (archived || []).find((r) => {
    const p = r.row_data?.payload;
    return p?.kind === 'coordinator_reply' && (p?.reply_to === correlationId || p?.correlation_id === correlationId);
  });
  return match ? { created_at: match.row_data.created_at } : null;
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
  extractConsultRowIdFromQfCondition,
  lookupConsultRowRecord,
  findConsultReply,
};
