'use strict';
/**
 * succession.cjs — SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001
 *
 * Coordinator succession machinery. Sourced from Solomon tri-role review e72dad97 C1:
 * 5 coordinators in 14 days ALL died via STALE_CLEANUP with zero graceful handoffs,
 * 16 worker signals dead-lettered to a dead coordinator, a ~43h coverage gap went
 * unmeasured, and open follow-ons died with session memory. Registration drained only
 * the 'broadcast-coordinator' sentinel; rows addressed to a predecessor's UUID were
 * stranded.
 *
 * Generalizes the PROVEN singleton-succession drain (drainAdamOutbound,
 * scripts/adam-advisory.cjs — idempotent unread re-target, 24h cutoff, fail-open)
 * for the coordinator role, plus durable tenure history and a follow-on registry.
 *
 * INVARIANTS (RISK conditions from LEAD_PRE_APPROVAL a3d61062):
 *  - Callers pass ONLY sessions the canonical-winner retire step actually retired —
 *    this module never re-derives winners (no election coupling, TR-1).
 *  - Everything here is FAIL-OPEN and flag-gated (COORD_SUCCESSION_V1, default ON,
 *    'off' kill switch): coordinator registration and the sweep must never block on
 *    succession machinery.
 *  - Tables may be ABSENT (STAGED chairman-gated migration merge-without-apply):
 *    a missing relation throws Postgres 42P01 — every table write try/catches and
 *    warns once, loudly, per process (assertSuccessionTablesExist canary).
 */

const ROLE_HISTORY_TABLE = 'coordinator_role_history';
const FOLLOW_ONS_TABLE = 'coordinator_follow_ons';
const DRAIN_WINDOW_MS = 24 * 60 * 60 * 1000; // mirrors drainAdamOutbound

/** COORD_SUCCESSION_V1: default ON; 'off' is the explicit kill switch (TR-4). */
function isSuccessionEnabled() {
  return (process.env.COORD_SUCCESSION_V1 || 'on').toLowerCase() !== 'off';
}

let _tablesAbsentWarned = false;
function warnTablesAbsentOnce(context, message) {
  if (_tablesAbsentWarned) return;
  _tablesAbsentWarned = true;
  console.warn(`   ⚠️  [COORD_SUCCESSION_TABLES_ABSENT] ${context}: ${message} — succession history/follow-ons degrade to no-ops (apply database/migrations/20260719_coordinator_succession_STAGED.sql). Drain still runs (session_coordination only).`);
}

/** 42P01 = undefined_table. A missing table THROWS (or returns error) — not a null read. */
function isMissingTable(err) {
  if (!err) return false;
  const code = err.code || '';
  if (code === '42P01' || code === 'PGRST205') return true;
  return /relation .* does not exist|Could not find the table/i.test(err.message || '');
}

/**
 * FR-1 core: re-target UNREAD session_coordination rows addressed to RETIRED
 * predecessor coordinator sessions to the successor. Mirrors drainAdamOutbound
 * exactly: read_at IS NULL gate (idempotent — consumed rows never re-move),
 * 24h cutoff, fail-open {moved, error?}. Kill switch honored here so every
 * caller inherits it.
 */
async function drainCoordinatorOutbound(supabase, { newSessionId, oldSessionIds } = {}) {
  if (!isSuccessionEnabled()) return { moved: 0, skipped: 'flag_off' };
  if (!supabase || !newSessionId || !Array.isArray(oldSessionIds)) return { moved: 0 };
  const olds = oldSessionIds.filter((s) => typeof s === 'string' && s && s !== newSessionId);
  if (!olds.length) return { moved: 0 };
  try {
    const cutoff = new Date(Date.now() - DRAIN_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ target_session: newSessionId })
      .in('target_session', olds)
      .is('read_at', null)
      .gte('created_at', cutoff)
      .select('id');
    if (error) return { moved: 0, error: error.message };
    return { moved: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return { moved: 0, error: (e && e.message) || String(e) };
  }
}

/**
 * FR-2 fallback: when the sweep retires a coordinator and NO live successor exists,
 * park the retired session's unread rows at the 'broadcast-coordinator' sentinel so
 * the next registration's existing Step-1 sentinel drain delivers them. target_session
 * rewrite only — no new comms kinds (TR-3). created_at is REFRESHED on park (documented
 * DESIGN trade: a row parked near the 24h boundary would otherwise age out of the
 * sentinel drain's own 24h window before any successor registers).
 */
async function parkAtBroadcast(supabase, { oldSessionIds } = {}) {
  if (!isSuccessionEnabled()) return { parked: 0, skipped: 'flag_off' };
  if (!supabase || !Array.isArray(oldSessionIds) || !oldSessionIds.length) return { parked: 0 };
  try {
    const cutoff = new Date(Date.now() - DRAIN_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ target_session: 'broadcast-coordinator', created_at: new Date().toISOString() })
      .in('target_session', oldSessionIds)
      .is('read_at', null)
      .gte('created_at', cutoff)
      .select('id');
    if (error) return { parked: 0, error: error.message };
    return { parked: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return { parked: 0, error: (e && e.message) || String(e) };
  }
}

/** FR-3: open a tenure row for a newly-registered coordinator. Fail-open. */
async function openTenure(supabase, { sessionId } = {}) {
  if (!isSuccessionEnabled() || !supabase || !sessionId) return { ok: false, skipped: true };
  try {
    const { error } = await supabase
      .from(ROLE_HISTORY_TABLE)
      .insert({ session_id: sessionId, started_at: new Date().toISOString() });
    if (error) {
      if (isMissingTable(error)) { warnTablesAbsentOnce('openTenure', error.message); return { ok: false, tablesAbsent: true }; }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    if (isMissingTable(e)) { warnTablesAbsentOnce('openTenure', e.message); return { ok: false, tablesAbsent: true }; }
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/**
 * FR-3: close open tenure rows for retired sessions with an end-cause.
 * endCause: 'graceful' | 'stale_cleanup' | 'takeover'. Fail-open.
 */
async function closeTenure(supabase, { sessionIds, endCause, endedBy } = {}) {
  if (!isSuccessionEnabled() || !supabase || !Array.isArray(sessionIds) || !sessionIds.length || !endCause) {
    return { closed: 0, skipped: true };
  }
  try {
    const { data, error } = await supabase
      .from(ROLE_HISTORY_TABLE)
      .update({ ended_at: new Date().toISOString(), end_cause: endCause, ended_by_session: endedBy || null })
      .in('session_id', sessionIds)
      .is('ended_at', null)
      .select('id');
    if (error) {
      if (isMissingTable(error)) { warnTablesAbsentOnce('closeTenure', error.message); return { closed: 0, tablesAbsent: true }; }
      return { closed: 0, error: error.message };
    }
    return { closed: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    if (isMissingTable(e)) { warnTablesAbsentOnce('closeTenure', e.message); return { closed: 0, tablesAbsent: true }; }
    return { closed: 0, error: (e && e.message) || String(e) };
  }
}

/**
 * FR-4: durable follow-on registry. `kind` is FREE TEXT describing the promise class
 * (e.g. 'review-clear', 'promised-verification') — it is NOT a session_coordination
 * payload.kind / comms kind and must never be routed through drain-set vocabulary
 * (scope guard: the drain-set REGISTRY SD owns comms kinds).
 */
async function registerFollowOn(supabase, { sessionId, kind, subject, body, dueHint } = {}) {
  if (!isSuccessionEnabled() || !supabase || !sessionId || !subject) return { ok: false, skipped: true };
  try {
    const { data, error } = await supabase
      .from(FOLLOW_ONS_TABLE)
      .insert({ created_by_session: sessionId, kind: kind || null, subject, body: body || null, due_hint: dueHint || null })
      .select('id')
      .single();
    if (error) {
      if (isMissingTable(error)) { warnTablesAbsentOnce('registerFollowOn', error.message); return { ok: false, tablesAbsent: true }; }
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data && data.id };
  } catch (e) {
    if (isMissingTable(e)) { warnTablesAbsentOnce('registerFollowOn', e.message); return { ok: false, tablesAbsent: true }; }
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

async function closeFollowOn(supabase, { id, sessionId, status = 'done' } = {}) {
  if (!isSuccessionEnabled() || !supabase || !id) return { ok: false, skipped: true };
  try {
    const { error } = await supabase
      .from(FOLLOW_ONS_TABLE)
      .update({ status, closed_at: new Date().toISOString(), closed_by_session: sessionId || null })
      .eq('id', id)
      .eq('status', 'open');
    if (error) {
      if (isMissingTable(error)) { warnTablesAbsentOnce('closeFollowOn', error.message); return { ok: false, tablesAbsent: true }; }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    if (isMissingTable(e)) { warnTablesAbsentOnce('closeFollowOn', e.message); return { ok: false, tablesAbsent: true }; }
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** FR-4: successor startup surfaces OPEN follow-ons — ownership passes by query, no re-targeting. */
async function listOpenFollowOns(supabase, { limit = 50 } = {}) {
  if (!isSuccessionEnabled() || !supabase) return { items: [], skipped: true };
  try {
    const { data, error } = await supabase
      .from(FOLLOW_ONS_TABLE)
      .select('id, created_by_session, kind, subject, body, due_hint, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      if (isMissingTable(error)) { warnTablesAbsentOnce('listOpenFollowOns', error.message); return { items: [], tablesAbsent: true }; }
      return { items: [], error: error.message };
    }
    return { items: data || [] };
  } catch (e) {
    if (isMissingTable(e)) { warnTablesAbsentOnce('listOpenFollowOns', e.message); return { items: [], tablesAbsent: true }; }
    return { items: [], error: (e && e.message) || String(e) };
  }
}

/**
 * Startup canary (assertCoordinatorRpcsExist style): loud when the STAGED migration
 * is merged-but-unapplied. Read-only probe; never throws (RISK condition 3).
 */
async function assertSuccessionTablesExist(supabase) {
  if (!supabase) return { ok: null, reason: 'no_supabase_client' };
  try {
    const { error } = await supabase.from(ROLE_HISTORY_TABLE).select('id').limit(1);
    if (error && isMissingTable(error)) {
      warnTablesAbsentOnce('startup-canary', error.message);
      return { ok: false, missing: [ROLE_HISTORY_TABLE, FOLLOW_ONS_TABLE] };
    }
    if (error) return { ok: null, reason: error.message };
    return { ok: true };
  } catch (e) {
    if (isMissingTable(e)) { warnTablesAbsentOnce('startup-canary', e.message); return { ok: false, missing: [ROLE_HISTORY_TABLE, FOLLOW_ONS_TABLE] }; }
    return { ok: null, reason: (e && e.message) || String(e) };
  }
}

/**
 * FR-5: GRACEFUL handoff — an outgoing coordinator (planned restart) voluntarily runs
 * the same drain+inherit before retiring, closing its own tenure with 'graceful' so
 * succession stops being an accident-only event. successorSessionId optional: with a
 * successor, drain directly to it; without, park at the sentinel for the next
 * registration. Fail-open end to end; returns a summary for the CLI to print.
 */
async function gracefulRetire(supabase, { sessionId, successorSessionId } = {}) {
  if (!isSuccessionEnabled()) return { ok: false, skipped: 'flag_off' };
  if (!supabase || !sessionId) return { ok: false, error: 'sessionId required' };
  const summary = { ok: true, sessionId, successorSessionId: successorSessionId || null };
  summary.drain = successorSessionId
    ? await drainCoordinatorOutbound(supabase, { newSessionId: successorSessionId, oldSessionIds: [sessionId] })
    : await parkAtBroadcast(supabase, { oldSessionIds: [sessionId] });
  summary.followOns = await listOpenFollowOns(supabase, {});
  summary.tenure = await closeTenure(supabase, { sessionIds: [sessionId], endCause: 'graceful', endedBy: sessionId });
  return summary;
}

module.exports = {
  isSuccessionEnabled,
  drainCoordinatorOutbound,
  parkAtBroadcast,
  openTenure,
  closeTenure,
  registerFollowOn,
  closeFollowOn,
  listOpenFollowOns,
  assertSuccessionTablesExist,
  gracefulRetire,
  ROLE_HISTORY_TABLE,
  FOLLOW_ONS_TABLE,
  // test hook: reset the once-warn latch between cases
  __resetTablesAbsentWarned: () => { _tablesAbsentWarned = false; },
};
