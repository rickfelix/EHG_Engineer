/**
 * Blocked State Detector for Orchestrator SDs
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-12
 *
 * Detects when all non-terminal children of an orchestrator SD are blocked,
 * transitions to ALL_BLOCKED state, and aggregates blocker information.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Terminal states for child SDs - these are completed and don't count for blocking
 */
const TERMINAL_STATES = ['completed', 'cancelled', 'failed', 'rejected'];

// Note: Runnable states are determined by exclusion from TERMINAL_STATES
// Draft, active, planning, in_progress, pending_approval, review are all runnable

/**
 * Check if an orchestrator SD has all non-terminal children blocked
 * @param {string} orchestratorId - The orchestrator SD ID
 * @param {object} supabase - Optional supabase client
 * @returns {Promise<object>} Detection result with blocked state info
 */
export async function detectAllBlockedState(orchestratorId, supabase = null) {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }

  const result = {
    orchestratorId,
    isAllBlocked: false,
    totalChildren: 0,
    terminalChildren: 0,
    blockedChildren: 0,
    runnableChildren: 0,
    blockers: [],
    detectedAt: null
  };

  // Get the orchestrator SD to verify it's an orchestrator type
  const { data: orchestrator, error: orchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, status, metadata')
    .eq('id', orchestratorId)
    .single();

  if (orchError || !orchestrator) {
    return { ...result, error: 'Orchestrator SD not found' };
  }

  if (orchestrator.sd_type !== 'orchestrator') {
    return { ...result, error: 'SD is not an orchestrator type' };
  }

  // Get all children of this orchestrator
  const { data: children, error: childError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, metadata, dependencies')
    .eq('parent_sd_id', orchestratorId)
    .eq('is_active', true);

  if (childError) {
    return { ...result, error: `Failed to load children: ${childError.message}` };
  }

  if (!children || children.length === 0) {
    return { ...result, error: 'No children found for orchestrator' };
  }

  result.totalChildren = children.length;

  // Classify children by state
  const blockedChildren = [];
  const runnableChildren = [];
  const terminalChildren = [];

  for (const child of children) {
    const status = child.status?.toLowerCase() || 'draft';

    if (TERMINAL_STATES.includes(status)) {
      terminalChildren.push(child);
    } else {
      // Check if child is blocked (has unresolved dependencies or explicit blocked flag)
      const isBlocked = await checkIfChildBlocked(child, children, supabase);
      if (isBlocked.blocked) {
        blockedChildren.push({ child, blockerInfo: isBlocked });
      } else {
        runnableChildren.push(child);
      }
    }
  }

  result.terminalChildren = terminalChildren.length;
  result.blockedChildren = blockedChildren.length;
  result.runnableChildren = runnableChildren.length;

  // Determine if ALL_BLOCKED state should be set
  // Condition: No runnable children AND at least one blocked child
  const nonTerminalChildren = children.length - terminalChildren.length;
  if (nonTerminalChildren > 0 && runnableChildren.length === 0 && blockedChildren.length > 0) {
    result.isAllBlocked = true;
    result.detectedAt = new Date().toISOString();

    // Aggregate blockers
    result.blockers = aggregateBlockers(blockedChildren);
  }

  return result;
}

/**
 * Check if a child SD is blocked
 * @param {object} child - Child SD record
 * @param {array} allChildren - All children for dependency resolution
 * @param {object} supabase - Supabase client
 * @returns {Promise<object>} Blocked status and reason
 */
async function checkIfChildBlocked(child, allChildren, supabase) {
  const blockerReasons = [];

  // Check explicit blocked status in metadata
  if (child.metadata?.blocked) {
    blockerReasons.push({
      type: 'explicit_block',
      reason: child.metadata.blocked_reason || 'Explicitly marked as blocked',
      severity: 'HIGH'
    });
  }

  // Check dependencies
  if (child.dependencies && Array.isArray(child.dependencies)) {
    for (const depId of child.dependencies) {
      // Find the dependency in children
      const dep = allChildren.find(c => c.id === depId);
      if (dep) {
        if (!TERMINAL_STATES.includes(dep.status?.toLowerCase()) || dep.status === 'completed') {
          // Dependency not complete
          if (dep.status !== 'completed') {
            blockerReasons.push({
              type: 'dependency_incomplete',
              reason: `Waiting on dependency: ${dep.title} (${dep.status})`,
              dependencyId: depId,
              dependencyTitle: dep.title,
              severity: 'MEDIUM'
            });
          }
        }
      }
    }
  }

  // Check for handoff blockers
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, context')
    .eq('sd_id', child.id)
    .eq('status', 'blocked')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffs && handoffs.length > 0) {
    const handoff = handoffs[0];
    blockerReasons.push({
      type: 'handoff_blocked',
      reason: `Handoff ${handoff.handoff_type} is blocked`,
      handoffType: handoff.handoff_type,
      severity: 'HIGH'
    });
  }

  // Check for validation gate failures
  const { data: failures } = await supabase
    .from('sd_gate_results')
    .select('gate_name, result, details')
    .eq('sd_id', child.id)
    .eq('result', 'failed')
    .order('created_at', { ascending: false })
    .limit(3);

  if (failures && failures.length > 0) {
    for (const failure of failures) {
      blockerReasons.push({
        type: 'gate_failure',
        reason: `Gate failed: ${failure.gate_name}`,
        gateName: failure.gate_name,
        severity: 'MEDIUM'
      });
    }
  }

  return {
    blocked: blockerReasons.length > 0,
    reasons: blockerReasons
  };
}

/**
 * Aggregate blockers from all blocked children
 * Deduplicates identical blockers and orders by severity
 * @param {array} blockedChildren - Array of blocked children with blocker info
 * @returns {array} Aggregated and sorted blockers
 */
function aggregateBlockers(blockedChildren) {
  const blockerMap = new Map();

  for (const { child, blockerInfo } of blockedChildren) {
    for (const reason of blockerInfo.reasons) {
      // Create a unique key for deduplication
      const key = `${reason.type}:${reason.reason}`;

      if (blockerMap.has(key)) {
        // Add to occurrences
        const existing = blockerMap.get(key);
        existing.occurrences++;
        existing.affectedChildIds.push(child.id);
        existing.affectedChildTitles.push(child.title);
        existing.lastSeenAt = new Date().toISOString();
      } else {
        blockerMap.set(key, {
          id: `blocker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: reason.type,
          title: getBlockerTitle(reason),
          description: reason.reason,
          severity: reason.severity,
          category: reason.type,
          occurrences: 1,
          affectedChildIds: [child.id],
          affectedChildTitles: [child.title],
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          recommendedActions: getRecommendedActions(reason)
        });
      }
    }
  }

  // Convert to array and sort by severity (HIGH first) then by lastSeenAt
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return Array.from(blockerMap.values())
    .sort((a, b) => {
      const severityDiff = (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.lastSeenAt) - new Date(a.lastSeenAt);
    });
}

/**
 * Get a human-readable title for a blocker
 */
function getBlockerTitle(reason) {
  switch (reason.type) {
    case 'explicit_block':
      return 'Explicitly Blocked';
    case 'dependency_incomplete':
      return `Dependency: ${reason.dependencyTitle || 'Unknown'}`;
    case 'handoff_blocked':
      return `Handoff Blocked: ${reason.handoffType}`;
    case 'gate_failure':
      return `Gate Failed: ${reason.gateName}`;
    default:
      return 'Unknown Blocker';
  }
}

/**
 * Get recommended actions for resolving a blocker
 */
function getRecommendedActions(reason) {
  switch (reason.type) {
    case 'explicit_block':
      return ['Review blocked reason', 'Contact stakeholder to resolve'];
    case 'dependency_incomplete':
      return [`Complete dependency: ${reason.dependencyTitle}`, 'Check dependency status'];
    case 'handoff_blocked':
      return ['Review handoff failure details', 'Address validation issues', 'Retry handoff'];
    case 'gate_failure':
      return ['Review gate failure details', 'Fix failing validation', 'Re-run gate'];
    default:
      return ['Investigate blocker', 'Contact support'];
  }
}

/**
 * Persist ALL_BLOCKED state to the orchestrator SD
 * @param {string} orchestratorId - Orchestrator SD ID
 * @param {object} blockedState - Detection result from detectAllBlockedState
 * @param {object} supabase - Supabase client
 */
export async function persistAllBlockedState(orchestratorId, blockedState, supabase = null) {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }

  // Get current metadata
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', orchestratorId)
    .single();

  const currentMetadata = sd?.metadata || {};

  // Update metadata with blocked state info
  const updatedMetadata = {
    ...currentMetadata,
    all_blocked_state: {
      is_blocked: blockedState.isAllBlocked,
      detected_at: blockedState.detectedAt,
      total_children: blockedState.totalChildren,
      terminal_children: blockedState.terminalChildren,
      blocked_children: blockedState.blockedChildren,
      runnable_children: blockedState.runnableChildren,
      blockers: blockedState.blockers,
      awaiting_decision: blockedState.isAllBlocked
    }
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: updatedMetadata })
    .eq('id', orchestratorId);

  if (error) {
    console.error('Failed to persist ALL_BLOCKED state:', error.message);
    return false;
  }

  return true;
}

/**
 * Record a user decision for an ALL_BLOCKED orchestrator
 * @param {string} orchestratorId - Orchestrator SD ID
 * @param {string} decision - 'resume' | 'cancel' | 'override'
 * @param {object} options - Additional options (reason for override, etc.)
 * @param {object} supabase - Supabase client
 */
export async function recordUserDecision(orchestratorId, decision, options = {}, supabase = null) {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }

  const validDecisions = ['resume', 'cancel', 'override'];
  if (!validDecisions.includes(decision)) {
    return { success: false, error: `Invalid decision: ${decision}. Must be one of: ${validDecisions.join(', ')}` };
  }

  // For override, require a reason
  if (decision === 'override' && (!options.reason || options.reason.length < 10)) {
    return { success: false, error: 'Override decision requires a reason of at least 10 characters' };
  }

  // Get current orchestrator state
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata, status')
    .eq('id', orchestratorId)
    .single();

  if (!sd) {
    return { success: false, error: 'Orchestrator not found' };
  }

  const currentMetadata = sd.metadata || {};
  const blockedState = currentMetadata.all_blocked_state;

  if (!blockedState?.is_blocked) {
    return { success: false, error: 'Orchestrator is not in ALL_BLOCKED state' };
  }

  // Record the decision
  const decisionRecord = {
    decision,
    timestamp: new Date().toISOString(),
    reason: options.reason || null,
    affected_blockers: options.affectedBlockerIds || blockedState.blockers?.map(b => b.id) || [],
    user_id: options.userId || 'system'
  };

  // Update metadata
  const updatedMetadata = {
    ...currentMetadata,
    all_blocked_state: {
      ...blockedState,
      is_blocked: false,
      awaiting_decision: false,
      resolved_at: new Date().toISOString(),
      resolution_decision: decisionRecord
    },
    decision_history: [
      ...(currentMetadata.decision_history || []),
      decisionRecord
    ]
  };

  // For cancel decision, also update status
  const updates = { metadata: updatedMetadata };
  if (decision === 'cancel') {
    updates.status = 'cancelled';
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update(updates)
    .eq('id', orchestratorId);

  if (updateError) {
    return { success: false, error: `Failed to record decision: ${updateError.message}` };
  }

  // Log the decision for audit
  await supabase.from('audit_logs').insert({
    entity_type: 'orchestrator_decision',
    entity_id: orchestratorId,
    action: `all_blocked_${decision}`,
    details: decisionRecord,
    severity: decision === 'cancel' ? 'warning' : 'info'
  }).catch(() => {
    // Audit log failure shouldn't block the main operation
  });

  return { success: true, decision: decisionRecord };
}

export default {
  detectAllBlockedState,
  persistAllBlockedState,
  recordUserDecision
};
