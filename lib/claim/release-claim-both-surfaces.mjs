// Unified dual-surface claim release — SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001
// (escalated from QF-20260712-817).
//
// THE BUG THIS CLOSES
// A claim lives on TWO surfaces that must be released together:
//   • SD-side      strategic_directives_v2: claiming_session_id + active_session_id + is_working_on
//   • session-side claude_sessions:         sd_key + worktree_path + worktree_branch
// Several JS release paths historically cleared only ONE surface via a bare
// `.update()`, leaving the other stuck. Witnessed 2026-07-12: a dead seat kept
// claude_sessions.sd_key set after an SD-side "verified release", so the belt saw
// the SD as CLAIMED and neither takeover nor belt-fallback could fire for ~45 min.
//
// The Postgres RPCs (release_sd / release_session / cleanup_stale_sessions /
// switch_sd_claim / claim_sd) ALREADY co-clear both surfaces atomically since
// migration 20260506000000_claim_dual_column_atomicity.sql. This helper is the JS
// counterpart: it routes every remaining JS release path through ONE dual-surface
// clear so a single-surface release can never be written again.
//
// INVARIANTS (see the SD's PRD / risk + testing evidence c228dc44 / f492c95e):
//   R1 — holder-pinned CAS on BOTH surfaces. Every UPDATE is guarded by the holder
//        (SD-side WHERE claiming_session_id = holder; session-side WHERE
//        session_id = holder AND sd_key = sdKey). A 0-row no-op — never an
//        overwrite — so a peer that legitimately re-claimed is never clobbered.
//   R3 — the session-side clear nulls sd_key + worktree_path + worktree_branch
//        TOGETHER (the ck_claude_sessions_worktree_state_consistency CHECK rejects a
//        partial clear, SQLSTATE 23514). We surface any DB error in the result — we
//        NEVER silently swallow it (a swallowed 23514 would re-persist the desync).
//   R4 — session-alive paths (releaseClaimOnPROpen) are NOT routed here; the helper
//        always fully releases the session, which would evict a still-working worker.
//   R6 — readback asserts OLD-HOLDER-GONE (the holder no longer appears on either
//        surface), NOT `=== null`, so a legitimate peer re-claim between clear and
//        readback does not false-fail the release.
//
// Preferred mechanism: when the holder session_id is known and `tryRpc` is on, call
// the already-correct release_session RPC (a single atomic transaction). The direct
// dual-CAS clear (mirroring worker-checkin.cjs selfHealStaleClaim) is the fallback
// for callers whose primary RPC already failed, or when only sdKey is known.

/**
 * @typedef {Object} ReleaseResult
 * @property {boolean} ok              true when both surfaces are confirmed released for the old holder
 * @property {'rpc'|'direct'|'noop'} method  which mechanism ran
 * @property {string|null} holder      the holder session_id that was released (resolved if not supplied)
 * @property {boolean} clearedSd       an SD-side clear was attempted and did not error
 * @property {boolean} clearedSession  a session-side clear was attempted and did not error
 * @property {boolean} oldHolderGone   readback confirms the old holder is off both surfaces
 * @property {string|null} error       first DB error message (e.g. 23514), or null
 */

/**
 * Release a claim across BOTH surfaces for a single holder.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Object} opts
 * @param {string}  opts.sdKey            the claimed SD key (strategic_directives_v2.sd_key). Required.
 * @param {string} [opts.holderSessionId] the session that holds the claim. Resolved from
 *                                          strategic_directives_v2.claiming_session_id when omitted.
 * @param {string} [opts.reason='release'] released_reason stamped on the session row / RPC.
 * @param {'released'|'idle'} [opts.sessionStatus='released'] status stamped on the released session.
 *                                          'released' fully RETIRES a dead/stale/superseded holder;
 *                                          'idle' UNCLAIMS a session that stays alive (manual release).
 * @param {boolean}[opts.tryRpc=false]    prefer the atomic release_session RPC. Only honoured for
 *                                          sessionStatus='released' (the RPC always retires the session,
 *                                          so it must never run for a keep-alive 'idle' unclaim). Opt-in.
 * @param {boolean}[opts.readback=true]   run the OLD-HOLDER-GONE readback (adds one SELECT).
 * @returns {Promise<ReleaseResult>}
 */
export async function releaseClaimBothSurfaces(sb, opts = {}) {
  const { sdKey, reason = 'release', sessionStatus = 'released', tryRpc = false, readback = true } = opts;
  let holder = opts.holderSessionId || null;

  const result = {
    ok: false, method: 'noop', holder, clearedSd: false,
    clearedSession: false, oldHolderGone: false, error: null,
  };

  if (!sdKey) {
    result.error = 'releaseClaimBothSurfaces: sdKey is required';
    return result;
  }

  // Resolve the holder from the SD-side surface when the caller did not supply one.
  if (!holder) {
    const { data: sd, error: readErr } = await sb
      .from('strategic_directives_v2')
      .select('claiming_session_id')
      .eq('sd_key', sdKey)
      .maybeSingle();
    if (readErr) { result.error = readErr.message; return result; }
    holder = sd?.claiming_session_id || null;
    result.holder = holder;
  }

  // Nothing on the SD-side to release and no explicit holder → already free.
  if (!holder) {
    result.method = 'noop';
    result.ok = true;
    result.oldHolderGone = true;
    return result;
  }

  // ── Optional: atomic co-clear via the release_session RPC (retire only) ───────
  // release_session ALWAYS retires the session (status='released'), so it is only
  // valid for sessionStatus='released'. It clears whatever the session currently
  // holds; guard it with a pre-read so we never release a holder that has since
  // moved to a DIFFERENT SD.
  if (tryRpc && sessionStatus === 'released') {
    const { data: sess, error: sessReadErr } = await sb
      .from('claude_sessions')
      .select('sd_key')
      .eq('session_id', holder)
      .maybeSingle();
    // Only RPC-release when the holder is still parked on THIS sdKey (CAS-equivalent).
    if (!sessReadErr && sess && sess.sd_key === sdKey) {
      const { data: rpcRes, error: rpcErr } = await sb.rpc('release_session', {
        p_session_id: holder,
        p_reason: reason,
      });
      if (!rpcErr && !(rpcRes && rpcRes.success === false)) {
        result.method = 'rpc';
        result.clearedSd = true;
        result.clearedSession = true;
        return readback ? await verifyOldHolderGone(sb, sdKey, holder, result) : ok(result);
      }
      // RPC failed → fall through to the direct dual-CAS clear.
      result.error = rpcErr ? rpcErr.message : (rpcRes && rpcRes.error) || null;
    }
  }

  // ── Fallback: direct dual-CAS clear (session-side FIRST) ──────────────────────
  // Session-side first: the belt-visible sd_key is the surface whose staleness
  // stalled the fleet; clearing it first shrinks the desync window on a crash
  // between the two writes (any residue is reaped by the dual-surface sweep).
  result.method = 'direct';

  const { error: sessErr } = await sb
    .from('claude_sessions')
    .update({
      sd_key: null,
      worktree_path: null,     // R3: null all three worktree columns together …
      worktree_branch: null,   // … or the ck_worktree_state_consistency CHECK raises 23514.
      status: sessionStatus,   // 'released' (retire) or 'idle' (keep-alive unclaim)
      released_at: new Date().toISOString(),
      released_reason: reason,
    })
    .eq('session_id', holder)  // R1: holder-pinned CAS …
    .eq('sd_key', sdKey);      // … only while this session still points at this SD.
  if (sessErr) { result.error = result.error || sessErr.message; }
  else { result.clearedSession = true; }

  const { error: sdErr } = await sb
    .from('strategic_directives_v2')
    .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
    .eq('sd_key', sdKey)
    .eq('claiming_session_id', holder); // R1: only while the SD is still this holder's.
  if (sdErr) { result.error = result.error || sdErr.message; }
  else { result.clearedSd = true; }

  // R3: never swallow — a DB error is returned so the caller can log/fail-loud.
  if (result.error) return result;

  return readback ? await verifyOldHolderGone(sb, sdKey, holder, result) : ok(result);
}

// R6: OLD-HOLDER-GONE readback. Asserts the old holder is off BOTH surfaces rather
// than asserting `=== null`, so a legitimate peer re-claim does not false-fail.
async function verifyOldHolderGone(sb, sdKey, holder, result) {
  try {
    const { data: sd } = await sb
      .from('strategic_directives_v2')
      .select('claiming_session_id')
      .eq('sd_key', sdKey)
      .maybeSingle();
    const { data: sess } = await sb
      .from('claude_sessions')
      .select('session_id')
      .eq('session_id', holder)
      .eq('sd_key', sdKey)
      .maybeSingle();
    const sdGone = !sd || sd.claiming_session_id !== holder;
    const sessGone = !sess; // no row where this holder still points at sdKey
    result.oldHolderGone = sdGone && sessGone;
    result.ok = result.oldHolderGone;
  } catch (e) {
    result.error = result.error || (e && e.message) || 'readback failed';
    result.ok = false;
  }
  return result;
}

function ok(result) {
  result.ok = true;
  result.oldHolderGone = true; // readback skipped by caller opt-out
  return result;
}

export default { releaseClaimBothSurfaces };
