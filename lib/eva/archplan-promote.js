// lib/eva/archplan-promote.js
/**
 * Gated promotion (draft -> active/chairman_approved) for eva_architecture_plans.
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5).
 *
 * Deliberately SEPARATE from upsertArchPlan (lib/eva/archplan-upsert.js) -- there was
 * previously NO code path anywhere that promoted a draft architecture plan to active via
 * UPDATE. Writing plans as draft-only with no promotion path would itself be a regression
 * (artifact-persistence-service.js's ADR attachment and the planning-completeness gate both
 * filter on status='active').
 *
 * NOT the only path that reaches active/chairman_approved: `archplan-command.mjs upsert
 * --plan-key <existing-draft-key> --approved` also does, via upsertArchPlan's onConflict
 * upsert (INSERT ... ON CONFLICT DO UPDATE) -- that path requires a human to explicitly pass
 * --approved (the designed reviewer act, not a silent default) but carries NO self-approval
 * guard and, unlike this function, DOES overwrite created_by. This function is accurately
 * described as "the only path that flips approval WITH an author/reviewer check", not as the
 * only path that flips approval at all (EXEC-TO-PLAN SECURITY review finding W1).
 *
 * Modeled on lib/eva/stage-execution-worker.js's _autoApproveCloneVision "flip approval
 * only" pattern (approve_active case, ~line 3931-3937): the UPDATE touches ONLY status,
 * chairman_approved, and chairman_approved_at. It deliberately does NOT set created_by
 * (unlike _autoApproveCloneVision, which does) and does NOT touch content/sections --
 * see the two reasons below.
 *
 * Self-approval guard (ratification a588adba: a design is signed off by a seat other than
 * its author): refuses when promotedBy === the row's own created_by. This remains a
 * provenance PLACEHOLDER for the AUTHOR side, not a strong identity check -- live data shows
 * ~79% of rows share the single value 'eva-archplan-command' and some are NULL, so this
 * guard only catches a literal same-label replay against created_by. What it no longer is:
 * a discarded verdict. SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001 FR-2 implements the
 * deferred approved_by/approved_by_at columns and persists promotedBy into them below, so a
 * distinct APPROVER identity is now recorded and queryable, even though the AUTHOR identity
 * (created_by) remains a tool-label placeholder pending a separate fix to the authoring
 * write path.
 *
 * The UPDATE never writes created_by: doing so (as _autoApproveCloneVision does) would
 * overwrite the very column this guard reads, making a second promotion's guard-check
 * compare against the PROMOTER's own label instead of the original author's, and would
 * destroy provenance. It never writes content/sections: eva_architecture_plans' sibling
 * trigger trg_auto_validate_archplan_quality recalculates quality_checked only when content
 * or sections actually change -- touching either here could silently re-run that
 * recalculation and flip quality_checked, defeating the very quality gate this promotion
 * path is designed to respect (trg_enforce_archplan_quality_advancement, a real BEFORE
 * UPDATE trigger that this function relies on rather than duplicates).
 *
 * @module lib/eva/archplan-promote
 */

import { createLogger } from '../logger.js';

const logger = createLogger('ArchplanPromote');

/**
 * @param {Object} params
 * @param {Object} params.supabase - Supabase service client
 * @param {string} params.planKey - eva_architecture_plans.plan_key of the row to promote
 * @param {string} params.promotedBy - identity of the promoting (reviewing) seat
 * @returns {Promise<{promoted: boolean, reason?: string, error?: string, data?: Object}>}
 */
export async function promoteArchPlan({ supabase, planKey, promotedBy }) {
  if (!supabase) throw new Error('supabase client is required');
  if (!planKey) throw new Error('planKey is required');
  if (!promotedBy) throw new Error('promotedBy is required');

  const { data: row, error: readErr } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, status, chairman_approved, created_by, quality_checked')
    .eq('plan_key', planKey)
    .maybeSingle();

  if (readErr) {
    logger.error('Pre-promotion read failed', { planKey, error: readErr.message });
    return { promoted: false, reason: 'read_failed', error: readErr.message };
  }
  if (!row) {
    // SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5, TS-15): a missing plan_key must be
    // reported explicitly, never a silent no-op.
    logger.warn('Promotion target not found', { planKey });
    return { promoted: false, reason: 'not_found' };
  }
  if (row.chairman_approved === true) {
    // SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5, TS-14): promoting an already-active row
    // is a no-op, never a silent overwrite of its existing chairman_approved_at -- that
    // timestamp is the original approval's provenance.
    logger.debug('Promotion no-op: already approved', { planKey });
    return { promoted: false, reason: 'already_approved' };
  }
  if (promotedBy === row.created_by) {
    logger.warn('Self-approval refused', { planKey, promotedBy, createdBy: row.created_by });
    return { promoted: false, reason: 'self_approval_refused' };
  }

  // SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001 FR-2: persist the approver identity this
  // function already verifies (promotedBy) -- previously discarded after the guard check
  // above, leaving the deferred FR-6 from this function's own docblock unimplemented.
  // approved_by/approved_by_at are additive fields distinct from chairman_approved/
  // chairman_approved_at (unchanged) and from created_by (never touched here -- see the
  // module docblock's "never writes created_by" reasoning).
  //
  // FAIL-SOFT ON THE NEW COLUMNS (adversarial /ship review finding, HIGH): approved_by/
  // approved_by_at ship as a TIER-1 additive migration (no chairman ceremony required), but
  // "eligible for auto-apply" is not "already applied" -- there can be a real window where
  // this code runs against a database that has not yet run the migration. Writing the new
  // fields in the SAME UPDATE as status/chairman_approved/chairman_approved_at would fail
  // the entire statement atomically on Postgres 42703 (undefined_column), regressing
  // PREVIOUSLY-WORKING promotion behavior for a reason unrelated to this promotion attempt.
  // Mirrors this repo's own established pattern (lib/fleet/qf-metadata-merge.mjs catching
  // 42703 and degrading gracefully): try the full payload first; on undefined_column,
  // retry with only the pre-existing 3 fields so promotion itself never breaks, and surface
  // that the new columns are not yet live via the result's `columnsApplied` flag.
  // CONCURRENCY GUARD (adversarial /ship review finding, MEDIUM -- TOCTOU): the read above and
  // this write are not atomic. Without a condition on the write itself, two concurrent,
  // independently-legitimate (non-self) promotions racing on the same row would both pass the
  // read-time checks and both write -- the slower one silently overwriting the faster one's
  // chairman_approved_at/approved_by/approved_by_at, contradicting this function's own "never a
  // silent overwrite" comment for the already-approved case. `.eq('chairman_approved', false)`
  // makes the write a compare-and-swap: only the FIRST promotion to actually land can match zero
  // vs one row, so the loser's UPDATE affects nothing and is reported as a genuine race loss.
  const nowIso = new Date().toISOString();
  const fullPayload = {
    status: 'active',
    chairman_approved: true,
    chairman_approved_at: nowIso,
    approved_by: promotedBy,
    approved_by_at: nowIso,
  };
  let { data, error } = await supabase
    .from('eva_architecture_plans')
    .update(fullPayload)
    .eq('plan_key', planKey)
    .eq('chairman_approved', false)
    .select('id, plan_key, status, chairman_approved, chairman_approved_at, approved_by, approved_by_at')
    .single();

  let columnsApplied = true;
  if (error && error.code === '42703') {
    logger.warn('approved_by/approved_by_at columns not yet live -- retrying without them', { planKey, error: error.message });
    columnsApplied = false;
    const fallback = await supabase
      .from('eva_architecture_plans')
      .update({ status: 'active', chairman_approved: true, chairman_approved_at: nowIso })
      .eq('plan_key', planKey)
      .eq('chairman_approved', false)
      .select('id, plan_key, status, chairman_approved, chairman_approved_at')
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error && error.code === 'PGRST116') {
    // Zero rows matched the compare-and-swap -- another promotion won the race between our
    // read and our write. Not an error to the caller: report it as the same class of no-op as
    // the pre-write already_approved check above, just detected one step later.
    logger.debug('Promotion lost a concurrent race (row no longer chairman_approved=false)', { planKey });
    return { promoted: false, reason: 'already_approved' };
  }
  if (error) {
    // Includes trg_enforce_archplan_quality_advancement's own exception when
    // row.quality_checked === false -- surfaced as-is, not swallowed or re-implemented.
    logger.warn('Promotion UPDATE rejected', { planKey, error: error.message });
    return { promoted: false, reason: 'update_failed', error: error.message };
  }

  logger.log('Architecture plan promoted', { planKey, promotedBy, columnsApplied });
  return { promoted: true, data, columnsApplied };
}
