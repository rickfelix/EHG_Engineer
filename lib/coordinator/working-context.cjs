/**
 * working-context.cjs — SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-1)
 *
 * The chairman-directed standing-context substrate for the Adam<->coordinator interface.
 * Each operator session keeps, on claude_sessions.metadata.working_context, a LIST of its
 * concurrent workstreams (NOT a single focus — a single-focus field would hide the other live
 * threads and MISLEAD). The reader sees the full parallel picture and, most importantly, which
 * threads are waiting-on-the-other-party (the highest-value signal: e.g. Adam waiting-on-coordinator).
 *
 * CURRENCY is the core requirement: a stale working_context actively misleads (worse than none).
 * So this library (1) normalizes threads to a canonical lifecycle, (2) prunes completed/cancelled
 * threads, (3) detects staleness (updated_at drift), and (4) AUTO-DERIVES thread state from live
 * signals (SD status / advisory ack / claim state) where a thread maps to one, so the context
 * self-maintains instead of relying on manual upkeep that rots.
 *
 * PURE + injectable (no DB, no I/O, time passed in) so it is unit-testable. The atomic persistence
 * path lives in working-context-store.cjs. This module is CJS because the repo is type:module.
 *
 * Canonical shape:
 *   { mode, threads: [{ what, state, waiting_on?, since }], recently_closed: [{ at, what, state }], updated_at }
 * Canonical thread states: active | waiting | blocked | done | cancelled.
 * Backward-compatible: normalizes the live hand-maintained blob (free-form states like
 * 'waiting-on-coordinator', 'monitoring', 'done-7/7') rather than clobbering it.
 */

const CANONICAL_STATES = Object.freeze(['active', 'waiting', 'blocked', 'done', 'cancelled']);
const OPEN_STATES = Object.freeze(['active', 'waiting', 'blocked']);
const CLOSED_STATES = Object.freeze(['done', 'cancelled']);
const STALE_THRESHOLD_MS = 30 * 60_000;          // 30 min — a context older than this is treated as unreliable.
const RECENTLY_CLOSED_TTL_MS = 24 * 60 * 60_000; // 24 h — closed threads age out of recently_closed after this.

function isoNow(nowMs) {
  return new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
}

/**
 * Map a free-form state string onto the canonical lifecycle, extracting the waiting-on party.
 * Returns { state, waiting_on? }. Unknown states resolve to the honest default 'active' (keeps an
 * unrecognized thread VISIBLE — never silently coerced to done/pruned).
 */
function normalizeState(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s) return { state: 'active' };
  const m = s.match(/^(waiting|blocked)[-_\s]+on[-_\s]+(.+)$/);
  if (m) return { state: m[1], waiting_on: m[2].trim() };
  if (s === 'waiting' || s === 'awaiting' || s === 'pending') return { state: 'waiting' };
  if (s === 'blocked' || s === 'stuck') return { state: 'blocked' };
  if (s === 'monitoring' || s === 'watching' || s === 'active' || s === 'in-progress' || s === 'in_progress' || s === 'wip') return { state: 'active' };
  if (s.startsWith('done') || s === 'complete' || s === 'completed' || s === 'shipped' || s === 'merged') return { state: 'done' };
  if (s === 'cancelled' || s === 'canceled' || s === 'dropped' || s === 'abandoned') return { state: 'cancelled' };
  return { state: 'active' };
}

/** Normalize one thread to the canonical shape, or null if it has no usable `what`. Does NOT fabricate `since`. */
function normalizeThread(t) {
  if (!t || typeof t !== 'object') return null;
  const what = typeof t.what === 'string' ? t.what.trim() : (typeof t.thread === 'string' ? t.thread.trim() : '');
  if (!what) return null;
  const norm = normalizeState(t.state);
  const out = { what, state: norm.state };
  const waitingOn = norm.waiting_on || (typeof t.waiting_on === 'string' ? t.waiting_on.trim() : null);
  if (waitingOn && (out.state === 'waiting' || out.state === 'blocked')) out.waiting_on = waitingOn;
  out.since = typeof t.since === 'string' ? t.since : null;
  return out;
}

/** Normalize a whole working_context blob. Never throws; tolerates null/garbage. */
function normalizeWorkingContext(wc) {
  const base = (wc && typeof wc === 'object' && !Array.isArray(wc)) ? wc : {};
  const threads = Array.isArray(base.threads) ? base.threads.map(normalizeThread).filter(Boolean) : [];
  const recently_closed = Array.isArray(base.recently_closed)
    ? base.recently_closed.filter((r) => r && typeof r === 'object' && typeof r.what === 'string') : [];
  return {
    mode: typeof base.mode === 'string' ? base.mode : null,
    threads,
    recently_closed,
    updated_at: typeof base.updated_at === 'string' ? base.updated_at : null,
  };
}

/** A context is stale (unreliable) when updated_at is missing/garbage or older than the threshold. */
function isStale(wc, nowMs, thresholdMs = STALE_THRESHOLD_MS) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const ts = wc && typeof wc.updated_at === 'string' ? Date.parse(wc.updated_at) : NaN;
  if (!Number.isFinite(ts)) return true;
  return (now - ts) > thresholdMs;
}

/** Upsert a thread (match by `what`); bumps updated_at. Immutable — returns a new normalized context. */
function upsertThread(wc, threadInput, nowMs) {
  const now = isoNow(nowMs);
  const norm = normalizeWorkingContext(wc);
  const t = normalizeThread(threadInput);
  if (!t) return { ...norm, updated_at: norm.updated_at };
  const idx = norm.threads.findIndex((x) => x.what === t.what);
  if (idx >= 0) {
    const since = norm.threads[idx].since || t.since || now;
    norm.threads[idx] = { ...t, since };
  } else {
    norm.threads.push({ ...t, since: t.since || now });
  }
  norm.updated_at = now;
  return norm;
}

/** Transition an existing thread to a new state (upserts if absent); bumps updated_at. Immutable. */
function setThreadState(wc, what, rawState, nowMs) {
  const now = isoNow(nowMs);
  const key = String(what == null ? '' : what).trim();
  const norm = normalizeWorkingContext(wc);
  const idx = norm.threads.findIndex((x) => x.what === key);
  if (idx < 0) return upsertThread(norm, { what: key, state: rawState }, nowMs);
  const ns = normalizeState(rawState);
  const updated = { ...norm.threads[idx], state: ns.state };
  if ((ns.state === 'waiting' || ns.state === 'blocked') && ns.waiting_on) updated.waiting_on = ns.waiting_on;
  else delete updated.waiting_on;
  norm.threads[idx] = updated;
  norm.updated_at = now;
  return norm;
}

/**
 * Prune: move done|cancelled threads out of the live list into recently_closed, and age out
 * recently_closed entries older than the TTL. updated_at bumps ONLY when a real state change
 * happened (a thread was closed) — pure age-out must not lie about freshness. Immutable.
 */
function pruneThreads(wc, nowMs, opts = {}) {
  const ttl = Number.isFinite(opts.recentlyClosedTtlMs) ? opts.recentlyClosedTtlMs : RECENTLY_CLOSED_TTL_MS;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const nowIsoStr = new Date(now).toISOString();
  const norm = normalizeWorkingContext(wc);
  const open = [];
  const newlyClosed = [];
  for (const t of norm.threads) {
    if (CLOSED_STATES.includes(t.state)) newlyClosed.push({ at: nowIsoStr, what: t.what, state: t.state });
    else open.push(t);
  }
  const recently_closed = [...norm.recently_closed, ...newlyClosed].filter((r) => {
    const ts = r && r.at ? Date.parse(r.at) : NaN;
    if (!Number.isFinite(ts)) return false;
    return (now - ts) <= ttl;
  });
  return {
    ...norm,
    threads: open,
    recently_closed,
    updated_at: newlyClosed.length > 0 ? nowIsoStr : norm.updated_at,
  };
}

/**
 * Auto-derive a thread's canonical state from live signals when it maps to one; null otherwise
 * (so manual-only threads are left untouched and keep their freshness backstop).
 *   signals: { sdStatus?, advisoryAcked?, claimActive? } — any subset.
 */
function deriveThreadState(thread, signals) {
  if (!thread || !signals || typeof signals !== 'object') return null;
  if (typeof signals.sdStatus === 'string') {
    const st = signals.sdStatus.trim().toLowerCase();
    if (st === 'completed' || st === 'complete') return 'done';
    if (st === 'cancelled' || st === 'canceled' || st === 'deferred') return 'cancelled';
    if (st === 'blocked') return 'blocked';
    if (st === 'in_progress' || st === 'active' || st === 'draft' || st === 'pending_approval') return 'active';
  }
  if (signals.advisoryAcked === true) return 'active';
  if (signals.claimActive === false && (thread.state === 'active' || thread.state === 'waiting')) return 'done';
  return null;
}

/**
 * Single-source display mapping (reused by the CLI + fleet-dashboard). Pure; never throws.
 * waiting-on-<other-party> threads are highlighted (the highest-value signal) and a STALE
 * banner is shown when the context has drifted past the threshold. opts.em is an optional
 * emphasis function (e.g. a chalk colorizer) applied to highlighted lines.
 */
function formatWorkingContext(wc, opts = {}) {
  const now = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const label = opts.label || 'working context';
  const em = typeof opts.em === 'function' ? opts.em : (s) => s;
  if (!wc || typeof wc !== 'object' || Array.isArray(wc)) return `  ${label}: (none)`;
  const norm = normalizeWorkingContext(wc);
  const ts = norm.updated_at ? Date.parse(norm.updated_at) : NaN;
  const ageMin = Number.isFinite(ts) ? Math.floor((now - ts) / 60_000) : null;
  const stale = isStale(norm, now, opts.thresholdMs);
  const freshTag = stale
    ? `STALE${ageMin != null ? ` (${ageMin}m old — re-derive before trusting)` : ' (no timestamp)'}`
    : `fresh${ageMin != null ? ` (${ageMin}m)` : ''}`;
  const lines = [`  ${label} — ${norm.threads.length} open thread(s) · ${stale ? em(freshTag) : freshTag}`];
  if (!norm.threads.length) lines.push('    (no open threads)');
  for (const t of norm.threads) {
    const waitingOnOther = (t.state === 'waiting' || t.state === 'blocked') && t.waiting_on;
    const badge = waitingOnOther ? `${t.state}-on-${t.waiting_on}` : t.state;
    const mark = waitingOnOther ? '>>' : (t.state === 'blocked' ? '!!' : '·');
    const line = `    ${mark} [${badge}] ${t.what}`;
    lines.push(waitingOnOther ? em(line) : line);
  }
  if (norm.recently_closed.length) {
    const recent = norm.recently_closed.slice(-3).map((r) => r.what).join('; ');
    lines.push(`    recently closed: ${recent}`);
  }
  return lines.join('\n');
}

module.exports = {
  CANONICAL_STATES,
  OPEN_STATES,
  CLOSED_STATES,
  STALE_THRESHOLD_MS,
  RECENTLY_CLOSED_TTL_MS,
  normalizeState,
  normalizeThread,
  normalizeWorkingContext,
  isStale,
  upsertThread,
  setThreadState,
  pruneThreads,
  deriveThreadState,
  formatWorkingContext,
};
