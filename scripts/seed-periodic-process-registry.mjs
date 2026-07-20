#!/usr/bin/env node
/**
 * Mechanically seeds periodic_process_registry (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001, FR-1).
 *
 * "Seed MECHANICALLY from the known cron/loop registries where possible -- hand-listing only the
 * remainder" (SD scope). This script derives registry rows from LIVE data rather than a fixed
 * hand-written list:
 *   - role_session entries: distinct roles observed in claude_sessions.metadata (adam, solomon,
 *     coordinator via is_coordinant=true) -- NOT a fixed session_id (sessions rotate; the
 *     liveness_source_ref is a metadata FILTER the watcher re-resolves against the latest matching
 *     row each run).
 *   - scheduler_round entries: one row per round key found in the live
 *     eva_scheduler_heartbeat.metadata.job_last_runs / .last_round_runs objects -- each round is its
 *     own registry row so a single dead round (the actual Specimen A: weekly_consultant_analysis
 *     stopped 2026-06-20/21) is independently detectable even if the scheduler's own top-level
 *     last_poll_at looks unrelated.
 *
 * standalone_cron entries (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A, FR-2): seeded
 * MECHANICALLY from the discovered recurring-process estate (GHA cron workflows, scripts/cron/*,
 * coordinator STANDARD_LOOPS) via lib/periodic-liveness/enumerate-processes.mjs -- the same
 * discovery the zero-shadow sweep (scripts/enumerate-periodic-processes.mjs) enforces against, so
 * seeder and sweep can never disagree. This replaces the original additive-only design (rows only
 * appearing on a process's first stamp-last-fired call), which left every never-stamping process
 * as a permanent shadow. Rows seed with liveness_source='self_stamped' and no last_fired_at:
 * the watcher reports them UNVERIFIED (visible, never false-OVERDUE) until the process wires its
 * own stamp -- per-process stamp wiring is deliberately out of scope here.
 *
 * Idempotent: upserts on process_key, safe to re-run (TS-5).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAllProcesses } from '../lib/periodic-liveness/enumerate-processes.mjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ROLE_SESSION_INTERVAL_SECONDS = 1800; // 30-min tick, matches the fleet's own ScheduleWakeup idle-tick convention

// QF-20260710-257: known rounds map to their DECLARED cadence — prefix inference put
// gap_analysis / vision_rescore / corrective_generation (registered 'weekly' in
// lib/eva/eva-master-scheduler.js _registerDefaultRounds) on the 86400 default, and
// okr-mid-month-review (registerJob cadenceDays: 15) on 86400, producing standing false
// OVERDUE flags that the liveness watcher's seeder re-invocation re-asserted every run.
// New scheduler rounds/jobs MUST be added here; prefix inference is fallback only.
const DECLARED_ROUND_INTERVALS = {
  vision_rescore: 604800,
  gap_analysis: 604800,
  corrective_generation: 604800,
  'okr-mid-month-review': 1296000, // cadenceDays: 15 (NOT monthly — ground truth over advisory)
};

function intervalForRoundKey(key) {
  if (DECLARED_ROUND_INTERVALS[key]) return DECLARED_ROUND_INTERVALS[key];
  if (key.startsWith('daily_')) return 86400;
  if (key.startsWith('weekly_') || key.startsWith('friday_')) return 604800;
  if (key.startsWith('okr-monthly') || key.startsWith('monthly_')) return 2592000;
  return 86400; // conservative default for unrecognized prefixes
}

async function seedRoleSessions() {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: claude_sessions grows unbounded
  // (every session ever run) — paginate rather than rely on a capped 1000-row scan.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('metadata')
      .or('metadata->>role.not.is.null,metadata->>is_coordinator.eq.true')
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`claude_sessions query failed: ${e.message}`);
  }

  // Only the 3 role loops the SD's own specimens name (Adam/coordinator/Solomon) -- sprint-reasoner-*
  // are explicitly non-fleet/non-role sessions per established fleet convention, out of this seed.
  const seen = new Set();
  const upserts = [];
  for (const row of rows || []) {
    const md = row.metadata || {};
    let processKey = null;
    let displayName = null;
    let ref = null;
    if (md.role === 'adam') { processKey = 'role_session:adam'; displayName = 'Adam (role-session loop)'; ref = { metadata_filter: { role: 'adam' } }; }
    else if (md.role === 'solomon') { processKey = 'role_session:solomon'; displayName = 'Solomon (role-session loop)'; ref = { metadata_filter: { role: 'solomon' } }; }
    else if (md.is_coordinator === true) { processKey = 'role_session:coordinator'; displayName = 'Coordinator (role-session loop)'; ref = { metadata_filter: { is_coordinator: true } }; }
    if (!processKey || seen.has(processKey)) continue;
    seen.add(processKey);
    upserts.push({
      process_key: processKey,
      display_name: displayName,
      owner: 'chairman-fleet',
      process_type: 'role_session',
      expected_interval_seconds: ROLE_SESSION_INTERVAL_SECONDS,
      liveness_source: 'claude_sessions_heartbeat',
      liveness_source_ref: ref,
      session_bound: true,
      currently_expected_active: true,
      updated_at: new Date().toISOString(),
    });
  }
  return upserts;
}

async function seedSchedulerRounds() {
  // eva_scheduler_heartbeat is a SINGLETON-row table (one instance_id at a time, replaced/updated
  // across restarts, not accumulated) -- confirmed live (a restart mid-EXEC on this SD changed
  // instance_id from scheduler-8b34f47a to scheduler-7f77838a with zero old rows left behind).
  // liveness_source_ref therefore does NOT key on instance_id: it always resolves against
  // whichever row is currently live, so a scheduler restart never orphans a registry row.
  const { data: rows, error } = await supabase
    .from('eva_scheduler_heartbeat')
    .select('instance_id, metadata');
  if (error) throw new Error(`eva_scheduler_heartbeat query failed: ${error.message}`);
  if (!rows || rows.length === 0) return [];
  const row = rows[0];

  const upserts = [];
  const md = row.metadata || {};
  for (const metadataPath of ['job_last_runs', 'last_round_runs']) {
    const bucket = md[metadataPath];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const roundKey of Object.keys(bucket)) {
      upserts.push({
        process_key: `scheduler_round:${roundKey}`,
        display_name: `eva-scheduler round: ${roundKey}`,
        owner: 'eva-scheduler',
        process_type: 'scheduler_round',
        expected_interval_seconds: intervalForRoundKey(roundKey),
        liveness_source: 'eva_scheduler_heartbeat',
        liveness_source_ref: { metadata_path: metadataPath, round_key: roundKey },
        session_bound: false,
        currently_expected_active: true,
        updated_at: new Date().toISOString(),
      });
    }
  }
  // The scheduler's own top-level poll loop, separate from any individual round.
  upserts.push({
    process_key: 'scheduler_round:__poll_loop__',
    display_name: 'eva-scheduler poll loop',
    owner: 'eva-scheduler',
    process_type: 'scheduler_round',
    expected_interval_seconds: 300, // poll cadence per eva-scheduler-watcher.mjs's own age-gate assumption
    liveness_source: 'eva_scheduler_heartbeat',
    liveness_source_ref: { column: 'last_poll_at' },
    session_bound: false,
    currently_expected_active: true,
    updated_at: new Date().toISOString(),
  });
  return upserts;
}

// FR-2: standalone_cron pass — one owned row per discovered recurring process. New rows get the
// coordinator interim owner ('coordinator-fleet') per the parent LEAD condition (never silently
// unowned); EXISTING rows keep their current owner — a re-run must never clobber a later
// real-owner reassignment back to the interim (the fleet's documented re-clobber failure class).
// Real-owner reassignment flows through the worklist emitted by
// scripts/backfill-registry-owners.mjs.
async function seedStandaloneCrons() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const discovered = discoverAllProcesses(repoRoot);
  if (discovered.length === 0) return [];

  const { data: existing, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, owner')
    .in('process_key', discovered.map((p) => p.process_key));
  if (error) throw new Error(`existing-owner lookup failed: ${error.message}`);
  const ownerByKey = new Map((existing || []).map((r) => [r.process_key, r.owner]));

  return discovered.map((proc) => ({
    process_key: proc.process_key,
    display_name: proc.display_name,
    owner: ownerByKey.get(proc.process_key) || 'coordinator-fleet',
    process_type: 'standalone_cron',
    expected_interval_seconds: proc.expected_interval_seconds,
    liveness_source: 'self_stamped',
    liveness_source_ref: proc.cron ? { cron: proc.cron, discovered_from: proc.source } : { discovered_from: proc.source },
    session_bound: proc.session_bound,
    currently_expected_active: true,
    updated_at: new Date().toISOString(),
  }));
}

async function main() {
  const roleUpserts = await seedRoleSessions();
  const roundUpserts = await seedSchedulerRounds();
  const cronUpserts = await seedStandaloneCrons();
  const all = [...roleUpserts, ...roundUpserts, ...cronUpserts];

  if (all.length === 0) {
    console.log('No mechanically-derivable registry rows found (0 role sessions, 0 scheduler rounds) -- nothing to seed.');
    return;
  }

  const { data, error } = await supabase
    .from('periodic_process_registry')
    .upsert(all, { onConflict: 'process_key' })
    .select('process_key');
  if (error) throw new Error(`registry upsert failed: ${error.message}`);

  console.log(`Seeded/updated ${data.length} periodic_process_registry row(s):`);
  console.log(`  role_session: ${roleUpserts.length}`);
  console.log(`  scheduler_round: ${roundUpserts.length}`);
  console.log(`  standalone_cron: ${cronUpserts.length}`);
  for (const row of data) console.log(`  - ${row.process_key}`);
}

main().catch((err) => {
  console.error(`[seed-periodic-process-registry] FAILED: ${err.message}`);
  process.exit(1);
});
