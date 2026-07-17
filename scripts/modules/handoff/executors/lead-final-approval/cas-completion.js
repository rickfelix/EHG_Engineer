/**
 * SD-LEO-FIX-POST-MERGE-AUTOMATION-001 FR-2 — atomic compare-and-set for the
 * LEAD-FINAL-APPROVAL terminal completion, plus loser-side cleanup.
 *
 * The terminal strategic_directives_v2 UPDATE used to be unconditional
 * (.eq('id', sd.id) only), so two invocations that both passed the claim gate
 * while status was still 'pending_approval' could both believe they completed
 * the SD — one of them silently overwriting/duplicating the other's evidence.
 * attemptCasCompletion() guards the UPDATE with .eq('status', 'pending_approval')
 * and reports whether THIS call actually won (rows affected). The loser must
 * re-read fresh SD state and reconcile via the existing already-completed path
 * rather than assuming success.
 *
 * cleanupLosingPreInsert() removes the losing invocation's own unconditional
 * leo_handoff_executions pre-insert (executeSpecific always pre-inserts before
 * reaching the CAS, regardless of whether it turns out to win or lose) — without
 * this, the CAS guard alone still leaves a duplicate accepted/pending_acceptance
 * row behind even though only one invocation actually completed the SD.
 */

/**
 * @param {object} supabase - Supabase client
 * @param {{id:string}} sd - SD row (only .id is used)
 * @param {object} updateFields - fields to set on the winning transition
 * @returns {Promise<{won:boolean, error?:object}>}
 */
export async function attemptCasCompletion(supabase, sd, updateFields) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update(updateFields)
    .eq('id', sd.id)
    .eq('status', 'pending_approval')
    .select('id');

  if (error) return { won: false, error };
  return { won: Array.isArray(data) && data.length > 0 };
}

/**
 * Delete a specific pre-inserted leo_handoff_executions row by id (never by
 * sd_id+status, which could match the winner's legitimate row instead).
 * Fail-soft: cleanup errors log a warning but never throw.
 * @param {object} supabase - Supabase client
 * @param {string|null} rowId - id returned from the pre-insert's .select()
 * @returns {Promise<void>}
 */
export async function cleanupLosingPreInsert(supabase, rowId) {
  if (!rowId) return;
  try {
    const { error } = await supabase
      .from('leo_handoff_executions')
      .delete()
      .eq('id', rowId);
    if (error) {
      console.warn(`   ⚠️  [LFA_CAS_LOSER_CLEANUP_FAILED] row_id=${rowId} reason=${error.message}`);
    }
  } catch (cleanupErr) {
    console.warn(`   ⚠️  [LFA_CAS_LOSER_CLEANUP_FAILED] row_id=${rowId} reason=${cleanupErr?.message || cleanupErr}`);
  }
}
