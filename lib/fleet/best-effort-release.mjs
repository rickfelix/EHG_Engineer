/**
 * best-effort-release — release a claim back to the queue WITHOUT ever throwing.
 * SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 (FR-1/FR-3).
 *
 * THE BUG IT REPLACES: `await supabase.rpc('release_sd', {...}).catch(() => {})`. The PostgREST query
 * builder returned by .rpc() is THENABLE (it has .then) but is NOT a Promise — it has NO .catch. So
 * `.catch(() => {})` threw a SYNCHRONOUS `TypeError: ....catch is not a function` BEFORE the blocking
 * `process.exit(1)` that followed it. The surrounding try/catch swallowed that TypeError as a
 * 'fail-open' skip, so a POSITIVELY-determined UNFIT (e.g. wrong-target_application) SD got CLAIMED
 * anyway — the worker then could not build it from the wrong checkout.
 *
 * THE CONTRACT: await the builder INSIDE a try/catch so a release failure (or a builder without .catch)
 * can never break the caller's control flow. The release is BEST-EFFORT cleanup; the caller's claim
 * block + process.exit(1) must be UNCONDITIONAL (called regardless of the result here).
 *
 * QF-20260726-593 — SD-SCOPING GUARD (`expectedSdKey`).
 * release_sd(p_session_id, p_reason) takes NO SD argument: it selects sd_key from
 * claude_sessions for the session and releases WHATEVER THAT SESSION CURRENTLY HOLDS
 * (20260502_release_clear_worktree_state.sql:24). So a caller releasing "this SD" on a
 * fail-closed path can silently drop a live claim on an UNRELATED SD. Making the RPC
 * SD-scoped is a DDL change (chairman-gated); this is the sanctioned alternative from the
 * QF scope — "have every caller assert the session holds the SD it intends to release
 * before calling" — enforced HERE, at the shared chokepoint every caller routes through,
 * rather than at individual call sites.
 *
 * Pass `expectedSdKey` and the release becomes a no-op unless the session actually holds
 * that SD. Fail-CLOSED by construction: if the guard is requested but cannot be verified
 * (no `.from`, query error), we REFUSE to release — an unverifiable scope check must not
 * degrade into the unscoped behavior it exists to prevent. Omitting `expectedSdKey`
 * preserves today's unscoped behavior byte-for-byte for callers not yet migrated.
 *
 * @param {{ rpc: Function, from?: Function }} supabase
 * @param {string} sessionId
 * @param {string} [reason] - name the MECHANISM, not 'manual'. The RPC's default reason is
 *   'manual', which makes a mechanical release byte-identical to a deliberate one and has
 *   already produced two wrong incident conclusions.
 * @param {(msg: string) => void} [log]
 * @param {{ expectedSdKey?: string }} [opts]
 * @returns {Promise<{ released: boolean, error: (string|null), skipped?: string, heldSdKey?: (string|null) }>}  NEVER throws.
 */
export async function bestEffortReleaseSd(supabase, sessionId, reason = 'manual', log = console.error, opts = {}) {
  try {
    if (!supabase || typeof supabase.rpc !== 'function') {
      return { released: false, error: 'no_supabase' };
    }

    const expectedSdKey = opts && opts.expectedSdKey;
    if (expectedSdKey) {
      if (typeof supabase.from !== 'function') {
        log(`   ⚠ release_sd SKIPPED — SD-scoped release requested for ${expectedSdKey} but session state is unreadable (no .from); refusing to release an unknown claim.`);
        return { released: false, error: 'scope_unverifiable', skipped: 'scope_unverifiable' };
      }
      const held = await supabase
        .from('claude_sessions')
        .select('sd_key')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (held && held.error) {
        log(`   ⚠ release_sd SKIPPED — could not verify which SD session ${sessionId} holds: ${held.error.message || held.error}`);
        return { released: false, error: 'scope_unverifiable', skipped: 'scope_unverifiable' };
      }
      const heldSdKey = held && held.data ? held.data.sd_key : null;
      if (heldSdKey !== expectedSdKey) {
        // The exact QF-20260726-593 defect, caught: we were about to release a claim
        // on a DIFFERENT SD than the one this code path is reasoning about.
        log(`   ⚠ release_sd SKIPPED — session ${sessionId} holds ${heldSdKey === null ? '(nothing)' : heldSdKey}, not ${expectedSdKey}; releasing would drop an unrelated claim (QF-20260726-593).`);
        return { released: false, error: null, skipped: 'sd_mismatch', heldSdKey };
      }
    }

    const res = await supabase.rpc('release_sd', { p_session_id: sessionId, p_reason: reason });
    if (res && res.error) {
      const msg = res.error.message || String(res.error);
      log(`   ⚠ release_sd returned an error (best-effort cleanup; claim block still enforced): ${msg}`);
      return { released: false, error: msg };
    }
    return { released: true, error: null };
  } catch (e) {
    // A rejected await, OR a builder that lacks .catch and threw — either way, swallow it here so the
    // CALLER's unconditional block/exit proceeds (fail-CLOSED on the claim, best-effort on the cleanup).
    const msg = e && e.message ? e.message : String(e);
    log(`   ⚠ release_sd threw (best-effort cleanup; claim block still enforced): ${msg}`);
    return { released: false, error: msg };
  }
}

export default { bestEffortReleaseSd };
