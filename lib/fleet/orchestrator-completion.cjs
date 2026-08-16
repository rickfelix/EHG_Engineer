'use strict';
/**
 * Shared orchestrator-parent terminal-status + completability predicate.
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-3).
 *
 * Single source of truth for "is this child terminal?" and "is this orchestrator parent
 * completable?" -- consumed by FR-1 (parent_completion eligibility), FR-3 (PARENT COMPLETABLE
 * surface), and FR-4 (coordinator dispatch-choke exception in lib/coordinator/dispatch.cjs).
 * MIRRORS complete_orchestrator_sd()'s guard 4 (database/migrations/20260329_pcvp_phase1_close_
 * bypass_holes.sql) literal status set -- a JS mirror of a SQL guard, not a shared call into the
 * same code (Postgres functions cannot be invoked as a JS predicate). See
 * orchestrator-completion.test.js for the cross-check that pins this set against a live
 * pg_get_functiondef(complete_orchestrator_sd) read, so a future SQL-side change is caught by a
 * failing test rather than silently diverging.
 *
 * Three divergent "terminal child status" definitions were found live during this SD's
 * investigation: v_orchestrator_completion_status (status='completed' ONLY), complete_orchestrator_sd()
 * guard 4 (('completed','cancelled')), and checkParentOrchestrator / the PLAN-TO-LEAD handoff gate
 * (('completed','cancelled','deferred')). This module picks guard 4 as the ONE authoritative
 * definition, since that is the function whose guard ultimately decides completion. The other two
 * divergences are a documented, known gap -- not silently reconciled here.
 */

const TERMINAL_CHILD_STATUSES = new Set(['completed', 'cancelled']);

function isOrchestratorChildTerminal(status) {
  return TERMINAL_CHILD_STATUSES.has(String(status || '').toLowerCase());
}

function getIncompleteChildren(children) {
  return (children || []).filter((c) => !isOrchestratorChildTerminal(c && c.status));
}

/**
 * Checks whether an orchestrator parent is "completable": all children terminal (per guard 4's
 * definition), and no accepted LEAD-FINAL-APPROVAL handoff yet exists for the parent.
 *
 * NEVER silently omits a row or defaults to "not completable" on a query failure -- a failed check
 * must never look identical to a genuine pass (FR-3 acceptance criterion). Callers MUST check
 * `couldNotCheck` before trusting `completable`.
 *
 * @param {object} supabase - Supabase client
 * @param {{id: string, sd_key?: string, status?: string}} parent - the orchestrator parent row
 * @returns {Promise<{couldNotCheck: boolean, completable: boolean, reason: string, children: Array, hasAcceptedLeadFinal: boolean}>}
 */
async function checkParentCompletable(supabase, parent) {
  if (!parent || !parent.id) {
    return { couldNotCheck: true, completable: false, reason: 'NO_PARENT_ROW', children: [], hasAcceptedLeadFinal: false };
  }
  if (parent.status === 'completed' || parent.status === 'cancelled') {
    return { couldNotCheck: false, completable: false, reason: `PARENT_ALREADY_TERMINAL(${parent.status})`, children: [], hasAcceptedLeadFinal: false };
  }

  let children;
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .eq('parent_sd_id', parent.id);
    if (error) throw error;
    children = data || [];
  } catch (e) {
    return { couldNotCheck: true, completable: false, reason: `CHILDREN_QUERY_FAILED: ${e.message}`, children: [], hasAcceptedLeadFinal: false };
  }

  const incomplete = getIncompleteChildren(children);
  if (incomplete.length > 0) {
    return {
      couldNotCheck: false,
      completable: false,
      reason: `INCOMPLETE_CHILDREN(${incomplete.length}/${children.length})`,
      children,
      hasAcceptedLeadFinal: false,
    };
  }

  // TR-2: sd_phase_handoffs.sd_id holds BOTH uuid- and sd_key-style values across eras -- union
  // both keyings with ONE ORDER BY created_at DESC. Never key recency/existence on accepted_at
  // (476+ historically-accepted rows have accepted_at IS NULL).
  let handoffs;
  try {
    const keys = [parent.id, parent.sd_key].filter(Boolean);
    const orClause = keys.map((k) => `sd_id.eq.${k}`).join(',');
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .select('id, handoff_type, status, accepted_at, created_at, created_by')
      .or(orClause)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .order('created_at', { ascending: false });
    if (error) throw error;
    handoffs = data || [];
  } catch (e) {
    return { couldNotCheck: true, completable: false, reason: `HANDOFF_QUERY_FAILED: ${e.message}`, children, hasAcceptedLeadFinal: false };
  }

  const hasAcceptedLeadFinal = handoffs.some((h) => h.status === 'accepted');
  if (hasAcceptedLeadFinal) {
    return { couldNotCheck: false, completable: false, reason: 'ALREADY_HAS_ACCEPTED_LEAD_FINAL', children, hasAcceptedLeadFinal: true };
  }

  return { couldNotCheck: false, completable: true, reason: 'ALL_CHILDREN_TERMINAL_NO_ACCEPTED_LEAD_FINAL', children, hasAcceptedLeadFinal: false };
}

module.exports = {
  TERMINAL_CHILD_STATUSES,
  isOrchestratorChildTerminal,
  getIncompleteChildren,
  checkParentCompletable,
};
