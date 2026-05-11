/**
 * SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-4
 *
 * Release pre-claimed feedback rows owned by a given QF. Conditional UPDATE
 * gated on metadata.qf_claim_state='pending' so we NEVER touch rows that were
 * properly closed via complete-quick-fix.js success path (those clear
 * qf_claim_state by setting it to a terminal value or removing the key).
 *
 * Used by:
 *   - scripts/cancel-sd.js (QF cancellation path)
 *   - scripts/complete-quick-fix.js (failure paths)
 *   - scripts/release-feedback-preclaim.js (manual admin tool)
 *   - scripts/worktree-reaper.mjs (stale-sweep, TTL 4h)
 */

/**
 * Release pre-claimed feedback rows for a given QF id.
 *
 * @param {object} opts
 * @param {object} opts.supabase - Supabase client
 * @param {string} opts.quickFixId - QF id whose pre-claims to release
 * @returns {Promise<{released: string[]}>} list of feedback ids released
 */
export async function releasePreclaim({ supabase, quickFixId }) {
  if (!quickFixId) {
    const e = new Error('releasePreclaim: quickFixId is required');
    e.code = 'RELEASE_PRECLAIM_NO_QF_ID';
    throw e;
  }
  // Step 1: find pending-state pre-claims owned by this QF.
  const { data: targets, error: readErr } = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('quick_fix_id', quickFixId);
  if (readErr) throw readErr;
  const released = [];
  for (const row of targets || []) {
    const meta = row.metadata || {};
    if (meta.qf_claim_state !== 'pending') continue; // skip non-pending (e.g. shipping/legacy)
    // Strip claim keys; preserve other metadata.
    const { qf_claim_state, qf_claim_at, ...rest } = meta;
    const { data: updRows, error: updErr } = await supabase
      .from('feedback')
      .update({ quick_fix_id: null, session_id: null, metadata: rest })
      .eq('id', row.id)
      .eq('quick_fix_id', quickFixId)
      .select('id');
    if (updErr) throw updErr;
    if (updRows && updRows.length === 1) released.push(row.id);
  }
  return { released };
}
