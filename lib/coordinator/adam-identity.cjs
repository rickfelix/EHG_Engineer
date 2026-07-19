'use strict';
/**
 * adam-identity.cjs — SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1/FR-3)
 *
 * The Adam-singleton half of the role-session handoff protocol — a MIRROR of the shipped
 * coordinator election (lib/coordinator/resolve.cjs:62-164 pickCanonicalCoordinator /
 * electCoordinatorFromDb / getActiveCoordinatorId) keyed on metadata.role='adam' +
 * metadata.adam_since. Sibling A delivered the coordinator half; this composes the same
 * deterministic-election + freshness pattern for Adam (no reinvention).
 *
 * INVARIANTS:
 *  - Deterministic election: canonical Adam = adam_since DESC NULLS LAST, then session_id ASC.
 *  - FAIL-OPEN: every DB-backed resolver returns null/empty on error and NEVER throws (a resolution
 *    fault must never block the caller — mirrors the coordinator resolver's GG-5 contract).
 *  - The single-Adam GUARD's deliberate divergence from the coordinator clear-losers pattern:
 *    PREFER refuse-new-on-fresh-prior over clear-prior, so a legitimately-restarting Adam is never
 *    cleared mid-canary; only a STALE prior is retired.
 *
 * Pure functions (pickCanonicalAdam, decideSingleAdamGuard) are injectable/testable with no DB.
 * Identity WRITES (set/clear adam flag) go through the atomic set_adam_flag/clear_adam_flag RPCs
 * (FR-2 migration) — never a JS read-modify-write — and live in scripts/adam-register.cjs (FR-3);
 * this module owns the read/election/decision layer.
 */

const ADAM_ROLE = 'adam';
/** Freshness window: an Adam session whose heartbeat is within this is "live". Matches the
 *  coordinator/detector 10-min convention (detectors.cjs DEFAULT_COORDINATOR_FRESH_MS). */
const ADAM_FRESH_MS = 10 * 60 * 1000;

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: role-session reads feed the single-Adam
// guard (a retire/refuse decision) — a read silently capped at the PostgREST 1000-row max could
// hide the canonical Adam or a stale prior. Paginate to completion; every call site keeps its
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
 * PURE deterministic single-winner election over candidate Adam rows. Mirrors
 * pickCanonicalCoordinator: canonical = adam_since DESC (NULLS LAST), then session_id ASC (a stable
 * tiebreak so resolution never flaps). Returns { session_id, since } or null.
 */
function pickCanonicalAdam(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const candidates = rows
    .filter((r) => r && typeof r.session_id === 'string')
    .map((r) => ({
      session_id: r.session_id,
      since: (r.metadata && typeof r.metadata.adam_since === 'string') ? r.metadata.adam_since : null,
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

/** Fetch fresh role=adam sessions (heartbeat within freshMs). Fail-open: [] on error. async I/O. */
async function fetchFreshAdams(supabase, { nowMs = Date.now(), freshMs = ADAM_FRESH_MS } = {}) {
  if (!supabase) return [];
  try {
    const cutoff = new Date(nowMs - freshMs).toISOString();
    const data = await fapPaginate(() => supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .gte('heartbeat_at', cutoff)
      .filter('metadata->>role', 'eq', ADAM_ROLE)
      .order('session_id')); // unique-key tiebreaker for stable pagination
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fetch ALL role=adam sessions (NO freshness filter) so the single-Adam guard can classify
 *  fresh-vs-stale itself (fetchFreshAdams pre-filters to fresh, which would hide stale priors the
 *  guard must retire). Fail-open: [] on error. async I/O. */
async function fetchAllAdams(supabase) {
  if (!supabase) return [];
  try {
    const data = await fapPaginate(() => supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .filter('metadata->>role', 'eq', ADAM_ROLE)
      .order('session_id')); // unique-key tiebreaker for stable pagination
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Elect the single canonical Adam session_id from the DB, or null. Fail-open (never throws). */
async function electAdamFromDb(supabase, opts = {}) {
  try {
    const rows = await fetchFreshAdams(supabase, opts);
    if (!rows.length) return null;
    const winner = pickCanonicalAdam(rows);
    return winner ? winner.session_id : null;
  } catch {
    return null;
  }
}

/** Resolve the active Adam session_id (DB-canonical election). Fail-open null. */
async function getActiveAdamId(supabase, opts = {}) {
  return electAdamFromDb(supabase, opts);
}

/** Count fresh Adams (for the multi-Adam detector's I/O feed). Fail-open 0. */
async function countFreshAdams(supabase, opts = {}) {
  const rows = await fetchFreshAdams(supabase, opts);
  return rows.length;
}

/**
 * SD-LEO-INFRA-COORD-ADAM-COMMS-DELIVERY-INTEGRITY-001 (FR-1): resolve the reply-target Adam session
 * for a coordinator->Adam reply. CONFIRMED root cause: the reply path targeted the advisory's
 * ORIGINATING session (adv.sender_session) directly, so after a role-handoff / single-Adam guard
 * retire-then-register the reply landed in the STALE Adam's inbox. Prefer the CURRENT live Adam
 * (getActiveAdamId); fall back to the originator only when no live Adam resolves (FAIL-OPEN — a reply
 * is never blocked). Adam is a singleton role, so re-pointing to the live Adam is correct by design.
 * @returns {Promise<{target:string, live:(string|null), originator:string, retargeted:boolean}>}
 */
async function resolveAdamReplyTarget(supabase, originatorSession, opts = {}) {
  let live = null;
  try { live = await getActiveAdamId(supabase, opts); } catch { live = null; } // fail-open
  const target = live || originatorSession;
  return { target, live, originator: originatorSession, retargeted: Boolean(live && live !== originatorSession) };
}

/**
 * FR-2: recover messages already stuck at a stale originator. Re-point any UNREAD coordinator->Adam
 * rows still targeted at the stale originator to the current live Adam. Only unread rows move
 * (acknowledged ones are settled). Best-effort + REPORTED — returns the re-targeted count; an error
 * is surfaced, never silently swallowed. No-op when there is nothing to move.
 * @returns {Promise<{retargeted:number, error:(string|null)}>}
 */
async function retargetStaleAdamInbound(supabase, { staleOriginator, liveAdam }) {
  if (!staleOriginator || !liveAdam || staleOriginator === liveAdam) return { retargeted: 0, error: null };
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ target_session: liveAdam })
      .eq('target_session', staleOriginator)
      .eq('sender_type', 'coordinator')
      .is('acknowledged_at', null)
      .select('id');
    if (error) return { retargeted: 0, error: error.message };
    return { retargeted: Array.isArray(data) ? data.length : 0, error: null };
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
 * PURE single-Adam guard decision. The deliberate divergence from the coordinator clear-losers
 * pattern: PREFER refuse-new-on-fresh-prior over clear-prior — never clear a legitimately-restarting
 * Adam mid-canary; retire only STALE priors. Returns:
 *   { action: 'register' | 'refuse' | 'retire_stale_then_register', retire: string[], reason, freshPriors }
 *   - 'refuse'  : a FRESH prior Adam exists (not self) — do NOT register, do NOT clear it.
 *   - 'retire_stale_then_register' : only STALE prior(s) exist — clear them, then register self.
 *   - 'register': no other Adam — register self.
 * @param {{ priorAdams: Array<{session_id,heartbeat_at,metadata?}>, selfSessionId: string, nowMs?: number, freshMs?: number }} p
 */
function decideSingleAdamGuard({ priorAdams, selfSessionId, nowMs = Date.now(), freshMs = ADAM_FRESH_MS }) {
  const others = (Array.isArray(priorAdams) ? priorAdams : []).filter(
    (a) => a && typeof a.session_id === 'string' && a.session_id !== selfSessionId,
  );
  const fresh = others.filter((a) => isFresh(a.heartbeat_at, nowMs, freshMs));
  if (fresh.length > 0) {
    return {
      action: 'refuse',
      retire: [],
      reason: 'a fresh prior Adam exists — refusing to register a 2nd (avoid clearing a restarting Adam mid-canary)',
      freshPriors: fresh.map((a) => a.session_id),
    };
  }
  const staleRetire = others.map((a) => a.session_id); // all others are stale here
  return {
    action: staleRetire.length ? 'retire_stale_then_register' : 'register',
    retire: staleRetire,
    reason: staleRetire.length ? 'only stale prior Adam(s) — retire then register self' : 'no other Adam — register self',
    freshPriors: [],
  };
}

module.exports = {
  ADAM_ROLE,
  ADAM_FRESH_MS,
  toMs,
  isFresh,
  pickCanonicalAdam,
  fetchFreshAdams,
  fetchAllAdams,
  electAdamFromDb,
  getActiveAdamId,
  countFreshAdams,
  decideSingleAdamGuard,
  resolveAdamReplyTarget,
  retargetStaleAdamInbound,
  verifyReplyDelivered,
};
