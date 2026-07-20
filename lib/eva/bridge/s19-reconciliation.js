/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-5): the S19->S20 reconciliation invariant. Surfaces any
 * leo_bridge venture that has advanced PAST Stage 19 while its SD tree is NOT complete — the
 * defining symptom of the a14ff998/7610876f gate-bypass (which left zero audit trail, so a
 * queryable backstop is the only way to detect a future recurrence).
 *
 * Reuses the EXACT _isLeoBridgeBuildComplete semantics (lib/eva/stage-execution-worker.js): a tree
 * is complete only when every SD is terminal AND at least one genuinely completed; an empty tree,
 * any non-terminal SD, or an all-cancelled tree is INCOMPLETE. ventures.build_model is the SSOT.
 * The chairman_override escape hatch (advisory_data.chairman_override===true) is the sanctioned way
 * to advance an incomplete tree and is excluded. Read-only; safe on any schedule.
 */

import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

const TERMINAL = new Set(['completed', 'cancelled', 'archived']);
const COMPLETED = new Set(['completed', 'archived']);

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{venture_id:string,name:string,current_lifecycle_stage:number,tree_count:number,reason:string}>>}
 */
export async function findS19AdvanceViolations(supabase) {
  // Paginated (FR-6 batch 7): the reconciliation backstop must see every venture —
  // a capped read would silently miss bypass recurrences.
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, current_lifecycle_stage, build_model')
      .eq('build_model', 'leo_bridge')
      .gt('current_lifecycle_stage', 19)
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`s19-reconciliation: ventures query failed: ${e.message}`);
  }

  const violations = [];
  for (const v of (ventures || [])) {
    // chairman_override escape hatch — a sanctioned advance, not a violation.
    const { data: s19Work } = await supabase
      .from('venture_stage_work').select('advisory_data')
      .eq('venture_id', v.id).eq('lifecycle_stage', 19).maybeSingle();
    if (s19Work && s19Work.advisory_data && s19Work.advisory_data.chairman_override === true) continue;

    const { data: sds } = await supabase
      .from('strategic_directives_v2').select('status').eq('venture_id', v.id);
    const tree = sds || [];
    const treeCount = tree.length;
    const allTerminal = treeCount > 0 && tree.every((sd) => TERMINAL.has(sd.status));
    const anyCompleted = tree.some((sd) => COMPLETED.has(sd.status));
    const buildComplete = allTerminal && anyCompleted;
    if (!buildComplete) {
      violations.push({
        venture_id: v.id,
        name: v.name,
        current_lifecycle_stage: v.current_lifecycle_stage,
        tree_count: treeCount,
        reason: treeCount === 0 ? 'no_build_sds' : (!allTerminal ? 'tree_not_all_terminal' : 'all_cancelled'),
      });
    }
  }
  return violations;
}
