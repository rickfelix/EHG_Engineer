#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 (FR-5c): released-while-alive ledger check.
 *
 * There is no audit trail that preserves a claude_sessions row's heartbeat_at value AT THE
 * MOMENT it was marked stale (the row is mutated in place, and TR-2 rules out adding new
 * schema for this SD). The available, audit-trail-independent signal for "this stale mark was
 * a false positive" is: the SAME session_id kept heartbeating again shortly after stale_at,
 * without a new session row being created for it -- a genuinely dead session's heartbeat_at
 * never advances past its stale_at.
 *
 * CONTROL: run this against the 2026-09-04 20:12Z window FIRST -- it must find the two known
 * incidents (Golf 838c05dd, Golf-3 a1d6d6cf) before a later, clean window is read as "zero
 * recurrences" rather than "predicate never fires."
 *
 * Usage: node scripts/one-off/verify-released-while-alive-ledger-ssot-001.mjs [--since ISO] [--until ISO]
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : fallback;
};

const since = getArg('since', '2026-09-04T20:00:00Z');
const until = getArg('until', new Date().toISOString());
const RECOVERY_WINDOW_MS = 30 * 60 * 1000; // heartbeat resuming within 30min of stale_at is a strong false-positive signal

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('claude_sessions')
  .select('session_id, status, stale_reason, stale_at, heartbeat_at')
  .in('stale_reason', ['PID_NOT_FOUND'])
  .gte('stale_at', since)
  .lte('stale_at', until)
  .limit(500);

if (error) {
  console.error('QUERY_FAILED:', error.message);
  process.exit(1);
}

const flagged = (data || []).filter((row) => {
  if (!row.stale_at || !row.heartbeat_at) return false;
  const staleAt = new Date(row.stale_at).getTime();
  const heartbeatAt = new Date(row.heartbeat_at).getTime();
  return heartbeatAt - staleAt > RECOVERY_WINDOW_MS; // heartbeat kept advancing well past the stale mark
});

console.log(`Window: ${since} .. ${until}`);
console.log(`Total stale_reason='PID_NOT_FOUND' rows in window: ${(data || []).length}`);
console.log(`Flagged as released-while-alive (heartbeat resumed >${RECOVERY_WINDOW_MS / 60000}min after stale_at): ${flagged.length}`);
for (const row of flagged) {
  console.log(`  - ${row.session_id}: stale_at=${row.stale_at} heartbeat_at=${row.heartbeat_at} status=${row.status}`);
}

console.log(flagged.length > 0 ? 'RESULT=FLAGGED' : 'RESULT=CLEAN');
