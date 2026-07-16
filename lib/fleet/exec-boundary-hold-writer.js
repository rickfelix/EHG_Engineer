/**
 * exec_boundary_hold writer — SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-3).
 *
 * Closes a genuine gap found by prospective sub-agent evidence: the
 * exec_boundary_hold phase-scoped fence (SD-LEO-INFRA-PHASE-SCOPED-FENCE-001)
 * has full read/gate plumbing — lib/fleet/claim-eligibility.cjs's
 * execBoundaryHoldReason() and the EXEC_BOUNDARY_HOLD PLAN-TO-EXEC gate both
 * consume it — but zero in-repo writer existed before this file; the flag was
 * set via ad-hoc manual SQL. This gives the coordinator a real writer/clearer
 * pair instead.
 *
 * Field shape mirrors the ALREADY-ESTABLISHED reader contract exactly
 * (execBoundaryHoldReason() in lib/fleet/claim-eligibility.cjs):
 *   metadata.exec_boundary_hold        boolean
 *   metadata.exec_boundary_hold_reason string
 *   metadata.exec_boundary_hold_set_at ISO string
 * This SD adds two sibling keys carrying the rest of the hold-state contract:
 *   metadata.exec_boundary_hold_owner
 *   metadata.exec_boundary_hold_release_condition
 * review_at is the existing exec_boundary_hold_set_at plus the NEW
 * exec_boundary_hold_review_at (the two are distinct: set_at is when the hold
 * was created, review_at is when it should next be reviewed for staleness).
 */

import { checkHoldStamp, buildProvenancedStamp, logHoldStateViolation } from '../governance/hold-state-contract.js';

/**
 * Set metadata.exec_boundary_hold=true on an SD, with the full contract stamp.
 * Fresh-read-then-merge (mirrors lib/fleet/door-stamper.mjs) to avoid clobbering
 * a concurrent metadata writer.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sdId - strategic_directives_v2.id (UUID)
 * @param {{reason, owner, reviewAt, releaseCondition, writingSessionId?}} stamp
 * @returns {Promise<{ok:boolean, mode:'observe'|'enforce', errors:string[]}>}
 */
export async function setExecBoundaryHold(supabase, sdId, { reason, owner, reviewAt, releaseCondition, writingSessionId } = {}) {
  const holdCheck = checkHoldStamp({ reason, owner, review_at: reviewAt, release_condition: releaseCondition });
  if (!holdCheck.ok && holdCheck.mode === 'observe') {
    await logHoldStateViolation(supabase, {
      surface: 'exec_boundary_hold',
      stamp: { reason, owner, review_at: reviewAt, release_condition: releaseCondition },
      errors: holdCheck.errors,
    });
  }

  const stamped = buildProvenancedStamp({ reason, owner, review_at: reviewAt, release_condition: releaseCondition }, writingSessionId);

  const { data: fresh, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sdId)
    .maybeSingle();
  if (readErr) throw new Error('[exec-boundary-hold-writer] fresh read failed: ' + readErr.message);
  if (!fresh) throw new Error(`SD not found: ${sdId}`);

  const meta = fresh.metadata || {};
  const nextMeta = {
    ...meta,
    exec_boundary_hold: true,
    exec_boundary_hold_reason: stamped.reason || meta.exec_boundary_hold_reason || null,
    exec_boundary_hold_owner: stamped.owner || null,
    exec_boundary_hold_set_at: new Date().toISOString(),
    ...(reviewAt ? { exec_boundary_hold_review_at: stamped.review_at } : {}),
    ...(stamped.release_condition ? { exec_boundary_hold_release_condition: stamped.release_condition } : {}),
    ...(stamped.stamped_by_session ? { exec_boundary_hold_stamped_by_session: stamped.stamped_by_session } : {}),
  };

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: nextMeta })
    .eq('id', sdId);
  if (writeErr) throw new Error('[exec-boundary-hold-writer] write failed: ' + writeErr.message);

  return holdCheck;
}

/**
 * Clear metadata.exec_boundary_hold, stamping the release counterpart the
 * gate's own remediation text already documents (exec_boundary_hold_cleared_at/_by).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sdId
 * @param {{clearedBy: string}} opts
 */
export async function clearExecBoundaryHold(supabase, sdId, { clearedBy } = {}) {
  if (!clearedBy) throw new Error('clearExecBoundaryHold requires clearedBy');

  const { data: fresh, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sdId)
    .maybeSingle();
  if (readErr) throw new Error('[exec-boundary-hold-writer] fresh read failed: ' + readErr.message);
  if (!fresh) throw new Error(`SD not found: ${sdId}`);

  const meta = { ...(fresh.metadata || {}) };
  meta.exec_boundary_hold = false;
  meta.exec_boundary_hold_cleared_at = new Date().toISOString();
  meta.exec_boundary_hold_cleared_by = clearedBy;

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: meta })
    .eq('id', sdId);
  if (writeErr) throw new Error('[exec-boundary-hold-writer] clear write failed: ' + writeErr.message);
}

export default { setExecBoundaryHold, clearExecBoundaryHold };
