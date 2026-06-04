/**
 * Shared Quick-Fix CAS Claim Helper
 * SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-1)
 *
 * Single source of truth for the atomic compare-and-swap that takes ownership
 * of a quick_fixes row. The QF auto-proceed / adopt path was previously
 * session-blind: two parallel sessions could both run `/leo <QF-id>` and start
 * the same quick-fix. This helper closes that race the same way the SD path
 * already does — a fail-closed CAS guarded on the current holder.
 *
 * Guard semantics: `claiming_session_id IS NULL OR claiming_session_id = sessionId`.
 *   - NULL      → unclaimed; this session takes it.
 *   - = self    → idempotent self re-adopt (prospective DEFECT 4). A session
 *                 that already holds the claim (e.g. re-running /quick-fix, or
 *                 the reaffirm path in claim-guard) must NOT lose its own claim
 *                 or be told it lost a race against itself. The self branch of
 *                 the guard makes claimQuickFix a no-op-safe re-affirm.
 *   - = other   → a DIFFERENT live/stale holder owns it → 0 rows updated →
 *                 claimed:false (the legitimate "lost race" signal). The
 *                 stale-claim release in scripts/stale-session-sweep.cjs
 *                 (clearStaleQfClaims) is what frees a dead holder's claim;
 *                 we deliberately do NOT take over here.
 *
 * @module quick-fix-claim
 * @see scripts/create-quick-fix.js:405-414 - the proven NULL-only CAS shape this generalizes
 * @see scripts/stale-session-sweep.cjs clearStaleQfClaims() - stale-holder release (no takeover here)
 */

/**
 * Atomically claim a quick-fix for a session.
 *
 * Fail-closed: a real PostgREST error THROWS (the caller must not silently
 * proceed as if it claimed). A 0-row result is NOT an error — it is the
 * legitimate "a different holder owns it" signal and returns claimed:false.
 *
 * @param {object} supabase - supabase-js client (anon or service role)
 * @param {string} qfId - quick_fixes.id (e.g. 'QF-20260101-001')
 * @param {string} sessionId - the claiming session's id
 * @returns {Promise<{ claimed: boolean, holder: string|null }>}
 *   claimed=true  → this session now holds the claim (null-or-self path); holder=sessionId.
 *   claimed=false → a different holder owns it; holder=current claiming_session_id (best-effort read).
 */
export async function claimQuickFix(supabase, qfId, sessionId) {
  if (!supabase) throw new Error('claimQuickFix requires a supabase client');
  if (!qfId || !sessionId) throw new Error('claimQuickFix requires both qfId and sessionId');

  // Fail-closed CAS. The .or() filter encodes (claiming_session_id IS NULL OR
  // claiming_session_id = sessionId) so a foreign live/stale holder yields 0 rows.
  const { data, error } = await supabase
    .from('quick_fixes')
    .update({
      claiming_session_id: sessionId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', qfId)
    .or(`claiming_session_id.is.null,claiming_session_id.eq.${sessionId}`)
    .select('id,claiming_session_id')
    .maybeSingle();

  // FAIL LOUD on a real error — never treat a query failure as a lost race.
  if (error) {
    throw new Error(`claimQuickFix CAS failed for ${qfId}: ${error.message}`);
  }

  if (data) {
    return { claimed: true, holder: data.claiming_session_id || sessionId };
  }

  // 0 rows → a DIFFERENT holder owns it. Follow-up read to report who, for the
  // caller's BLOCK message. Best-effort: if this read fails, holder stays null.
  let holder = null;
  try {
    const { data: cur } = await supabase
      .from('quick_fixes')
      .select('claiming_session_id')
      .eq('id', qfId)
      .maybeSingle();
    holder = cur?.claiming_session_id || null;
  } catch {
    /* best-effort holder lookup; leave null */
  }
  return { claimed: false, holder };
}

export default { claimQuickFix };
