#!/usr/bin/env node
/**
 * Fleet roll-call — QF-20260703-958.
 *
 * One command to answer, after a crash/restart: did every role singleton
 * (coordinator/adam/solomon/reasoners) come back, and is each session ACTUALLY
 * alive (not just recently-updated)?
 *
 * Specimen 1 (no roll-call): after the 2026-07-03 Cursor crash the chairman
 * hand-relaunched terminals with no way to verify every role-session returned.
 * Specimen 2 (liveness false-negative): Adam probed the coordinator via a stale
 * claude_sessions.updated_at + a 90s reply-timeout and concluded DOWN while it
 * was provably ONLINE (it sent a session_coordination message minutes earlier
 * from the same session_id). Reuses the existing multi-signal isSessionAlive
 * SSOT (lib/fleet/session-liveness.cjs) instead of a duplicate/divergent check,
 * plus adds the one signal that SSOT doesn't cover: recent outbound
 * session_coordination activity — the exact proof-of-life Specimen 2 missed.
 *
 * Usage: node scripts/fleet-rollcall.cjs
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { isSessionAlive } = require('../lib/fleet/session-liveness.cjs');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { getMarkerSessionIds } = require('../lib/fleet/cc-pid-liveness.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — claude_sessions (72h window) and
// session_coordination (per-sender history) are both growing tables; a busy 72h fleet window or a
// prolific sender (coordinator/adam) can plausibly exceed the PostgREST 1000-row cap. Paginate both.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const RECENT_SEND_MS = 5 * 60 * 1000; // an outbound message this fresh proves liveness
const STALE_WINDOW_MS = 30 * 60 * 1000; // updated recently but no live signal -> STALE, not DEAD

const ROLE_SINGLETONS = [
  { key: 'coordinator', strict: true, match: (s, coordId) => s.metadata?.is_coordinator === true || s.session_id === coordId },
  { key: 'adam', strict: true, match: (s) => s.metadata?.role === 'adam' },
  { key: 'solomon', strict: true, match: (s) => s.metadata?.role === 'solomon' },
  // role is 'sprint-reasoner-A' / '-B' etc — non_fleet alone is too broad (adam/solomon also carry it).
  { key: 'reasoner', strict: false, match: (s) => typeof s.metadata?.role === 'string' && s.metadata.role.startsWith('sprint-reasoner') },
];

function fmtAge(ts, nowMs) {
  const ms = ts ? nowMs - Date.parse(ts) : NaN;
  if (!Number.isFinite(ms)) return 'never';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

/**
 * Multi-signal verdict for one session: ALIVE (via the shared isSessionAlive SSOT, or a
 * recent outbound session_coordination send — the Specimen-2 signal that SSOT doesn't cover),
 * STALE (updated recently but no live signal fired), or DEAD.
 * Pure — takes the already-fetched isSessionAlive result + lastSentAt so it's unit-testable
 * without a live DB/heartbeat clock.
 */
function computeVerdict(session, { nowMs, lastSentAt, liveResult }) {
  const live = liveResult || isSessionAlive(session, { nowMs });
  if (live.alive) return { v: 'ALIVE', reason: live.reason };
  if (lastSentAt && nowMs - Date.parse(lastSentAt) < RECENT_SEND_MS) return { v: 'ALIVE', reason: 'recent_coordination_send' };
  const lastSeenMs = nowMs - Date.parse(session.updated_at || session.heartbeat_at || 0);
  if (Number.isFinite(lastSeenMs) && lastSeenMs < STALE_WINDOW_MS) return { v: 'STALE', reason: 'no_live_signal' };
  return { v: 'DEAD', reason: null };
}

const LOOKBACK_MS = 72 * 60 * 60 * 1000; // roll-call is about "who's here now" — bound out ancient history

async function main() {
  const supabase = createSupabaseServiceClient();
  const nowMs = Date.now();
  const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
  const cutoff = new Date(nowMs - LOOKBACK_MS).toISOString();

  // OR across BOTH timestamp columns: Specimen 2 is exactly a session whose updated_at
  // was stale despite being alive — bounding on updated_at alone would repeat that bug.
  const sessions = await fapPaginate(() => supabase
    .from('claude_sessions')
    .select('session_id, sd_key, updated_at, heartbeat_at, is_alive, terminal_id, process_alive_at, expected_silence_until, metadata')
    .neq('status', 'terminated')
    .or(`updated_at.gte.${cutoff},heartbeat_at.gte.${cutoff}`)
    .order('session_id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  // (fail-closed: pagination errors propagate to main()'s own top-level .catch, mirroring the
  // prior `if (error) { ...; process.exit(1); }` fail-closed policy.)

  const ids = sessions.map(s => s.session_id);
  let msgs = [];
  let msgsError = null;
  try {
    msgs = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('sender_session, created_at')
      .in('sender_session', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (e) {
    msgsError = e;
  }
  // Fail-open (don't abort the whole roll-call over the coordination-signal query alone) but
  // VISIBLE: silently swallowing this would degrade every verdict back to updated_at/heartbeat_at
  // only — reintroducing the exact Specimen-2 blind spot this signal exists to close.
  if (msgsError) console.error(`WARNING: session_coordination lookup failed (${msgsError.message}) — recent-send liveness signal is unavailable this run`);
  const lastSent = new Map();
  for (const m of msgs || []) if (!lastSent.has(m.sender_session)) lastSent.set(m.sender_session, m.created_at);

  function verdict(s) {
    return computeVerdict(s, { nowMs, lastSentAt: lastSent.get(s.session_id) });
  }

  console.log(`\nFLEET ROLL-CALL — ${new Date(nowMs).toISOString()} (considering activity since ${cutoff})\n`);
  console.log('ROLE SINGLETONS');
  const roleSessionIds = new Set();
  for (const role of ROLE_SINGLETONS) {
    const matches = (sessions || []).filter(s => role.match(s, coordinatorId));
    matches.forEach(s => roleSessionIds.add(s.session_id));
    if (matches.length === 0) {
      console.log(`  ${role.key.padEnd(12)} ${role.strict ? 'MISSING' : 'none active'}`);
      continue;
    }
    for (const s of matches) {
      const { v, reason } = verdict(s);
      console.log(`  ${role.key.padEnd(12)} ${v.padEnd(6)} ${s.session_id.slice(0, 8)}  last_seen=${fmtAge(s.updated_at || s.heartbeat_at, nowMs)}  reason=${reason || '-'}`);
    }
    if (role.strict && matches.length > 1) console.log(`  ⚠ ${matches.length} sessions claim '${role.key}' — expected exactly 1`);
  }

  const { isDispatchableFleetMember } = await import('../lib/fleet/session-predicates.mjs');
  const workers = (sessions || []).filter(s => !roleSessionIds.has(s.session_id) && isDispatchableFleetMember(s, coordinatorId));
  const tally = { ALIVE: 0, STALE: 0, DEAD: 0 };
  console.log(`\nWORKERS (${workers.length} registered)`);
  for (const s of workers) {
    const { v, reason } = verdict(s);
    tally[v]++;
    const callsign = s.metadata?.fleet_identity?.callsign || '(unnamed)';
    console.log(`  ${v.padEnd(6)} ${callsign.padEnd(12)} ${s.session_id.slice(0, 8)}  sd=${s.sd_key || 'idle'}  last_seen=${fmtAge(s.updated_at || s.heartbeat_at, nowMs)}  reason=${reason || '-'}`);
  }

  const registered = new Set(ids);
  const orphanPids = Object.entries(getMarkerSessionIds()).filter(([sid, info]) => info.alive && !registered.has(sid));
  if (orphanPids.length > 0) {
    console.log('\nUNREGISTERED (PID alive, no active claude_sessions row)');
    for (const [sid, info] of orphanPids) console.log(`  pid=${info.pid}  session_id=${sid.slice(0, 12)}`);
  }

  console.log(`\nSUMMARY: workers alive=${tally.ALIVE} stale=${tally.STALE} dead=${tally.DEAD}${orphanPids.length ? `, unregistered=${orphanPids.length}` : ''}\n`);
}

module.exports = { fmtAge, computeVerdict, ROLE_SINGLETONS, RECENT_SEND_MS, STALE_WINDOW_MS };

if (require.main === module) {
  main().catch(err => { console.error('fleet-rollcall failed:', err.message); process.exit(1); });
}
