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
    // FR-1/FR-2: revive-all is the path most likely to be run unattended, which is where
    // the silence cost the most — 21 requests expired here without anyone noticing.
    const allWarn = formatQueueWarning(await assessQueueHealth(supabase));
    if (allWarn) console.log(allWarn);
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
  // FR-1/FR-2: read the queue's history BEFORE reporting an outcome, so "requested"
  // is never printed as if it meant "will be acted on".
  const health = await assessQueueHealth(supabase);
  if (r.inserted) {
    console.log(`✓ Revival REQUESTED for ${callsign} (row written — not yet consumed)`);
    console.log(`  row_id: ${r.row.id}`);
    console.log(`  expires_at: ${r.row.expires_at}`);
    console.log(`  broadcast: SPAWN_REQUEST emitted on session_coordination`);
    console.log(`\nA spawn-execution layer (watchdog/notification/cron) should consume the row and start a fresh CC instance.`);
    console.log(`See docs/protocol/coordinator-worker-revival.md for the contract.`);
    const warn = formatQueueWarning(health);
    if (warn) console.log(warn);
  } else if (r.alreadyPending) {
    // FR-3: idempotency behaviour is unchanged — only how it READS. On a queue that has
    // never delivered, the blocking pending row is evidence of the dead consumer, not of
    // a duplicate politely suppressed.
    if (health && health.neverConsumed) {
      console.log(`⚠ ${callsign}: BLOCKED by an unconsumed revival request — not a benign duplicate.`);
      console.log(`  A previous request is still pending and nothing has consumed it.`);
    } else {
      console.log(`↺ ${callsign}: already has a pending revival request.`);
      console.log(`  No new row inserted (idempotency rule: one pending per callsign).`);
    }
    console.log(`  Run: SELECT id, requested_at, expires_at FROM worker_spawn_requests WHERE requested_callsign='${callsign}' AND status='pending';`);
    const warn = formatQueueWarning(health);
    if (warn) console.log(warn);
  } else {
    console.error(`✗ Failed to insert revival request: ${r.error?.message || 'unknown error'}`);
    process.exit(2);
  }
}

// Export internal helpers for unit testing.
/**
 * SD-LEO-INFRA-COORDINATOR-REVIVE-NEVER-001 (FR-1, FR-2).
 *
 * Read the queue's own history so the CALLER can tell a live queue from a dead one.
 * Everything here is DERIVED at call time (TR-3) — never hardcoded — so the warning
 * switches OFF by itself the moment a request is actually fulfilled. A permanent
 * warning would get ignored as noise and re-create the unobservable failure it exists
 * to expose.
 *
 * Exact head counts, never an unbounded select (TR-1): PostgREST caps a plain .select()
 * at 1000 rows, which would silently UNDER-REPORT the stuck population — the same
 * blind-measurement class this SD is about.
 *
 * @returns {Promise<{total:number, pending:number, everFulfilled:number,
 *                    oldestPendingAt:string|null, neverConsumed:boolean}|null>}
 */
async function assessQueueHealth(supabase) {
  try {
    const head = { count: 'exact', head: true };
    const [{ count: total }, { count: pending }, { count: everFulfilled }] = await Promise.all([
      supabase.from('worker_spawn_requests').select('*', head),
      supabase.from('worker_spawn_requests').select('*', head).eq('status', 'pending'),
      supabase.from('worker_spawn_requests').select('*', head).not('fulfilled_at', 'is', null),
    ]);
    const { data: oldest } = await supabase
      .from('worker_spawn_requests')
      .select('requested_at')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .limit(1);

    return {
      total: total ?? 0,
      pending: pending ?? 0,
      everFulfilled: everFulfilled ?? 0,
      oldestPendingAt: oldest && oldest[0] ? oldest[0].requested_at : null,
      // The whole signal: has this queue EVER delivered? Derived, not asserted.
      neverConsumed: (total ?? 0) > 0 && (everFulfilled ?? 0) === 0,
    };
  } catch {
    // Fail-soft: an unreadable queue must not break revive. Absent health is reported
    // as absent, never as healthy — silence is not evidence of a live consumer.
    return null;
  }
}

/**
 * Render the caller-facing warning. Returns '' when the queue has ever delivered, so a
 * working consumer produces no noise (TS-2 pins this off-switch).
 *
 * Counts always ship WITH their denominator (FR-2): a bare "8 pending" is the
 * count-truncation shape this codebase keeps rediscovering.
 */
function formatQueueWarning(health) {
  if (!health) return '\n  [warn] queue health unreadable — cannot confirm a consumer exists.';
  if (!health.neverConsumed) return '';
  const ageDays = health.oldestPendingAt
    ? ((Date.now() - new Date(health.oldestPendingAt).getTime()) / 86400000).toFixed(1)
    : null;
  const lines = [
    '',
    '  *** THIS REQUEST MAY NEVER BE CONSUMED ***',
    `  worker_spawn_requests has NEVER fulfilled a request: 0 of ${health.total} rows have fulfilled_at set.`,
    `  pending: ${health.pending} of ${health.total}` + (ageDays ? `, oldest waiting ${ageDays} days.` : '.'),
    '  The row inserted above is real; whether anything reads it is NOT established by this command.',
    '  WHY: scripts/fleet/worker-spawn-executor.cjs is OPERATOR-GATED (its header: "Stage 2, do NOT',
    '  enable autonomously") and .github/workflows/fleet-rollcall-cron.yml deliberately does not wire',
    '  it — the live spawn path needs a chairman to host-validate the claude CLI invocation and register',
    '  a LOCAL Windows Task Scheduler entry; GHA cannot host it. Until that is done, this queue is a',
    '  write-only surface and revive cannot recover anything.',
  ];
  return lines.join('\n');
}

module.exports = { NATO, findIdleCallsigns, reviveOne, insertSpawnRequest, isExpiredPendingRow, reapExpiredPendingRequests, assessQueueHealth, formatQueueWarning };

// Only run main() when invoked as CLI (not when require'd by tests).
if (require.main === module) {
  main().catch(err => {
    console.error('REVIVE ERROR:', err.message);
    process.exit(1);
  });
}
