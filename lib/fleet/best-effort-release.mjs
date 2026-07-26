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

/**
 * Clear a quick-fix claim AND reopen the row, as ONE operation.
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 (FR-1).
 *
 * WHY THIS EXISTS. Clearing quick_fixes.claiming_session_id WITHOUT reverting status leaves a row
 * at status='in_progress' with a NULL claimant. That row is unreachable by every consumer — all
 * five candidate chokepoints require status='open' (worker-checkin.cjs isAutoStartableQF, its two
 * candidate queries, lib/checkin/steps/critical-qf-jump.cjs, scripts/coordinator-idle-qf-hint.mjs)
 * — while TWO supply gauges still count it as available (lib/coordinator/coordination-events.cjs).
 * So the work silently leaves the belt and the gauge reports it as present. Measured live at
 * authoring time: 7 rows stranded, 6 of them critical, 78% of the entire in_progress population,
 * against only 2 rows a worker could actually claim.
 *
 * THE REVERT LIVES **WITH** THE CLEAR, DELIBERATELY. A compensating write already existed at
 * scripts/stale-session-sweep.cjs:237-239 and was correct — but it sat on ONE leg of ONE script,
 * so every other clear path stranded the row. Fixing this by adding a second compensating write
 * beside each clear would reproduce the same defect at the next call site somebody adds. Callers
 * get one function that cannot do half the job.
 *
 * THE GUARD IS REUSED VERBATIM, NOT RE-DERIVED, from that same site: it already refuses to touch a
 * row carrying real work (pr_url / commit_sha) or a new claimant, which is exactly what keeps this
 * helper from resurrecting the legitimately-terminal call sites (completed / cancelled / escalated).
 * Re-deriving the predicate here would be a parallel implementation that agrees with the original
 * only until one of them changes.
 *
 * SPELLING NOTE — .filter('status','eq',...) rather than .eq('status',...). Wire-identical, and
 * kept because tests/unit/scripts/stale-session-sweep-claim-safety.test.js anchors on the FIRST
 * eq-form status/in_progress match in ITS file's source order. This helper lives in a separate
 * module so that coupling does not follow it, but the spelling is preserved so a future move of
 * this code back into that file cannot silently slide the anchor onto the wrong query.
 *
 * Returns a RESULT rather than void: a void helper forces callers and tests back onto call-shape
 * assertions ("was update() called with X"), which pass over a helper that issues the right UPDATE
 * against a predicate matching zero rows. `changed` reports the EFFECT.
 *
 * @param {object} supabase - injected client (never module-scope: keeps this unit-testable)
 * @param {string} qfId - quick_fixes.id
 * @returns {Promise<{changed: boolean, reason: string}>}
 */
export async function clearAndReopenQf(supabase, qfId) {
  if (!supabase || !qfId) return { changed: false, reason: 'missing_argument' };

  const { data, error } = await supabase
    .from('quick_fixes')
    .update({ status: 'open', claiming_session_id: null })
    .eq('id', qfId)
    .filter('status', 'eq', 'in_progress')
    .is('claiming_session_id', null)
    .is('pr_url', null)
    .is('commit_sha', null)
    .select('id');

  // Fail-soft: a release path must not throw because the reopen half failed. The row stays
  // stranded, which is the pre-fix behaviour — strictly no worse, and reported rather than hidden.
  if (error) return { changed: false, reason: `update_failed:${error.message}` };

  const changed = Array.isArray(data) ? data.length > 0 : Boolean(data);
  // 'guard_refused' is not an error: it is the guard doing its job on a row with real work, a new
  // claimant, or one already open. Distinguishing it from 'reopened' is what lets a caller tell
  // "nothing needed doing" from "something went wrong" — the same distinction this SD exists to add.
  return { changed, reason: changed ? 'reopened' : 'guard_refused' };
}

export default { bestEffortReleaseSd, clearAndReopenQf };
