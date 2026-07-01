#!/usr/bin/env node
/**
 * /coordinator revive [callsign]   — request revival for a single callsign
 * /coordinator revive-all          — request revival for every callsign without an active session
 *
 * SD: SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001 (FR-3, US-002)
 *
 * INSERTs into worker_spawn_requests + emits SPAWN_REQUEST broadcast on session_coordination.
 * Idempotency: at most one pending row per callsign at any time (DB partial unique index).
 * On duplicate revive, reports "already pending" gracefully — does NOT raise raw SQL error.
 *
 * Usage:
 *   node scripts/coordinator-revive.cjs <callsign>      # e.g. 'Bravo'
 *   node scripts/coordinator-revive.cjs all
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
// SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001: validated dispatch guard
// (the SPAWN_REQUEST broadcast below uses the 'broadcast' sentinel, which the
// guard short-circuits — exercising the sentinel-allowlist path).
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { liveActiveSessionsView } = require('../lib/fleet/live-fleet-sessions.cjs');

const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  return createClient(url, key);
}

/**
 * Identify callsigns that currently have NO active session (heartbeat < 5 min).
 * @returns {Promise<string[]>} Sorted list of idle callsigns (subset of NATO).
 */
async function findIdleCallsigns(supabase) {
  // ROWCAP-CANONICAL-001: bounded via the canonical view helper (freshest-first + .limit) so the
  // 1000-row cap can't hide the newest active callsigns. The helper throws on a query error,
  // preserving the previous fail-loud behavior of this revival path.
  const sessions = await liveActiveSessionsView(supabase, {
    columns: 'session_id, metadata, computed_status, heartbeat_age_seconds',
  });

  const activeCallsigns = new Set();
  for (const s of sessions || []) {
    const cs = s.metadata?.fleet_identity?.callsign;
    if (cs && s.computed_status === 'active') activeCallsigns.add(cs);
  }
  return NATO.filter(cs => !activeCallsigns.has(cs));
}

/**
 * Pure predicate — is this a PENDING worker_spawn_requests row whose TTL has elapsed?
 * SD-REFILL-00H0UNO7 (FR-3): an expired-but-still-'pending' row holds the partial unique
 * index idx_wsr_unique_pending_callsign and thereby permanently blocks fresh revivals.
 *
 * Fail-safe: a missing / unparseable expires_at returns FALSE — we never reap a row whose
 * TTL we cannot read, so a genuinely live request is never destroyed by a bad timestamp.
 *
 * @param {{status?:string, expires_at?:string}} row
 * @param {number} nowMs
 * @returns {boolean}
 */
function isExpiredPendingRow(row, nowMs) {
  if (!row || row.status !== 'pending') return false;
  const exp = Date.parse(row.expires_at);
  if (!Number.isFinite(exp)) return false; // fail-safe: unreadable TTL is treated as not-expired
  return exp <= nowMs;
}

/**
 * Reap (status: pending -> expired) every past-TTL pending request, optionally scoped to a
 * single callsign. Flipping the row out of 'pending' frees the partial unique index so a
 * fresh revival can be inserted. Returns the number of rows reaped.
 * SD-REFILL-00H0UNO7 (FR-1, root cause 3).
 *
 * @returns {Promise<number>} rows reaped
 */
async function reapExpiredPendingRequests(supabase, { callsign = null, nowIso = new Date().toISOString() } = {}) {
  let q = supabase
    .from('worker_spawn_requests')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lte('expires_at', nowIso);
  if (callsign) q = q.eq('requested_callsign', callsign);
  const { data, error } = await q.select('id');
  if (error) {
    console.warn(`  [warn] reapExpiredPendingRequests failed: ${error.message}`);
    return 0;
  }
  return (data || []).length;
}

/** Raw single-row insert + best-effort broadcast. Returns { inserted, alreadyPending, error, row }. */
async function insertSpawnRequest(supabase, callsign, requestedBySessionId) {
  const { data, error } = await supabase
    .from('worker_spawn_requests')
    .insert({
      requested_by_session_id: requestedBySessionId,
      requested_callsign: callsign,
      status: 'pending'
    })
    .select('id, requested_at, expires_at')
    .single();

  if (error) {
    // Postgres unique-violation error code is 23505. PostgREST surfaces it via .code or message.
    const isUnique = error.code === '23505' || /unique|duplicate/i.test(error.message || '');
    if (isUnique) return { inserted: false, alreadyPending: true, error: null };
    return { inserted: false, alreadyPending: false, error };
  }

  // Broadcast SPAWN_REQUEST on session_coordination (best-effort — broadcast failure
  // does NOT undo the row insert; the row is the canonical contract surface).
  await insertCoordinationRow(supabase, {
    target_session: 'broadcast',
    message_type: 'SPAWN_REQUEST',
    subject: `Spawn request: ${callsign}`,
    body: `Coordinator requests revival of callsign ${callsign}. Spawn-execution layer (external watchdog/notification/cron) should consume worker_spawn_requests row id=${data.id}.`,
    payload: { callsign, request_id: data.id, expires_at: data.expires_at }
  }).then(({ error: bcErr }) => {
    if (bcErr) console.warn(`  [warn] broadcast emit failed: ${bcErr.message} (row still inserted)`);
  }).catch((gErr) => {
    console.warn(`  [warn] broadcast guard refused: ${gErr.message} (worker_spawn_requests row still inserted)`);
  });

  return { inserted: true, alreadyPending: false, error: null, row: data };
}

/**
 * INSERT a single revival request. Returns { inserted, alreadyPending, error }.
 * SD-REFILL-00H0UNO7 (FR-2): on an idempotency (23505) hit, the conflicting pending row may be
 * EXPIRED (a zombie that never got consumed). Reap the callsign's expired-pending row and retry
 * the insert ONCE — that unblocks revival. If nothing was reaped, a genuinely LIVE pending
 * request exists, so we report alreadyPending=true exactly as before (idempotency preserved).
 */
async function reviveOne(supabase, callsign, requestedBySessionId) {
  const first = await insertSpawnRequest(supabase, callsign, requestedBySessionId);
  if (!first.alreadyPending) return first; // inserted, or a non-idempotency error

  const reaped = await reapExpiredPendingRequests(supabase, { callsign });
  if (reaped === 0) return first; // a live pending row blocks — correct idempotency skip

  // An expired zombie was reaped; the unique index is now free. Retry once.
  return insertSpawnRequest(supabase, callsign, requestedBySessionId);
}

async function main() {
  const arg = (process.argv[2] || '').trim();
  if (!arg) {
    console.error('Usage: coordinator-revive.cjs <callsign|all>');
    process.exit(1);
  }

  const supabase = getSupabase();
  const requestedBySessionId = process.env.CLAUDE_SESSION_ID || null;
  if (!requestedBySessionId) {
    console.warn('  [warn] CLAUDE_SESSION_ID not set — requested_by_session_id will be NULL');
  }

  if (arg.toLowerCase() === 'all') {
    const idle = await findIdleCallsigns(supabase);
    if (idle.length === 0) {
      console.log('All known callsigns have active sessions — nothing to revive.');
      return;
    }
    let inserted = 0, skipped = 0, failed = 0;
    for (const cs of idle) {
      const r = await reviveOne(supabase, cs, requestedBySessionId);
      if (r.inserted) {
        inserted++;
        console.log(`  ✓ ${cs}: revival requested (row ${r.row.id})`);
      } else if (r.alreadyPending) {
        skipped++;
        console.log(`  ↺ ${cs}: already pending (idempotency hit, no new row)`);
      } else {
        failed++;
        console.log(`  ✗ ${cs}: ${r.error?.message || 'unknown error'}`);
      }
    }
    console.log(`\nrevive-all: ${inserted} inserted, ${skipped} skipped (already pending), ${failed} failed`);
    if (failed > 0) process.exit(2);
    return;
  }

  // Single-callsign mode
  const callsign = NATO.find(n => n.toLowerCase() === arg.toLowerCase());
  if (!callsign) {
    console.error(`Unknown callsign: "${arg}". Valid: ${NATO.join(', ')}, or 'all'.`);
    process.exit(1);
  }

  const r = await reviveOne(supabase, callsign, requestedBySessionId);
  if (r.inserted) {
    console.log(`✓ Revival requested for ${callsign}`);
    console.log(`  row_id: ${r.row.id}`);
    console.log(`  expires_at: ${r.row.expires_at}`);
    console.log(`  broadcast: SPAWN_REQUEST emitted on session_coordination`);
    console.log(`\nA spawn-execution layer (watchdog/notification/cron) should consume the row and start a fresh CC instance.`);
    console.log(`See docs/protocol/coordinator-worker-revival.md for the contract.`);
  } else if (r.alreadyPending) {
    console.log(`↺ ${callsign}: already has a pending revival request.`);
    console.log(`  No new row inserted (idempotency rule: one pending per callsign).`);
    console.log(`  Run: SELECT id, requested_at, expires_at FROM worker_spawn_requests WHERE requested_callsign='${callsign}' AND status='pending';`);
  } else {
    console.error(`✗ Failed to insert revival request: ${r.error?.message || 'unknown error'}`);
    process.exit(2);
  }
}

// Export internal helpers for unit testing.
module.exports = { NATO, findIdleCallsigns, reviveOne, insertSpawnRequest, isExpiredPendingRow, reapExpiredPendingRequests };

// Only run main() when invoked as CLI (not when require'd by tests).
if (require.main === module) {
  main().catch(err => {
    console.error('REVIVE ERROR:', err.message);
    process.exit(1);
  });
}
