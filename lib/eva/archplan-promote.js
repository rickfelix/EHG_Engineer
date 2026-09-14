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
 * Modeled on lib/eva/stage-execution-worker.js's _autoApproveCloneVision "flip approval
 * only" pattern (approve_active case, ~line 3931-3937): the UPDATE touches ONLY status,
 * chairman_approved, and chairman_approved_at. It deliberately does NOT set created_by
 * (unlike _autoApproveCloneVision, which does) and does NOT touch content/sections --
 * see the two reasons below.
 *
 * Self-approval guard (ratification a588adba: a design is signed off by a seat other than
 * its author): refuses when promotedBy === the row's own created_by. NOTE this is a
 * provenance PLACEHOLDER, not a strong identity check -- live data shows ~79% of rows
 * share the single value 'eva-archplan-command' and some are NULL, so this guard only
 * catches a literal same-label replay. Meaningful identity-based enforcement requires the
 * deferred approved_by column (FR-6, not implemented here -- new columns are a chairman
 * ceremony).
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
    return { promoted: false, reason: 'read_failed', error: readErr.message };
  }
  if (!row) {
    // SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5, TS-15): a missing plan_key must be
    // reported explicitly, never a silent no-op.
    return { promoted: false, reason: 'not_found' };
  }
  if (row.chairman_approved === true) {
    // SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5, TS-14): promoting an already-active row
    // is a no-op, never a silent overwrite of its existing chairman_approved_at -- that
    // timestamp is the original approval's provenance.
    return { promoted: false, reason: 'already_approved' };
  }
  if (promotedBy === row.created_by) {
    return { promoted: false, reason: 'self_approval_refused' };
  }

  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .update({
      status: 'active',
      chairman_approved: true,
      chairman_approved_at: new Date().toISOString(),
    })
    .eq('plan_key', planKey)
    .select('id, plan_key, status, chairman_approved, chairman_approved_at')
    .single();

  if (error) {
    // Includes trg_enforce_archplan_quality_advancement's own exception when
    // row.quality_checked === false -- surfaced as-is, not swallowed or re-implemented.
    return { promoted: false, reason: 'update_failed', error: error.message };
  }

  return { promoted: true, data };
}
