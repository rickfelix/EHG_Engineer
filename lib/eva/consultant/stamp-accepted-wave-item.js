/**
 * Chairman-accept -> build-eligible stamp writer.
 * SD-LEO-INFRA-UNIFY-BELT-REFILL-001 (FR-2).
 *
 * When the chairman ACCEPTS an eva_consultant_recommendations row, the originating roadmap_wave_items row
 * must become a belt-refill candidate. Before this SD, NO code stamped acceptance back onto the wave item
 * (grep-verified; the live DB had 0 items at item_disposition='selected'), so an accepted distilled
 * candidate never became build-eligible — the belt auto-refill starved. This is the single, shared,
 * idempotent writer that closes that seam.
 *
 * The unified belt-refill discriminant (see lib/sourcing-engine/refill-candidate-validity.js
 * hasBuildDisposition / BUILD_DISPOSITIONS) reads roadmap_wave_items.item_disposition === 'selected' as the
 * build-eligible marker. 'selected' is the chairman/distiller-accepted, pre-promotion value in the
 * item_disposition vocabulary and is already a valid CHECK value — so this is CODE-ONLY, no migration.
 *
 * Idempotent + terminal-guarded: only sets 'selected' when the row is NOT already in a terminal state
 * ('promoted'/'dropped') — it never clobbers a terminal disposition, and re-stamping a 'selected' row is a
 * value no-op. Fail-soft: never throws; a stamp failure is returned (and logged) so the caller's accept is
 * not aborted by a stamping error.
 */

// The build-eligible item_disposition value the unified belt-refill discriminant reads (BUILD_DISPOSITIONS
// in refill-candidate-validity.js). Kept as a local literal (with this comment) rather than importing the
// predicate's Set so the write seam stays decoupled from the pure predicate module.
export const BUILD_ELIGIBLE_DISPOSITION = 'selected';

// Terminal item_disposition states that must never be overwritten by an accept stamp.
export const TERMINAL_DISPOSITIONS = ['promoted', 'dropped'];

/**
 * Stamp the linked roadmap_wave_items row build-eligible (item_disposition='selected') on chairman accept.
 * Idempotent, terminal-guarded, fail-soft.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null|undefined} waveItemId  the recommendation's source_wave_item_id (may be null)
 * @returns {Promise<{stamped:boolean, reason:string, error?:string}>}
 *          reason: 'no_source_wave_item' | 'stamped' | 'skipped_terminal' | 'error'
 */
export async function stampAcceptedWaveItem(supabase, waveItemId) {
  // Guard a null/absent source link: a clean no-op (many recommendations have no wave-item provenance).
  if (!waveItemId) return { stamped: false, reason: 'no_source_wave_item' };

  try {
    // Single atomic UPDATE ... WHERE id = ? AND item_disposition NOT IN ('promoted','dropped').
    // The terminal guard lives in the WHERE clause so a terminal row matches 0 rows (never clobbered);
    // .select() returns the affected rows so we can tell a real stamp from a terminal skip.
    const { data, error } = await supabase
      .from('roadmap_wave_items')
      .update({ item_disposition: BUILD_ELIGIBLE_DISPOSITION })
      .eq('id', waveItemId)
      .not('item_disposition', 'in', `("${TERMINAL_DISPOSITIONS.join('","')}")`)
      .select('id, item_disposition');

    if (error) {
      console.error(`[stamp-accepted-wave-item] update failed for ${waveItemId}: ${error.message}`);
      return { stamped: false, reason: 'error', error: error.message };
    }
    const stamped = Array.isArray(data) && data.length > 0;
    return { stamped, reason: stamped ? 'stamped' : 'skipped_terminal' };
  } catch (err) {
    // Fail-soft: the accept must not abort on a stamp error.
    console.error(`[stamp-accepted-wave-item] threw for ${waveItemId}: ${err.message}`);
    return { stamped: false, reason: 'error', error: err.message };
  }
}
