// fleet-worker-pulse.mjs — sample active-vs-not fleet workers and record one pulse row.
//
// Chairman directive (2026-06-14): the hourly exec email shows the AVERAGE active-worker count,
// not a single instant. This job runs every 15 minutes and records one fleet_worker_pulse row;
// adam-exec-summary.mjs averages the last hour of pulses and rounds to a whole number.
//
// Uses the SAME genuine-worker predicate as the coordinator email / fleet dashboard
// (lib/fleet/genuine-worker.mjs), so the pulse can never disagree with the live count.
//   active = live genuine workers (heartbeat < 15 min)
//   total  = active + incognito (provisioned but quiet within the provisioned window)
//   idle   = total - active   (provisioned but not currently live)
//
// Self-pruning: deletes pulses older than the retention window so the table stays tiny.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { liveFleetWorkers, isFleetWorker, FREEZE_TERM_COLUMNS } from '../lib/fleet/genuine-worker.mjs';

const PROVISIONED_WINDOW = parseInt(process.env.COORD_PROVISIONED_WINDOW_MIN || '480', 10) * 60000;
const RETENTION_HOURS = parseInt(process.env.FLEET_PULSE_RETENTION_HOURS || '6', 10);

/**
 * The column list this pulse reads — SD-LEO-INFRA-FLEET-DOWN-PAGER-001.
 *
 * EXPORTED, AND THAT IS LOAD-BEARING. The freeze term in liveFleetWorkers() fails open, so a caller
 * that does not select last_tool_at / loop_state gets the old heartbeat-only count SILENTLY — a
 * correct classifier, permanently blind, with a green suite. This constant is what a test can bind a
 * fixture to, so a fixture cannot claim coverage the shipped query does not have. Mirrors the same
 * pattern at lib/fleet/live-fleet-sessions.cjs:27 (LIVE_SESSION_COLUMNS).
 *
 * FREEZE_TERM_COLUMNS is spread rather than retyped: the predicate owns the list of what it reads,
 * so widening it there can never leave this query behind.
 */
export const PULSE_SESSION_COLUMNS = [
  'session_id', 'heartbeat_at', 'sd_key', 'status', 'claimed_at',
  'worktree_path', 'continuous_sds_completed', 'metadata',
  ...FREEZE_TERM_COLUMNS
].join(',');

/** Bounded read of the pulse population. Exported so the wiring can be tested without running main(). */
export async function fetchPulseSessions(db) {
  const { data, error } = await db.from('claude_sessions')
    .select(PULSE_SESSION_COLUMNS)
    .order('heartbeat_at', { ascending: false }).limit(60);
  if (error) throw new Error('claude_sessions read failed: ' + error.message);
  return data;
}

async function main() {
  // createClient lives INSIDE main() and main() is import-guarded below, so importing this module
  // performs no I/O — previously an import would have read claude_sessions, INSERTed a pulse row and
  // run the prune DELETE, which is why nothing could test it. Guard pattern copied from
  // scripts/fleet-down-alert.mjs:263, which is exactly why that module's helpers are testable.
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const me = process.env.CLAUDE_SESSION_ID;
  const t = Date.now();
  const DRY = !!process.env.FLEET_PULSE_DRYRUN || process.argv.includes('--dry-run');

  const sessRaw = await fetchPulseSessions(db);

  const live = liveFleetWorkers(sessRaw, me, t);
  const active = live.length;
  const recentSeen = (sessRaw || []).filter((s) => isFleetWorker(s, me) && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW);
  const total = active + Math.max(0, recentSeen.length - active);
  const idle = Math.max(0, total - active);

  if (DRY) { console.log(`[DRY] pulse active=${active} idle=${idle} total=${total}`); return; }

  const ins = await db.from('fleet_worker_pulse').insert({ active_count: active, total_count: total, idle_count: idle });
  if (ins.error) throw new Error('pulse insert failed: ' + ins.error.message);

  // Best-effort prune; a prune failure must never fail the pulse.
  try {
    await db.from('fleet_worker_pulse').delete().lt('captured_at', new Date(t - RETENTION_HOURS * 3600 * 1000).toISOString());
  } catch (e) { console.warn('[fleet-pulse] prune skipped: ' + (e?.message || e)); }

  console.log(`FLEET-PULSE active=${active} idle=${idle} total=${total}`);
}

// Run main() only as a CLI, so tests can import PULSE_SESSION_COLUMNS / fetchPulseSessions without
// touching the database (SD-LEO-INFRA-FLEET-DOWN-PAGER-001).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('fleet-worker-pulse failed:', e.message); process.exit(1); });
}
