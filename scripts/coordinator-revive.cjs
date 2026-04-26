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
  const { data: sessions, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, metadata, computed_status, heartbeat_age_seconds');
  if (error) throw new Error(`v_active_sessions query failed: ${error.message}`);

  const activeCallsigns = new Set();
  for (const s of sessions || []) {
    const cs = s.metadata?.fleet_identity?.callsign;
    if (cs && s.computed_status === 'active') activeCallsigns.add(cs);
  }
  return NATO.filter(cs => !activeCallsigns.has(cs));
}

/**
 * INSERT a single revival request. Returns { inserted, alreadyPending, error }.
 */
async function reviveOne(supabase, callsign, requestedBySessionId) {
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
  await supabase.from('session_coordination').insert({
    target_session: 'broadcast',
    message_type: 'SPAWN_REQUEST',
    subject: `Spawn request: ${callsign}`,
    body: `Coordinator requests revival of callsign ${callsign}. Spawn-execution layer (external watchdog/notification/cron) should consume worker_spawn_requests row id=${data.id}.`,
    payload: { callsign, request_id: data.id, expires_at: data.expires_at }
  }).then(({ error: bcErr }) => {
    if (bcErr) console.warn(`  [warn] broadcast emit failed: ${bcErr.message} (row still inserted)`);
  });

  return { inserted: true, alreadyPending: false, error: null, row: data };
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
module.exports = { NATO, findIdleCallsigns, reviveOne };

// Only run main() when invoked as CLI (not when require'd by tests).
if (require.main === module) {
  main().catch(err => {
    console.error('REVIVE ERROR:', err.message);
    process.exit(1);
  });
}
