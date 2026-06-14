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
import { liveFleetWorkers, isFleetWorker } from '../lib/fleet/genuine-worker.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const DRY = !!process.env.FLEET_PULSE_DRYRUN || process.argv.includes('--dry-run');
const PROVISIONED_WINDOW = parseInt(process.env.COORD_PROVISIONED_WINDOW_MIN || '480', 10) * 60000;
const RETENTION_HOURS = parseInt(process.env.FLEET_PULSE_RETENTION_HOURS || '6', 10);

async function main() {
  const { data: sessRaw, error } = await db.from('claude_sessions')
    .select('session_id,heartbeat_at,sd_key,status,claimed_at,worktree_path,continuous_sds_completed,metadata')
    .order('heartbeat_at', { ascending: false }).limit(60);
  if (error) throw new Error('claude_sessions read failed: ' + error.message);

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

main().catch((e) => { console.error('fleet-worker-pulse failed:', e.message); process.exit(1); });
