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
 * @param {{ rpc: Function }} supabase
 * @param {string} sessionId
 * @param {string} [reason]
 * @param {(msg: string) => void} [log]
 * @returns {Promise<{ released: boolean, error: (string|null) }>}  NEVER throws.
 */
export async function bestEffortReleaseSd(supabase, sessionId, reason = 'manual', log = console.error) {
  try {
    if (!supabase || typeof supabase.rpc !== 'function') {
      return { released: false, error: 'no_supabase' };
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
