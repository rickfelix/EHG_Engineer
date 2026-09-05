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

    // SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (SECURITY finding, EXEC-TO-PLAN): distinguish
    // "caller passed opts.expectedSdKey" from "caller passed it, but it's falsy" -- a truthy
    // CHECK on the value alone (the original shape here) treats a falsy expectedSdKey
    // identically to a caller who never migrated to scoping at all, silently falling through
    // to the UNSCOPED legacy RPC call. releaseClaim()/releaseSessionClaim() always pass this
    // option (they always intend to scope); a bug upstream that hands them an empty sdKey
    // must still fail CLOSED here, not reproduce the exact QF-20260726-593 defect this SD
    // exists to close.
    const expectedSdKeyProvided = !!opts && Object.prototype.hasOwnProperty.call(opts, 'expectedSdKey');
    if (expectedSdKeyProvided && !opts.expectedSdKey) {
      log(`   ⚠ release_sd SKIPPED — expectedSdKey was provided but falsy (${JSON.stringify(opts.expectedSdKey)}); refusing to release without confirming which SD.`);
      return { released: false, error: 'invalid_expected_sd_key', skipped: 'invalid_expected_sd_key' };
    }
    const expectedSdKey = expectedSdKeyProvided ? opts.expectedSdKey : undefined;
    if (expectedSdKeyProvided) {
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
        const heldErrorMsg = held.error.message || String(held.error);
        log(`   ⚠ release_sd SKIPPED — could not verify which SD session ${sessionId} holds: ${heldErrorMsg}`);
        // SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002: `error` carries the underlying DB message (not
        // just the literal 'scope_unverifiable') so a caller surfacing `error` in its own
        // diagnostics doesn't lose it -- `skipped` remains the stable discriminator callers
        // should branch on, since `error`'s exact text can vary per underlying failure.
        return { released: false, error: heldErrorMsg, skipped: 'scope_unverifiable' };
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
    // SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-3): both known release_sd SQL bodies
    // (20260502 and 20260727) always return success:true today, making this branch
    // unreachable in practice — but a caller-visible RPC contract change should not
    // silently read as a release that happened. Close it once, here, for every consumer.
    // Prefers `message` over `error` (mirrors claim-swapper.js's swapClaim, which prefers
    // message as "the useful text" over a terse code) with a generic fallback for a bare
    // {success:false} payload carrying neither.
    if (res && res.data && res.data.success === false) {
      const failureMsg = res.data.message || res.data.error || 'release_sd_reported_failure';
      log(`   ⚠ release_sd reported success:false (best-effort cleanup; claim block still enforced): ${failureMsg}`);
      return { released: false, error: failureMsg };
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
 * best-effort-release-by-key — release ONLY the named claim row, WITHOUT ever throwing.
 * SD-LEO-INFRA-RELEASE-KEY-SESSION-001 (FR-3).
 *
 * REPLACES bestEffortReleaseSd's expectedSdKey path for callers that know the exact key they
 * intend to release. That path (QF-20260726-593) was an APPLICATION-LAYER check-then-act: read
 * claude_sessions.sd_key, THEN call the unscoped release_sd RPC — narrowing the race, never
 * closing it, since nothing locked the row between the read and the release. This function
 * instead calls release_sd_by_key(p_session_id, p_sd_key, p_reason)
 * (database/migrations/20260902_release_sd_by_key.sql), which performs the SAME holder check
 * as a SQL-level CAS under a row lock — the guard and the mutation are now one atomic
 * statement, not two round-trips a concurrent write can land between.
 *
 * Also closes the multi-hold gap bestEffortReleaseSd's expectedSdKey guard could not: that
 * guard only verified sdKey against claude_sessions.sd_key (the scalar pointer), so a session
 * holding sdKey as a SECONDARY claim (strategic_directives_v2.claiming_session_id /
 * quick_fixes.claiming_session_id, independent of the pointer) would be refused even though it
 * genuinely holds that row. release_sd_by_key checks the actual claim row, not just the
 * pointer, so this wrapper releases secondary holds bestEffortReleaseSd's guard could not.
 *
 * @param {{ rpc: Function }} supabase
 * @param {string} sessionId
 * @param {string} sdKey - the exact claim row to release; required, never inferred.
 * @param {string} [reason] - name the MECHANISM, not 'manual' (see bestEffortReleaseSd doc).
 * @param {(msg: string) => void} [log]
 * @returns {Promise<{ released: boolean, error: (string|null), skipped?: string, heldSdKey?: (string|null) }>} NEVER throws.
 */
export async function bestEffortReleaseSdByKey(supabase, sessionId, sdKey, reason = 'manual', log = console.error) {
  try {
    if (!supabase || typeof supabase.rpc !== 'function') {
      return { released: false, error: 'no_supabase' };
    }
    if (!sdKey) {
      log(`   ⚠ release_sd_by_key SKIPPED — no sdKey provided; refusing to release without naming which claim.`);
      return { released: false, error: 'invalid_sd_key', skipped: 'invalid_sd_key' };
    }

    const res = await supabase.rpc('release_sd_by_key', { p_session_id: sessionId, p_sd_key: sdKey, p_reason: reason });
    if (res && res.error) {
      const msg = res.error.message || String(res.error);
      log(`   ⚠ release_sd_by_key returned an error (best-effort cleanup; claim block still enforced): ${msg}`);
      return { released: false, error: msg };
    }
    const data = res && res.data;
    if (data && data.success === false) {
      if (data.error === 'sd_mismatch') {
        log(`   ⚠ release_sd_by_key SKIPPED — session ${sessionId} holds ${data.held_sd_key === null || data.held_sd_key === undefined ? '(nothing)' : data.held_sd_key}, not ${sdKey}; releasing would drop an unrelated claim.`);
        return { released: false, error: null, skipped: 'sd_mismatch', heldSdKey: data.held_sd_key ?? null };
      }
      const failureMsg = data.message || data.error || 'release_sd_by_key_reported_failure';
      log(`   ⚠ release_sd_by_key reported success:false (best-effort cleanup; claim block still enforced): ${failureMsg}`);
      return { released: false, error: failureMsg };
    }
    return { released: true, error: null };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log(`   ⚠ release_sd_by_key threw (best-effort cleanup; claim block still enforced): ${msg}`);
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
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-3, closes QF-20260905-544): the status predicate widens
 * from EXACTLY 'in_progress' to IN ('in_progress','open') — a quick_fixes row can be genuinely
 * claimed (a non-null claiming_session_id) while its status is still 'open' (never transitioned to
 * in_progress by whatever claimed it), and the prior exact-match predicate silently matched zero
 * rows for that shape, returning the same 'guard_refused' a genuine real-work refusal would. The
 * UPDATE payload {status:'open', claiming_session_id:null} is idempotent-safe for an already-open
 * row (no-op status write). Distinguishing "nothing currently matches status/claim at all"
 * (no_match_status) from "a matching row exists but a real-work guard refused it" (guard_refused)
 * needs a SECOND, narrower read after a zero-row UPDATE, since the UPDATE's own zero rows cannot say
 * which. If that second read itself fails, the function returns 'reason_lookup_failed' rather than
 * defaulting to 'guard_refused' — silently reporting a lookup failure as "the guard is working as
 * intended" is the exact misreporting QF-20260905-544 was raised to kill.
 *
 * Returns a RESULT rather than void: a void helper forces callers and tests back onto call-shape
 * assertions ("was update() called with X"), which pass over a helper that issues the right UPDATE
 * against a predicate matching zero rows. `changed` reports the EFFECT.
 *
 * TWO CALLER SHAPES, ONE FUNCTION — deliberately, because splitting them is how the revert gets
 * omitted again. A sweep clears a claim that is still HELD by a dead session and must CAS on that
 * exact holder so a live re-claim is never clobbered; a post-hoc repair operates on a row whose
 * claim is ALREADY null. Both must end with the row reopened, so both go through here:
 *   expectedHolder omitted -> match claiming_session_id IS NULL   (already-cleared row)
 *   expectedHolder given   -> match claiming_session_id = holder  (clear + reopen atomically)
 *
 * DETECTION CAPTURE (coordinator mid-EXEC amendment, 2026-07-27). Reverting a stranded row is what
 * makes it unattributable afterwards, so each reopen emits a DETECTION RECORD via `onDetect`.
 *
 * IT MUST BE APPEND-ONLY — ONE RECORD PER DETECTION — AND THE REASON IS THE ACCEPTANCE CRITERION,
 * not evidence-destruction. The criterion is "zero NEW class-A detections over N hours of
 * continuous sampling", which COUNTS. A single column holds one value: a row that strands, is
 * reverted, and strands again overwrites its own timestamp and reads as one detection or none, so
 * you cannot count detections in a window at all. (The coordinator first justified this as "the
 * revert destroys the evidence" and then falsified that himself — both clear-paths are
 * column-scoped and PostgREST patches only named columns, so a column would in fact survive. The
 * requirement stands on the counting argument; the survivability argument does not bind here.)
 *
 * Multiplicity is the only requirement, so ANY existing append-only surface suffices — no new table
 * and no migration. `onDetect` is injected rather than hard-wired so this helper stays pure and the
 * caller picks the surface.
 *
 * WHY A SINGLE-SHOT "is class A empty?" CHECK CANNOT SUBSTITUTE: the population turns over in
 * minutes — QF-20260726-908 existed as a stranded row for about TWENTY minutes — so a point query
 * finding zero cannot distinguish "the fix worked" from "we sampled an empty moment". Both a pass
 * and a fail would be uninformative.
 *
 * @param {object} supabase - injected client (never module-scope: keeps this unit-testable)
 * @param {string} qfId - quick_fixes.id
 * @param {{expectedHolder?: string|null, onDetect?: Function}} [opts] - CAS holder; detection sink
 * @returns {Promise<{changed: boolean, reason: string}>}
 */
export async function clearAndReopenQf(supabase, qfId, opts = {}) {
  if (!supabase || !qfId) return { changed: false, reason: 'missing_argument' };
  const expectedHolder = opts.expectedHolder ?? null;

  // Shared claim predicate applied to both the UPDATE and the (possible) reason-lookup READ, so
  // the two queries can never quietly diverge on what "matches" means.
  const applyClaimPredicate = (query) => (expectedHolder === null
    ? query.is('claiming_session_id', null)
    : query.eq('claiming_session_id', expectedHolder));

  let q = supabase
    .from('quick_fixes')
    .update({ status: 'open', claiming_session_id: null })
    .eq('id', qfId)
    .in('status', ['in_progress', 'open']);

  q = applyClaimPredicate(q);

  const { data, error } = await q
    .is('pr_url', null)
    .is('commit_sha', null)
    .select('id');

  // Fail-soft: a release path must not throw because the reopen half failed. The row stays
  // stranded, which is the pre-fix behaviour — strictly no worse, and reported rather than hidden.
  if (error) return { changed: false, reason: `update_failed:${error.message}` };

  const changed = Array.isArray(data) ? data.length > 0 : Boolean(data);

  if (!changed) {
    // Zero rows updated. Distinguish WHY with a second, narrower read: does a row match id +
    // status + claim at all (real-work guard refused it), or does nothing match those three
    // (no_match_status — the row is already closed/escalated, or the claim doesn't match)?
    try {
      let lookup = supabase.from('quick_fixes').eq('id', qfId).in('status', ['in_progress', 'open']);
      lookup = applyClaimPredicate(lookup);
      const { data: lookupData, error: lookupError } = await lookup.select('id');
      if (lookupError) return { changed: false, reason: 'reason_lookup_failed' };
      const matchesStatusAndClaim = Array.isArray(lookupData) ? lookupData.length > 0 : Boolean(lookupData);
      return { changed: false, reason: matchesStatusAndClaim ? 'guard_refused' : 'no_match_status' };
    } catch {
      // Never let the reason-lookup itself throw out of this best-effort helper.
      return { changed: false, reason: 'reason_lookup_failed' };
    }
  }

  if (changed && typeof opts.onDetect === 'function') {
    // The four column values AS MATCHED. They are known by construction rather than re-read: the
    // UPDATE only affected a row because every guard predicate held, so this records what was true
    // at detection without a second query that could observe a DIFFERENT instant. Re-reading after
    // the write would capture the post-revert state — the mistake this capture exists to avoid.
    try {
      await opts.onDetect({
        qf_id: qfId,
        detected_at: new Date().toISOString(),
        // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: the pre-update status is now one of TWO accepted
        // values (in_progress or open), and an UPDATE...RETURNING only carries the POST-update row
        // -- re-reading the pre-update value would need a second query racing the write, exactly
        // what "known by construction, not re-read" above exists to avoid. Recorded honestly as
        // the matched SET rather than a single (possibly wrong) literal.
        status: 'in_progress_or_open',
        claiming_session_id: expectedHolder,
        pr_url: null,
        commit_sha: null,
      });
    } catch { /* fail-soft: losing a detection record must never fail the release itself */ }
  }
  // Reaching here means changed is always true -- the !changed branch above already returned.
  return { changed: true, reason: 'reopened' };
}

export default { bestEffortReleaseSd, bestEffortReleaseSdByKey, clearAndReopenQf };
