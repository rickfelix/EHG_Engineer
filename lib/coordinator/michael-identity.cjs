'use strict';
/**
 * michael-identity.cjs — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (Michael foundation, FR-2) —
 * faithful copy-rename of solomon-identity.cjs (SD-LEO-INFRA-SOLOMON-CONSULT-001A), itself a copy-rename
 * of adam-identity.cjs. Only the role string, the metadata key (michael_since) and the freshness
 * constant name differ; the election, guard and fail-open contracts are the shipped ones.
 *
 * The Michael-singleton half of the role-session handoff protocol — a MIRROR of the shipped
 * coordinator election (lib/coordinator/resolve.cjs:62-164 pickCanonicalCoordinator /
 * electCoordinatorFromDb / getActiveCoordinatorId) keyed on metadata.role='michael' +
 * metadata.michael_since. Sibling A delivered the coordinator half; this composes the same
 * deterministic-election + freshness pattern for Michael (no reinvention).
 *
 * INVARIANTS:
 *  - Deterministic election: canonical Michael = michael_since DESC NULLS LAST, then session_id ASC.
 *  - FAIL-OPEN: every DB-backed resolver returns null/empty on error and NEVER throws (a resolution
 *    fault must never block the caller — mirrors the coordinator resolver's GG-5 contract).
 *  - The single-Michael GUARD's deliberate divergence from the coordinator clear-losers pattern:
 *    PREFER refuse-new-on-fresh-prior over clear-prior, so a legitimately-restarting Michael is never
 *    cleared mid-canary; only a STALE prior is retired.
 *
 * Pure functions (pickCanonicalMichael, decideSingleMichaelGuard) are injectable/testable with no DB.
 * Identity WRITES (set/clear michael flag) go through the atomic set_michael_flag/clear_michael_flag RPCs
 * (Phase A migration) — never a JS read-modify-write — and live in scripts/michael-register.cjs (Phase A);
 * this module owns the read/election/decision layer.
 */

// QF-20260727-862: shared nil-UUID guard — the Michael election must not be winnable by the same
// unbacked ghost row that deposed the coordinator.
const { isUsableSessionId } = require('./session-id-guard.cjs');
// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (FR-2, TR-1): required by module PATH, never a re-exported
// bare symbol -- scripts/reconcile-seats.cjs:62 exports a DIFFERENT, incompatible classifySeat.
const { classifySeat, VERDICT } = require('../fleet/stuck-seat-predicate.cjs');

const MICHAEL_ROLE = 'michael';
/** Freshness window: a Michael session whose heartbeat is within this is "live". Matches the
 *  coordinator/detector 10-min convention (detectors.cjs DEFAULT_COORDINATOR_FRESH_MS). */
const MICHAEL_FRESH_MS = 10 * 60 * 1000;
// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (F-2): mirrors lib/fleet/genuine-worker.mjs's
// FREEZE_CUT_MINUTES_FLOOR -- see isFreshAndActive below.
const MICHAEL_TOOL_SILENCE_CUT_FLOOR_MINUTES = 15;

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: role-session reads feed the single-Michael
// guard (a retire/refuse decision) — a read silently capped at the PostgREST 1000-row max could
// hide the canonical Michael or a stale prior. Paginate to completion; every call site keeps its
// pre-existing fail-open [] policy (fetchAllPaginated throws → caught by the site's try/catch).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

/** Parse a timestamp to ms, treating naive (no-TZ) strings as UTC (PostgREST returns naive). 0 if unusable. */
function toMs(ts) {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(String(ts));
  const n = new Date(hasTZ ? ts : ts + 'Z').getTime();
  return Number.isFinite(n) ? n : 0;
}

function isFresh(heartbeatAt, nowMs, freshMs) {
  const hb = toMs(heartbeatAt);
  if (!hb) return false;
  return (nowMs - hb) <= freshMs;
}

/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (FR-2, corrected post-TESTING-review, evidence
 * 2c7bc81b-6cc0-4fb1-a39d-3f1e11183600): compose (never replace, per F-4) the existing heartbeat
 * freshness check with a FAIL-CLOSED tool-activity check via classifySeat, called DIRECTLY --
 * NEVER lib/fleet/genuine-worker.mjs's isKnownWedged, which is fail-open by design and would fold
 * an UNKNOWN/STUCK verdict to "not wedged" -> "fresh" here, exactly backwards for a singleton
 * election guard. (FR-3's register-script re-validation sites were ALSO evaluated for
 * isKnownWedged and measured wrong there too -- see scripts/michael-register.cjs; FR-3 shipped
 * with no functional change instead.)
 * isFresh() above is left UNCHANGED (heartbeat-only) so FR-6's closure test can assert both arms
 * against the same specimen.
 * @param {{heartbeat_at, last_tool_at?, loop_state?, session_id?}} candidate a claude_sessions row
 * @param {number} nowMs
 * @param {number} freshMs
 * @returns {boolean}
 */
function isFreshAndActive(candidate, nowMs, freshMs) {
  if (!isFresh(candidate && candidate.heartbeat_at, nowMs, freshMs)) return false;
  // TR-2, F-2 (RE-corrected post-EXEC-TESTING-review, evidence
  // 50b3e3c0-0f5f-460d-a3ea-f6472eb0976f): a naive freshMs/60000 (10 min for Adam/Michael) was
  // measured to false-positive STUCK on a genuinely live production Adam seat (11-minute gap
  // between tool calls). lib/fleet/genuine-worker.mjs's own FREEZE_CUT_MINUTES_FLOOR=15 was
  // calibrated specifically against this failure mode; clamp to at least that floor rather than
  // trusting an uncalibrated per-site conversion of a heartbeat window into a tool-silence cut.
  const cutPointMinutes = Math.max(freshMs / 60000, MICHAEL_TOOL_SILENCE_CUT_FLOOR_MINUTES);
  try {
    const verdict = classifySeat(candidate, { cutPointMinutes, now: nowMs }).verdict;
    // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (F-11, RE-corrected post-EXEC-REGRESSION-review,
    // evidence d900a26a-8d14-48c4-ae35-def914e341e7): see the identical, longer rationale in
    // lib/coordinator/adam-identity.cjs's isFreshAndActive -- AC-3's original "UNKNOWN folds to
    // NOT-fresh" broke a pre-existing, unmodified test (scripts/michael-register.test.js's "a
    // FRESH prior Michael => REFUSED") because a freshly-registered Michael legitimately has no
    // last_tool_at yet. Unified with checkNewSessionHealth: only a POSITIVELY CONFIRMED STUCK
    // verdict fails; UNKNOWN passes exactly like HEALTHY.
    return verdict !== VERDICT.STUCK;
  } catch (e) {
    // TS-9: a broken import or a classifySeat exception must never be silently indistinguishable
    // from a correct STUCK verdict -- surface it loudly, then fall back to the already-confirmed
    // heartbeat-fresh result (fail-safe, matching pre-SD risk level).
    console.error(
      `[michael-identity] FR-2 tool-activity check failed for ${candidate && candidate.session_id}: ` +
      `${e && e.message ? e.message : e}`,
    );
    return true;
  }
}

/**
 * PURE deterministic single-winner election over candidate Michael rows. Mirrors
 * pickCanonicalCoordinator: canonical = michael_since DESC (NULLS LAST), then session_id ASC (a stable
 * tiebreak so resolution never flaps). Returns { session_id, since } or null.
 */
function pickCanonicalMichael(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const candidates = rows
    // QF-20260727-862: skip the nil UUID — that ghost row carried set_michael_flag too, and
    // '00000000-…' sorts FIRST in the session_id ASC tiebreak below, so it wins on any tie.
    .filter((r) => r && typeof r.session_id === 'string' && isUsableSessionId(r.session_id))
    .map((r) => ({
      session_id: r.session_id,
      since: (r.metadata && typeof r.metadata.michael_since === 'string') ? r.metadata.michael_since : null,
    }));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.since !== null || b.since !== null) {
      if (a.since === null) return 1;
      if (b.since === null) return -1;
      if (a.since !== b.since) return a.since > b.since ? -1 : 1;
    }
    if (a.session_id < b.session_id) return -1;
    if (a.session_id > b.session_id) return 1;
    return 0;
  });
  return candidates[0];
}

/** Fetch fresh role=michael sessions (heartbeat within freshMs). Fail-open: [] on error. async I/O. */
async function fetchFreshMichaels(supabase, { nowMs = Date.now(), freshMs = MICHAEL_FRESH_MS } = {}) {
  if (!supabase) return [];
  try {
    const cutoff = new Date(nowMs - freshMs).toISOString();
    const data = await fapPaginate(() => supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .gte('heartbeat_at', cutoff)
      .filter('metadata->>role', 'eq', MICHAEL_ROLE)
      .order('session_id')); // unique-key tiebreaker for stable pagination
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** STRICT variant of fetchAllMichaels for the single-Michael REGISTRATION guard
 *  (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 review): a FAILED read must surface as
 *  failure — NEVER as "no priors" — because the refuse-new-on-fresh-prior decision depends on
 *  it (a fail-open [] would let a 2nd Michael register past a fresh prior on a transient DB
 *  fault, the dangerous direction). Returns { rows } on success or { error } on failure;
 *  never throws. */
async function fetchAllMichaelsStrict(supabase) {
  if (!supabase) return { error: 'no supabase client' };
  try {
    // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (FR-1): +last_tool_at so isFreshAndActive's classifySeat
    // call sees real data instead of classifying every row UNKNOWN (a provable no-op measured by
    // VALIDATION evidence 7404c146-daad-47c2-8ddd-6994f6ca1bb9). loop_state is NOT selected here:
    // classifySeat only reads last_tool_at; loop_state is only needed by isKnownWedged, which this
    // site deliberately does not use (see isFreshAndActive's doc comment above).
    const data = await fapPaginate(() => supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata, last_tool_at')
      .filter('metadata->>role', 'eq', MICHAEL_ROLE)
      .order('session_id')); // unique-key tiebreaker for stable pagination
    return { rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
}

/** Fetch ALL role=michael sessions (NO freshness filter) so the single-Michael guard can classify
 *  fresh-vs-stale itself (fetchFreshMichaels pre-filters to fresh, which would hide stale priors the
 *  guard must retire). Fail-open: [] on error (read-only gauge/reconcile consumers) — REGISTRATION
 *  must use fetchAllMichaelsStrict instead. async I/O. */
async function fetchAllMichaels(supabase) {
  const r = await fetchAllMichaelsStrict(supabase);
  return r.rows || [];
}

/** Elect the single canonical Michael session_id from the DB, or null. Fail-open (never throws). */
async function electMichaelFromDb(supabase, opts = {}) {
  try {
    const rows = await fetchFreshMichaels(supabase, opts);
    if (!rows.length) return null;
    const winner = pickCanonicalMichael(rows);
    return winner ? winner.session_id : null;
  } catch {
    return null;
  }
}

/** Resolve the active Michael session_id (DB-canonical election). Fail-open null. */
async function getActiveMichaelId(supabase, opts = {}) {
  return electMichaelFromDb(supabase, opts);
}

/** Count fresh Michaels (for the multi-Michael detector's I/O feed). Fail-open 0. */
async function countFreshMichaels(supabase, opts = {}) {
  const rows = await fetchFreshMichaels(supabase, opts);
  return rows.length;
}

/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-001A (Michael foundation) — faithful copy-rename of adam-identity.cjs (FR-1): resolve the reply-target Michael session
 * for a coordinator->Michael reply. CONFIRMED root cause: the reply path targeted the advisory's
 * ORIGINATING session (adv.sender_session) directly, so after a role-handoff / single-Michael guard
 * retire-then-register the reply landed in the STALE Michael's inbox. Prefer the CURRENT live Michael
 * (getActiveMichaelId); fall back to the originator only when no live Michael resolves (FAIL-OPEN — a reply
 * is never blocked). Michael is a singleton role, so re-pointing to the live Michael is correct by design.
 * @returns {Promise<{target:string, live:(string|null), originator:string, retargeted:boolean}>}
 */
async function resolveMichaelReplyTarget(supabase, originatorSession, opts = {}) {
  let live = null;
  try { live = await getActiveMichaelId(supabase, opts); } catch { live = null; } // fail-open
  const target = live || originatorSession;
  return { target, live, originator: originatorSession, retargeted: Boolean(live && live !== originatorSession) };
}

/**
 * FR-2: recover messages already stuck at a stale originator. Re-point any UNREAD coordinator->Michael
 * rows still targeted at the stale originator to the current live Michael. Only unread rows move
 * (acknowledged ones are settled). Best-effort + REPORTED — returns the re-targeted count; an error
 * is surfaced, never silently swallowed. No-op when there is nothing to move.
 * @returns {Promise<{retargeted:number, error:(string|null)}>}
 */
async function retargetStaleMichaelInbound(supabase, { staleOriginator, liveMichael }) {
  if (!staleOriginator || !liveMichael || staleOriginator === liveMichael) return { retargeted: 0, error: null };
  try {
    const { data, count, error } = await supabase
      .from('session_coordination')
      .update({ target_session: liveMichael })
      .eq('target_session', staleOriginator)
      .eq('sender_type', 'coordinator')
      .is('acknowledged_at', null)
      // count-truncation-diff-lint (QF-20260728-427): the moved-row count is what this returns, so
      // ask PostgREST for the exact count rather than measuring a possibly-capped returned array.
      // (The Solomon copy source reads data.length; that site predates the blocking lint.)
      .select('id', { count: 'exact' });
    if (error) return { retargeted: 0, error: error.message };
    const moved = typeof count === 'number' ? count : (Array.isArray(data) ? data.length : 0);
    return { retargeted: moved, error: null };
  } catch (e) {
    return { retargeted: 0, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * FR-3: verify a sent reply actually landed (send != delivered). Read the row back by id. Returns
 * true only when the row is confirmable; FAIL-LOUD callers treat false as a delivery error.
 * @returns {Promise<boolean>}
 */
async function verifyReplyDelivered(supabase, rowId) {
  if (!rowId) return false;
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('id', rowId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data && data.id);
  } catch { return false; }
}

/**
 * PURE single-Michael guard decision. The deliberate divergence from the coordinator clear-losers
 * pattern: PREFER refuse-new-on-fresh-prior over clear-prior — never clear a legitimately-restarting
 * Michael mid-canary; retire only STALE priors. Returns:
 *   { action: 'register' | 'refuse' | 'retire_stale_then_register', retire: string[],
 *     retireHeartbeatStale: string[], retireToolStuck: string[], reason, freshPriors }
 *   - 'refuse'  : a FRESH prior Michael exists (not self) — do NOT register, do NOT clear it.
 *   - 'retire_stale_then_register' : only STALE prior(s) exist — clear them, then register self.
 *     `retire` is the full set; `retireHeartbeatStale` / `retireToolStuck` split it by WHY each
 *     landed in "stale" (F-7), mirroring the longer rationale in adam-identity.cjs's
 *     decideSingleAdamGuard.
 *   - 'register': no other Michael — register self.
 * @param {{ priorMichaels: Array<{session_id,heartbeat_at,metadata?}>, selfSessionId: string, nowMs?: number, freshMs?: number }} p
 */
function decideSingleMichaelGuard({ priorMichaels, selfSessionId, nowMs = Date.now(), freshMs = MICHAEL_FRESH_MS, isProcessDead = () => false }) {
  const others = (Array.isArray(priorMichaels) ? priorMichaels : []).filter(
    (a) => a && typeof a.session_id === 'string' && a.session_id !== selfSessionId,
  );
  // QF-20260905-201: a prior whose Claude Code process is PROVABLY gone on this host is dead no
  // matter how fresh its heartbeat reads. Measured 2026-09-05 08:29Z: the chairman closed Adam seat
  // 1b847de2 and opened its successor 27 s later; heartbeat_at was 2 min old, so the successor was
  // REFUSED for the full 10-min window while pid 57172 no longer existed. Injected (default: never
  // dead) so this stays pure; scripts/michael-register.cjs supplies lib/coordinator/role-seat-liveness.cjs
  // isSeatProcessDead, sound in the DEAD direction only (ESRCH) -- a live or recycled pid falls
  // through to the heartbeat classification below unchanged, so this can never kill a live Michael.
  const deadProcess = others.filter((a) => { try { return isProcessDead(a) === true; } catch { return false; } });
  const fresh = others.filter((a) => !deadProcess.includes(a) && isFreshAndActive(a, nowMs, freshMs));
  if (fresh.length > 0) {
    return {
      action: 'refuse',
      retire: [],
      retireHeartbeatStale: [],
      retireToolStuck: [],
      retireDeadProcess: [],
      reason: 'a fresh prior Michael exists — refusing to register a 2nd (avoid clearing a restarting Michael mid-canary)',
      freshPriors: fresh.map((a) => a.session_id),
    };
  }
  const staleOthers = others.filter((a) => !fresh.includes(a));
  // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (F-7, evidence d9d88102-2dfe-49bb-b319-887db2b361bd):
  // see the identical, longer rationale in lib/coordinator/adam-identity.cjs's decideSingleAdamGuard
  // -- a still-fresh-heartbeat, confirmed-STUCK prior can never "race back to fresh" by heartbeat,
  // so it must be re-validated on tool activity, not heartbeat, or it stays role-tagged forever.
  // QF-20260905-201: third bucket, re-validated on the PROCESS by the register script (see adam-identity.cjs).
  const retireDeadProcess = deadProcess.map((a) => a.session_id);
  const retireHeartbeatStale = staleOthers.filter((a) => !deadProcess.includes(a) && !isFresh(a.heartbeat_at, nowMs, freshMs)).map((a) => a.session_id);
  const retireToolStuck = staleOthers.filter((a) => !deadProcess.includes(a) && isFresh(a.heartbeat_at, nowMs, freshMs)).map((a) => a.session_id);
  const staleRetire = staleOthers.map((a) => a.session_id); // union, preserved for backward compatibility
  return {
    action: staleRetire.length ? 'retire_stale_then_register' : 'register',
    retire: staleRetire,
    retireHeartbeatStale,
    retireToolStuck,
    retireDeadProcess,
    reason: staleRetire.length ? 'only stale prior Michael(s) — retire then register self' : 'no other Michael — register self',
    freshPriors: [],
  };
}

module.exports = {
  MICHAEL_ROLE,
  MICHAEL_FRESH_MS,
  toMs,
  isFresh,
  isFreshAndActive,
  pickCanonicalMichael,
  fetchFreshMichaels,
  fetchAllMichaels,
  fetchAllMichaelsStrict,
  electMichaelFromDb,
  getActiveMichaelId,
  countFreshMichaels,
  decideSingleMichaelGuard,
  resolveMichaelReplyTarget,
  retargetStaleMichaelInbound,
  verifyReplyDelivered,
};
