#!/usr/bin/env node
/**
 * S20-26 SIMULATED RUN — post-run verification (SD-LEO-INFRA-S20-26-SIMULATED-RUN-001).
 *
 * Confirms a real `s20-run.mjs run --run-id <id>` invocation produced a durable,
 * gradeable run record satisfying the SD's 3 success criteria. Read-only against the
 * harness's own output EXCEPT for one companion write: a `harness_run_verification`
 * system_events row durably recording the independently-resolved kill_gate_mode value
 * (the harness's own journal does not stamp kill_gate_mode text anywhere -- measured
 * against a real run, s2026-hotel-0817 -- so this script supplies that stamp itself
 * rather than modifying harness code, which is out of scope per the SD's DOES-NOT).
 *
 * No grading/interpretation of the O-requirement coverage or gate-block findings
 * themselves happens here -- that is separately owned per the SD's DOES-NOT. This
 * script only confirms the RUN MECHANICS succeeded (record present, telemetry
 * captured per stage, addressable by run id, kill_gate_mode resolved+recorded).
 *
 * Usage: node scripts/harness/verify-s20-run.mjs --run-id <id>
 */
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

/**
 * Stage-Zero-namespace tables (grepped from lib/eva/stage-zero/*.js's own `.from()`
 * calls -- not hand-guessed). `ventures` and shared EVA config tables are excluded:
 * they are legitimately touched by every venture (including the fixture), not
 * exclusive to Stage-Zero intake.
 */
export const STAGE_ZERO_TABLES = Object.freeze([
  'archetype_profile_interactions',
  'counterfactual_scores',
  'discovery_strategies',
  'evaluation_profile_outcomes',
  'evaluation_profiles',
  'nursery_evaluation_log',
  'portfolio_profile_allocations',
  'research_intelligence_reference',
  'selection_postures',
  'stage_of_death_predictions',
  'stage_zero_requests',
  'venture_briefs',
  'venture_nursery',
  'venture_synthesis_feedback',
]);

const STAGES = Object.freeze([20, 21, 22, 23, 24, 25, 26]);

/** Check A: exactly one durable finalize-mirror row exists for this run id. */
export function checkFinalizeMirrorRow(rows) {
  if (!rows || rows.length === 0) {
    return { pass: false, reason: 'no harness_run_journal_finalized row found for this run_id' };
  }
  if (rows.length > 1) {
    return { pass: false, reason: `expected exactly 1 finalize-mirror row, found ${rows.length}` };
  }
  const entries = rows[0].payload?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { pass: false, reason: 'finalize-mirror row has no journal entries (empty/malformed payload)' };
  }
  return { pass: true, entries };
}

/** Check B: telemetry captured for every traversed stage 20-26. */
export function checkPerStageTelemetry(entries, stages = STAGES) {
  const missing = stages.filter((s) => !entries.some((e) => typeof e.event === 'string' && e.event.includes(`S${s}`)));
  if (missing.length > 0) {
    return { pass: false, reason: `no journal entry mentions stage(s): ${missing.join(',')}` };
  }
  return { pass: true };
}

/** Check C: the H5.1 spawn-env fence confirms no live Stripe key was reachable (simulated-mode safety held). */
export function checkSpawnEnvFenceHeld(entries) {
  const fence = entries.find((e) => e.kind === 'fence_assertion' && typeof e.event === 'string' && e.event.includes('spawn-env'));
  if (!fence) return { pass: false, reason: 'no H5.1 spawn-env fence_assertion entry found' };
  if (fence.detail?.live_key_reachable !== false) {
    return { pass: false, reason: `spawn-env fence detail.live_key_reachable=${fence.detail?.live_key_reachable} (expected false)` };
  }
  return { pass: true };
}

/** Check D: is_demo/is_scaffolding (synthetic fixture) convention observed as an allowed divergence. */
export function checkSyntheticFixtureConvention(entries) {
  const found = entries.some((e) => typeof e.event === 'string' && e.event.includes('synthetic_fixture_venture'));
  if (!found) return { pass: false, reason: "no 'synthetic_fixture_venture' allowed-divergence entry found" };
  return { pass: true };
}

/** Check E: non-interference — zero Stage-Zero-namespace tables in the run's touched_tables union. */
export function checkStageZeroNonInterference(entries, stageZeroTables = STAGE_ZERO_TABLES) {
  const touched = new Set();
  for (const e of entries) for (const t of e.touched_tables || []) touched.add(t);
  const hit = stageZeroTables.filter((t) => touched.has(t));
  if (hit.length > 0) {
    return { pass: false, reason: `run touched Stage-Zero-namespace table(s): ${hit.join(',')}`, touched: [...touched] };
  }
  return { pass: true, touched: [...touched] };
}

/**
 * Run all checks against a finalize-mirror query result. Pure function, no I/O --
 * used directly by the unit tests against synthetic payloads.
 */
export function runAllChecks(rows, { stages = STAGES, stageZeroTables = STAGE_ZERO_TABLES } = {}) {
  const mirrorCheck = checkFinalizeMirrorRow(rows);
  if (!mirrorCheck.pass) {
    return { pass: false, checks: { finalize_mirror_row: mirrorCheck } };
  }
  const entries = mirrorCheck.entries;
  const checks = {
    finalize_mirror_row: { pass: true },
    per_stage_telemetry: checkPerStageTelemetry(entries, stages),
    spawn_env_fence_held: checkSpawnEnvFenceHeld(entries),
    synthetic_fixture_convention: checkSyntheticFixtureConvention(entries),
    stage_zero_non_interference: checkStageZeroNonInterference(entries, stageZeroTables),
  };
  const pass = Object.values(checks).every((c) => c.pass);
  return { pass, checks };
}

async function resolveKillGateMode(supabase, ventureId) {
  const { data: venture, error: ventureErr } = await supabase
    .from('ventures')
    .select('company_id')
    .eq('id', ventureId)
    .single();
  if (ventureErr || !venture) {
    return { resolved: false, reason: `could not load fixture venture ${ventureId}: ${ventureErr?.message || 'not found'}` };
  }
  const { data, error } = await supabase.rpc('get_chairman_settings', {
    p_company_id: venture.company_id,
    p_venture_id: ventureId,
  });
  if (error) return { resolved: false, reason: `get_chairman_settings RPC failed: ${error.message}` };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { resolved: false, reason: 'get_chairman_settings returned no row' };
  return { resolved: true, kill_gate_mode: row.kill_gate_mode, settings_source: row.settings_source };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
  const runId = flag('run-id');
  if (!runId) { console.error('--run-id required'); process.exit(2); }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );

  const { data: rows, error } = await supabase
    .from('system_events')
    .select('payload')
    .eq('event_type', 'harness_run_journal_finalized')
    .filter('payload->>run_id', 'eq', runId);

  if (error) { console.error('VERIFY_ERROR', error.message); process.exit(1); }

  const result = runAllChecks(rows || []);

  let killGateMode = { resolved: false, reason: 'skipped (finalize-mirror row missing)' };
  if (result.checks.finalize_mirror_row.pass) {
    const ventureRow = rows[0].payload.entries.find((e) => e.kind === 'lifecycle' && e.detail?.venture_id);
    const ventureId = ventureRow?.detail?.venture_id;
    if (ventureId) killGateMode = await resolveKillGateMode(supabase, ventureId);
  }

  const overallPass = result.pass && killGateMode.resolved && killGateMode.kill_gate_mode === 'standard';

  console.log(`VERIFY_S20_RUN run_id=${runId} overall=${overallPass ? 'PASS' : 'FAIL'}`);
  for (const [name, c] of Object.entries(result.checks)) {
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'} ${name}${c.pass ? '' : `: ${c.reason}`}`);
  }
  console.log(`  ${killGateMode.resolved && killGateMode.kill_gate_mode === 'standard' ? 'PASS' : 'FAIL'} kill_gate_mode_resolution: ${killGateMode.resolved ? `resolved=${killGateMode.kill_gate_mode} (source=${killGateMode.settings_source})` : killGateMode.reason}`);

  // Durable companion record: the kill_gate_mode "stamp" the SD success criteria asks
  // for, which the harness's own journal does not natively provide (measured fact).
  if (killGateMode.resolved) {
    const { error: insertErr } = await supabase.from('system_events').insert({
      event_type: 'harness_run_verification',
      agent_type: 'S20_26_VERIFY_SCRIPT',
      details: {
        run_id: runId,
        overall_pass: overallPass,
        checks: result.checks,
        kill_gate_mode: killGateMode.kill_gate_mode,
        kill_gate_mode_source: killGateMode.settings_source,
        verified_at: new Date().toISOString(),
      }, // schema-lint-disable-line -- free-form verification payload inside the details jsonb column, not top-level system_events columns
    });
    if (insertErr) console.error('VERIFICATION_MIRROR_WRITE_FAILED (non-blocking)', insertErr.message);
  }

  process.exit(overallPass ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error('VERIFY_S20_RUN_ERROR', e.message); process.exit(1); });
}
