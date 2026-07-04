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
 * standalone_cron entries are NOT hand-seeded here -- registry membership for that class is
 * additive-only via lib/periodic-liveness/stamp-last-fired.js's first call (FR-2), matching the
 * SD's own design note that a hand-only list becomes its own fossil.
 *
 * Idempotent: upserts on process_key, safe to re-run (TS-5).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ROLE_SESSION_INTERVAL_SECONDS = 1800; // 30-min tick, matches the fleet's own ScheduleWakeup idle-tick convention

function intervalForRoundKey(key) {
  if (key.startsWith('daily_') || key.startsWith('okr-mid-month')) return 86400;
  if (key.startsWith('weekly_') || key.startsWith('friday_')) return 604800;
  if (key.startsWith('okr-monthly') || key.startsWith('monthly_')) return 2592000;
  return 86400; // conservative default for unrecognized prefixes
}

async function seedRoleSessions() {
  const { data: rows, error } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .or('metadata->>role.not.is.null,metadata->>is_coordinator.eq.true');
  if (error) throw new Error(`claude_sessions query failed: ${error.message}`);

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

async function main() {
  const roleUpserts = await seedRoleSessions();
  const roundUpserts = await seedSchedulerRounds();
  const all = [...roleUpserts, ...roundUpserts];

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
  for (const row of data) console.log(`  - ${row.process_key}`);
}

main().catch((err) => {
  console.error(`[seed-periodic-process-registry] FAILED: ${err.message}`);
  process.exit(1);
});
