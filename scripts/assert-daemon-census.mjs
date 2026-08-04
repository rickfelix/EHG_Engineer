#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-4 — run the census assertion against the live fleet.
 *
 *   node scripts/assert-daemon-census.mjs             # assert; exit 1 if the census diverged
 *   node scripts/assert-daemon-census.mjs --cleanup   # also release the leaked sessions
 *
 * The predicate and its threshold rationale live in lib/fleet/daemon-census.cjs. This file is only
 * the live plumbing, deliberately: the logic is unit-tested (including TS-7, a control proving the
 * assertion can actually fail), and a script that cannot be tested should not hold the reasoning.
 *
 * --cleanup writes status='released', which is the same lever FR-1 pulls: the daemon's PATCH
 * filters status=in.(active,idle,stale) (session-tick.cjs:331), so a released row 0-rows its next
 * write and every daemon serving it exits itself.
 *
 * READS THE WHOLE POPULATION, never a capped page. A capped fetch grouped in memory measures the
 * cap, and a census that silently measures its own limit is worse than no census.
 */
import 'dotenv/config';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const { assertDaemonCensus } = createRequire(import.meta.url)('../lib/fleet/daemon-census.cjs');

const cleanup = process.argv.includes('--cleanup');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hostname = os.hostname();

async function fetchAll() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id,status,heartbeat_at,last_tool_at')
      .eq('hostname', hostname)
      .neq('status', 'released')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const rows = await fetchAll();
const result = assertDaemonCensus({ rows, now: Date.now() });

console.log(`daemon census — host=${hostname} non-released rows=${rows.length}`);
console.log(result.ok ? `PASS: ${result.detail}` : `FAIL: ${result.detail}`);

if (result.ok) process.exit(0);

for (const l of result.leaked) {
  console.log(`  ${l.session_id}  heartbeat ${Math.round(l.heartbeatAgeMs / 1000)}s ago, ` +
              `last tool ${Math.round(l.lastToolAgeMs / 3600000)}h ago`);
}

if (!cleanup) {
  console.log('\nre-run with --cleanup to release these rows (their daemons then self-exit).');
  process.exit(1);
}

const ids = result.leaked.map((l) => l.session_id);
const { error } = await supabase.from('claude_sessions').update({ status: 'released' }).in('session_id', ids);
if (error) { console.log('cleanup FAILED: ' + error.message); process.exit(1); }
console.log(`\nreleased ${ids.length} leaked session(s). Re-run without --cleanup to confirm.`);
process.exit(0);
