/**
 * Child SD Selector
 *
 * Selects the next ready child SD from an orchestrator parent.
 * Used by AUTO-PROCEED to continue through child SDs automatically.
 *
 * Part of AUTO-PROCEED continuation implementation (D26, D01)
 * Enhanced with learning-based queue re-prioritization (SD-LEO-ENH-AUTO-PROCEED-001-11)
 *
 * @module child-sd-selector
 */

import { createClient } from '@supabase/supabase-js';
import { sortByUrgency, scoreToBand } from '../auto-proceed/urgency-scorer.js';

/**
 * Check if an SD is a child (has a parent)
 * @param {object} sd - SD record
 * @returns {boolean}
 */
export function isChildSD(sd) {
  return !!sd?.parent_sd_id;
}

/**
 * Get next ready child SD from parent orchestrator
 *
 * @param {object} supabase - Supabase client
 * @param {string} parentSdId - Parent orchestrator SD ID
 * @param {string} excludeCompletedId - Just-completed child ID to exclude
 * @returns {Promise<{sd: object|null, allComplete: boolean, reason: string}>}
 */
export async function getNextReadyChild(supabase, parentSdId, excludeCompletedId = null) {
  if (!parentSdId) {
    return { sd: null, allComplete: false, reason: 'No parent ID provided' };
  }

  try {
    // Query for children that are ready to work on
    // Status must be one that indicates work can start
    // SD-LEO-ENH-AUTO-PROCEED-001-10: Also fetch metadata to check for blockers
    // SD-LEO-ENH-AUTO-PROCEED-001-11: Fetch all candidates for urgency-based sorting
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, current_phase, sequence_rank, created_at, metadata, dependencies, updated_at, progress_percentage')
      .eq('parent_sd_id', parentSdId)
      .in('status', ['draft', 'in_progress', 'planning', 'active', 'pending_approval', 'review']);

    // Exclude the just-completed SD if provided
    if (excludeCompletedId) {
      query = query.neq('id', excludeCompletedId);
    }

    // SD-LEO-ENH-AUTO-PROCEED-001-11: Fetch all candidates, sort client-side by urgency
    const { data: candidates, error } = await query;

    if (error) {
      console.warn(`   [child-sd-selector] Query error: ${error.message}`);
      return { sd: null, allComplete: false, reason: `Query error: ${error.message}` };
    }

    // SD-LEO-ENH-AUTO-PROCEED-001-10: Filter out SDs with unresolved blockers
    const unblocked = candidates ? candidates.filter(child => {
      // Check for explicit blocked_by in metadata
      const blockedBy = child.metadata?.blocked_by;
      if (blockedBy && Array.isArray(blockedBy) && blockedBy.length > 0) {
        console.log(`   [child-sd-selector] Skipping ${child.sd_key || child.id} - has ${blockedBy.length} unresolved blocker(s)`);
        return false;
      }
      return true;
    }) : [];

    // SD-LEO-ENH-AUTO-PROCEED-001-11: Sort by urgency (band > score > enqueue_time)
    // Map candidates to include urgency data for sorting
    const withUrgency = unblocked.map(child => ({
      ...child,
      urgency_score: child.metadata?.urgency_score ?? 0.5,
      urgency_band: child.metadata?.urgency_band ?? scoreToBand(child.metadata?.urgency_score ?? 0.5),
      enqueue_time: child.created_at
    }));

    // Sort by urgency (highest priority first)
    const sorted = sortByUrgency(withUrgency);

    // If we found a ready child (without blockers), return the highest urgency one
    if (sorted && sorted.length > 0) {
      const selected = sorted[0];
      const reason = selected.urgency_band
        ? `Next child found (${selected.urgency_band}, score: ${selected.urgency_score})`
        : 'Next child found';
      return { sd: selected, allComplete: false, reason };
    }

    // No ready children - check if all children are complete
    const { data: allChildren, error: allError } = await supabase
      .from('strategic_directives_v2')
      .select('id, status')
      .eq('parent_sd_id', parentSdId);

    if (allError) {
      console.warn(`   [child-sd-selector] All children query error: ${allError.message}`);
      return { sd: null, allComplete: false, reason: `Query error: ${allError.message}` };
    }

    if (!allChildren || allChildren.length === 0) {
      return { sd: null, allComplete: true, reason: 'No children found' };
    }

    // Check completion status
    const completedCount = allChildren.filter(c => c.status === 'completed').length;
    const totalCount = allChildren.length;
    const allComplete = completedCount === totalCount;

    if (allComplete) {
      return { sd: null, allComplete: true, reason: `All ${totalCount} children completed` };
    }

    // Some children exist but none are ready (blocked or in unexpected state)
    const blockedCount = allChildren.filter(c => c.status === 'blocked').length;
    if (blockedCount > 0) {
      return {
        sd: null,
        allComplete: false,
        reason: `${blockedCount} children blocked, ${completedCount}/${totalCount} completed`
      };
    }

    return {
      sd: null,
      allComplete: false,
      reason: `No ready children: ${completedCount}/${totalCount} completed`
    };
  } catch (err) {
    console.warn(`   [child-sd-selector] Error: ${err.message}`);
    return { sd: null, allComplete: false, reason: err.message };
  }
}

/**
 * Get orchestrator context (parent info and child stats)
 *
 * @param {object} supabase - Supabase client
 * @param {string} parentSdId - Parent SD ID
 * @returns {Promise<{parent: object|null, children: array, stats: object}>}
 */
export async function getOrchestratorContext(supabase, parentSdId) {
  try {
    // Get parent SD
    const { data: parent, error: parentError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase')
      .eq('id', parentSdId)
      .single();

    if (parentError) {
      return { parent: null, children: [], stats: { total: 0, completed: 0, remaining: 0 } };
    }

    // Get all children
    const { data: children, error: childrenError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, sequence_rank')
      .eq('parent_sd_id', parentSdId)
      .order('sequence_rank', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (childrenError) {
      return { parent, children: [], stats: { total: 0, completed: 0, remaining: 0 } };
    }

    // Calculate stats
    const completed = children.filter(c => c.status === 'completed').length;
    const blocked = children.filter(c => c.status === 'blocked').length;
    const inProgress = children.filter(c => ['in_progress', 'planning', 'active', 'pending_approval', 'review'].includes(c.status)).length;
    const draft = children.filter(c => c.status === 'draft').length;

    return {
      parent,
      children,
      stats: {
        total: children.length,
        completed,
        blocked,
        inProgress,
        draft,
        remaining: children.length - completed
      }
    };
  } catch (err) {
    console.warn(`   [child-sd-selector] Context error: ${err.message}`);
    return { parent: null, children: [], stats: { total: 0, completed: 0, remaining: 0 } };
  }
}

/**
 * Create a Supabase client using environment variables
 * @returns {object} Supabase client
 */
export function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default {
  isChildSD,
  getNextReadyChild,
  getOrchestratorContext,
  createSupabaseClient
};
