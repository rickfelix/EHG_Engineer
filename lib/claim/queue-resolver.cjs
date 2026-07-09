/**
 * Shared claim queue resolver — SD-ARCH-HOTSPOT-SD-START-001 FR-5.
 *
 * Relocates sd-start's queue intelligence (getNextWorkableSD, findLeafWorkItem,
 * findUnclaimedChild) plus the transitive helpers they cannot run without
 * (getOrchestratorChildren, getActiveClaimSessionIds — prospective-testing D1)
 * behind explicit `supabase` params (D2: the recursion threads it too) and an
 * optional onTrace callback in place of console drilling messages.
 *
 * TWO ORCHESTRATOR PRIMITIVES, ON PURPOSE: worker-checkin EXCLUDES orchestrator
 * parents from its candidate pools while sd-start DESCENDS into them to find a
 * buildable leaf — opposite strategies over the same fact. isOrchestratorParent
 * serves the exclude intent and is keyed on sd_type === 'orchestrator' (D10:
 * matching checkin's .neq('sd_type','orchestrator') filters and the classifier's
 * orchestrator_parent axis — NOT a structural has-children probe); resolveLeafWorkItem
 * serves the descend intent.
 *
 * No console / process.exit / argv (callers own I/O and process control).
 *
 * @module lib/claim/queue-resolver
 */
'use strict';

/** Exclude-intent predicate (checkin family). Keyed on sd_type, same as the
 *  classifier's orchestrator_parent axis. */
function isOrchestratorParent(sd) {
  return Boolean(sd) && sd.sd_type === 'orchestrator';
}

/**
 * Get the next workable SD from the queue, excluding specified SD keys.
 * Returns { sdKey, title, phase } or null if no workable SDs remain.
 * SD-LEO-INFRA-PRE-CLAIM-CHECK-001: used by sd-start's auto-fallback when claim
 * conflicts occur. Relocated verbatim (ordering: priority asc, created_at asc;
 * active-claim exclusion via claude_sessions).
 */
async function getNextWorkableSD(supabase, excludeKeys = []) {
  // Get all active sessions to identify claimed SDs
  const { data: activeSessions } = await supabase
    .from('claude_sessions')
    .select('sd_key')
    .not('sd_key', 'is', null)
    .in('status', ['active', 'idle']);

  const claimedSdKeys = new Set((activeSessions || []).map(s => s.sd_key));

  // Query for workable SDs: not completed, not cancelled, not blocked
  const { data: candidates } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, current_phase, status, priority, progress_percentage')
    .in('status', ['draft', 'active', 'planning', 'ready', 'in_progress'])
    .not('sd_key', 'is', null)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20);

  if (!candidates || candidates.length === 0) return null;

  // Filter: exclude specified keys, exclude claimed SDs
  for (const sd of candidates) {
    if (excludeKeys.includes(sd.sd_key)) continue;
    if (claimedSdKeys.has(sd.sd_key)) continue;
    return { sdKey: sd.sd_key, title: sd.title, phase: sd.current_phase };
  }

  return null;
}

/** Children of an orchestrator by parent ref (sd_key or UUID id, with the
 *  sd_key→id resolve-and-retry fallback). Relocated verbatim from sd-start L458. */
async function getOrchestratorChildren(supabase, sdKeyOrId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, priority, claiming_session_id, progress_percentage, sd_type')
    .or(`parent_sd_id.eq.${sdKeyOrId}`);

  if (error || !data || data.length === 0) {
    // If sdKeyOrId was a sd_key, resolve its UUID id and retry
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', sdKeyOrId)
      .single();

    if (parent && parent.id !== sdKeyOrId) {
      const { data: children, error: childErr } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, status, current_phase, priority, claiming_session_id, progress_percentage, sd_type')
        .eq('parent_sd_id', parent.id);

      if (!childErr && children) return children;
    }
    return data || [];
  }
  return data;
}

/**
 * Session IDs that currently hold an active claim in claude_sessions
 * (status active/idle with an sd_key). Source of truth — the SD row's
 * claiming_session_id can be stale. Relocated verbatim from sd-start L490.
 */
async function getActiveClaimSessionIds(supabase) {
  const { data } = await supabase
    .from('claude_sessions')
    .select('session_id')
    .not('sd_key', 'is', null)
    .in('status', ['active', 'idle']);
  return new Set((data || []).map(r => r.session_id));
}

/**
 * Find the first unclaimed child SD that's ready to work on.
 * Uses child-sd-selector for urgency-based sorting, then validates
 * claiming_session_id against live claude_sessions rows (a stale/released
 * claim is treated as unclaimed). Relocated verbatim from sd-start L566.
 */
async function findUnclaimedChild(supabase, parentSdKey, { selectNextReadyChild } = {}) {
  // parent_sd_id stores UUID `id`, not sd_key — resolve so getNextReadyChild
  // and getOrchestratorChildren query parent_sd_id correctly.
  let parentId = parentSdKey;
  const { data: parentRow } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', parentSdKey)
    .single();
  if (parentRow) {
    parentId = parentRow.id;
  }

  // getNextReadyChild handles urgency sorting and blocker filtering (ESM module —
  // a .cjs cannot require() it synchronously). Injectable seam for unit tests.
  let selector = selectNextReadyChild;
  if (typeof selector !== 'function') {
    ({ getNextReadyChild: selector } = await import('../../scripts/modules/handoff/child-sd-selector.js'));
  }
  const result = await selector(supabase, parentId);

  if (!result.sd) {
    return { child: null, allComplete: result.allComplete, reason: result.reason };
  }

  const activeSessionIds = await getActiveClaimSessionIds(supabase);

  // A child is truly claimed only if its claiming_session_id maps to an active session
  const isTrulyClaimed = (child) =>
    child.claiming_session_id && activeSessionIds.has(child.claiming_session_id);

  if (isTrulyClaimed(result.sd)) {
    // The top-priority child is claimed — check all children for an unclaimed one
    const children = await getOrchestratorChildren(supabase, parentSdKey);
    const readyChildren = children.filter(c =>
      !isTrulyClaimed(c) &&
      c.status !== 'completed' &&
      c.status !== 'blocked'
    );

    if (readyChildren.length > 0) {
      return { child: readyChildren[0], allComplete: false, reason: 'First unclaimed child' };
    }

    // All children are either truly claimed or not ready
    const allClaimed = children.filter(c => isTrulyClaimed(c) && c.status !== 'completed');
    if (allClaimed.length > 0) {
      return {
        child: null,
        allComplete: false,
        reason: `No ready children: ${allClaimed.length} active`
      };
    }
  }

  return { child: result.sd, allComplete: false, reason: result.reason };
}

/**
 * Descend-intent resolver (sd-start family): recursively find a leaf-level
 * (non-orchestrator) work item from an orchestrator hierarchy, drilling
 * orchestrator → sub-orchestrator → … → leaf. Relocated verbatim from
 * sd-start L512; the drilling console message became onTrace.
 *
 * @param {object} supabase
 * @param {string} parentSdKey
 * @param {{depth?: number, routingPath?: string[], onTrace?: (msg: string) => void}} [opts]
 * @returns {Promise<{child: object|null, allComplete: boolean, reason: string, routingPath: string[]}>}
 */
async function resolveLeafWorkItem(supabase, parentSdKey, { depth = 0, routingPath = [], onTrace, selectNextReadyChild } = {}) {
  const MAX_DEPTH = 5; // Safety limit for deeply nested orchestrators

  if (depth >= MAX_DEPTH) {
    return {
      child: null,
      allComplete: false,
      reason: `Max orchestrator nesting depth (${MAX_DEPTH}) exceeded`,
      routingPath
    };
  }

  const { child, allComplete, reason } = await findUnclaimedChild(supabase, parentSdKey, { selectNextReadyChild });

  if (!child) {
    return { child: null, allComplete, reason, routingPath };
  }

  const childKey = child.sd_key || child.id;
  const updatedPath = [...routingPath, childKey];

  // Check if this child is itself an orchestrator (has its own children)
  const grandchildren = await getOrchestratorChildren(supabase, childKey);

  if (grandchildren.length > 0) {
    // Sub-orchestrator detected — check if all its children are done
    const allGrandchildrenComplete = grandchildren.every(gc => gc.status === 'completed');

    if (allGrandchildrenComplete) {
      // Sub-orchestrator needs its own completion handoff — return it as the work item
      return {
        child,
        allComplete: false,
        reason: `Sub-orchestrator ${childKey}: all ${grandchildren.length} children completed — needs completion handoff`,
        routingPath: updatedPath
      };
    }

    // Recurse into the sub-orchestrator to find a leaf grandchild
    if (typeof onTrace === 'function') {
      onTrace(`${childKey} is a sub-orchestrator (${grandchildren.length} children) — drilling deeper...`);
    }
    return resolveLeafWorkItem(supabase, childKey, { depth: depth + 1, routingPath: updatedPath, onTrace, selectNextReadyChild });
  }

  // Leaf-level SD found
  return { child, allComplete: false, reason, routingPath: updatedPath };
}

module.exports = {
  isOrchestratorParent,
  getNextWorkableSD,
  getOrchestratorChildren,
  getActiveClaimSessionIds,
  findUnclaimedChild,
  resolveLeafWorkItem,
};
