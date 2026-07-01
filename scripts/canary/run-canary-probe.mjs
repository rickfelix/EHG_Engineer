/**
 * Synthetic canary venture probe runner.
 * SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001.
 *
 * Drives THE permanently-flagged isolated canary venture (is_demo=true —
 * excluded from Adam scope-registry, eva_ventures sync, fixture dispatch)
 * through the REAL stage machinery (StageExecutionWorker) and classifies every
 * stage, so config drift / RPC regressions / renderer crashes / contract
 * mismatches surface before a real venture hits them.
 *
 * Chairman gates are auto-approved under a RECORDED canary policy (rationale
 * 'canary-auto-policy' through the existing chairman_decisions flow — the
 * probe tests the MACHINE, not the judgment; override = recording, never a
 * silent bypass). Stages with hard external deps (18,19,23-26) are reported
 * external_skip, never attempted.
 *
 * Usage:
 *   node scripts/canary/run-canary-probe.mjs [--max-stages N] [--teardown|--keep]
 *        [--force-local] [--json]
 *   npm run canary:probe        (flag-gated; quiet refusal when disabled)
 *
 * Gated by leo_feature_flags CANARY_VENTURE_PROBE_V1 (ships OFF). The weekly
 * cron workflow checks the flag and exits 0 quietly when disabled.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { armCliTeardown } from '../../lib/cli-graceful-exit.js';
import {
  CANARY_KEY, CANARY_FLAG, EXTERNAL_DEP_STAGES, STAGE_STATUS,
  buildRunId, alertDedupKey, classifyExecutionRow, buildRunReport,
  probeAdmission, nextAction,
} from './canary-core.mjs';

config();

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
};
const MAX_STAGES = parseInt(argVal('--max-stages', '26'), 10);
const TEARDOWN = args.includes('--teardown') || !args.includes('--keep');
const FORCE_LOCAL = args.includes('--force-local');
const AS_JSON = args.includes('--json');
const STAGE_TIMEOUT_MS = parseInt(process.env.CANARY_STAGE_TIMEOUT_MS || '120000', 10);
/** Bound on drive iterations — each iteration advances >=1 stage or stops. */
const MAX_ITERATIONS = 40;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const log = (...a) => { if (!AS_JSON) console.log(...a); };

// QF-20260701-421: reality-gates.js and stage-governance.js each open a process-
// lifetime Realtime channel on this same client; an abrupt exit with one still open
// races Phoenix's phx_close teardown into mutual recursion (RangeError: Maximum call
// stack size exceeded). Disconnect them in an orderly fashion before the exit backstop.
async function disconnectRealtime() {
  try {
    await supabase.removeAllChannels();
    await supabase.realtime.disconnect();
  } catch { /* best-effort — never block exit on teardown */ }
}

async function flagEnabled() {
  const { data } = await supabase
    .from('leo_feature_flags')
    .select('is_enabled')
    .eq('flag_key', CANARY_FLAG)
    .maybeSingle();
  return data?.is_enabled === true;
}

/** Idempotent find-or-create of THE canary venture. */
async function provisionCanary() {
  const { data: existing } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, is_demo')
    .eq('is_demo', true)
    .filter('metadata->>canary_key', 'eq', CANARY_KEY)
    .maybeSingle();
  if (existing) return { venture: existing, created: false };

  const { data: created, error } = await supabase
    .from('ventures')
    .insert({
      name: 'Canary Venture Probe',
      problem_statement: 'Synthetic SRE canary: scheduled isolated pipeline probe (SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001). Not a real venture.',
      origin_type: 'manual',
      is_demo: true,
      metadata: {
        canary: true,
        canary_key: CANARY_KEY,
        created_by_sd: 'SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001',
        // Stage 1 hydrates from ventures.metadata.stage_zero (the orchestrator's
        // documented fallback when no Stage 0 artifact exists). The canary gets
        // a fixed synthetic synthesis so Stage 1 onward exercises the REAL
        // machinery deterministically.
        //
        // QF-20260701-201: the canary's probe environment has no cloud LLM API
        // key, so stage-01-hydration.js's LLM call returns a placeholder and
        // falls back to reading synthesis.description / .reframedProblem /
        // .valueProp / .targetMarket (camelCase). Those keys must be present
        // here (alongside the original narrative fields) or Stage 1 hydrates
        // 4 empty fields and Stage 2's pre-check blocks.
        stage_zero: {
          intent: 'Probe the venture-factory stage machinery end to end on a schedule.',
          reframed_problem: 'Stage pipeline regressions (config drift, RPC failures, renderer crashes, contract mismatches) are discovered reactively by real ventures instead of proactively by synthetic monitoring.',
          reframedProblem: 'Stage pipeline regressions (config drift, RPC failures, renderer crashes, contract mismatches) are discovered reactively by real ventures instead of proactively by synthetic monitoring.',
          synthesis: 'A synthetic, permanently-isolated canary venture is driven through every feasible lifecycle stage weekly. Each stage transition is a probe assertion; failures alert the coordinator before any real venture encounters the regression.',
          description: 'A synthetic, permanently-isolated canary venture is driven through every feasible lifecycle stage weekly to probe the venture-factory stage machinery end to end, so pipeline regressions surface before any real venture encounters them.',
          target_user: 'EHG platform operators and the fleet coordinator',
          targetMarket: 'EHG platform operators and the fleet coordinator',
          value_hypothesis: 'Proactive detection of stage-machinery regressions reduces venture-blocking incidents to near zero.',
          valueProp: 'Proactive detection of stage-machinery regressions reduces venture-blocking incidents to near zero.',
          constraints: ['fully isolated (is_demo)', 'net-zero artifacts per run', 'no external service calls (stages 18/19/23-26 skipped)'],
          source: 'synthetic-canary-fixture',
        },
      },
    })
    .select('id, name, current_lifecycle_stage, is_demo')
    .single();
  if (error) throw new Error(`canary provisioning failed: ${error.message}`);
  return { venture: created, created: true };
}

/** Approve pending canary decisions through the EXISTING flow, recorded. */
async function approveCanaryDecisions(ventureId) {
  const { data: pending } = await supabase
    .from('chairman_decisions')
    .select('id, lifecycle_stage')
    .eq('venture_id', ventureId)
    .eq('status', 'pending');
  let approved = 0;
  for (const d of pending || []) {
    const { error } = await supabase
      .from('chairman_decisions')
      .update({
        status: 'approved',
        decision: 'continue',
        rationale: 'canary-auto-policy: probe tests the machine, not the judgment (SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001; recorded override, excludable via ventures.is_demo join)',
        decided_by: 'canary-probe',
      })
      .eq('id', d.id)
      .eq('status', 'pending');
    if (!error) approved++;
  }
  return approved;
}

/** Count rows tied to the canary venture in run-affected tables (net-zero audit). */
async function countCanaryRows(ventureId) {
  const counts = {};
  for (const table of ['stage_executions', 'venture_artifacts', 'chairman_decisions']) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('venture_id', ventureId);
    counts[table] = count ?? 0;
  }
  return counts;
}

/** Reap rows created during this run (the venture itself always persists). */
async function teardownRunRows(ventureId, sinceIso) {
  const reaped = {};
  for (const table of ['stage_executions', 'venture_artifacts', 'chairman_decisions']) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('venture_id', ventureId)
      .gte('created_at', sinceIso)
      .select('id');
    reaped[table] = error ? `error: ${error.message}` : (data?.length ?? 0);
  }
  return reaped;
}

/** File ONE deduped alert per failed stage per UTC day. */
async function fileAlert(stageResult, runId, ventureId, now) {
  const dedup = alertDedupKey(stageResult.stage, now);
  const { data: existing } = await supabase
    .from('session_coordination')
    .select('id')
    .filter('payload->>dedup_key', 'eq', dedup)
    .limit(1);
  if (existing && existing.length > 0) return { filed: false, dedup };

  const { error } = await supabase.from('session_coordination').insert({
    message_type: 'INFO',
    payload: {
      kind: 'canary_probe_alert',
      dedup_key: dedup,
      stage: stageResult.stage,
      run_id: runId,
      venture_id: ventureId,
      error: String(stageResult.error || '').slice(0, 500),
      sd: 'SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001',
    },
  });
  return { filed: !error, dedup, error: error?.message };
}

async function currentStage(ventureId) {
  const { data } = await supabase
    .from('ventures')
    .select('current_lifecycle_stage')
    .eq('id', ventureId)
    .single();
  return data?.current_lifecycle_stage ?? 0;
}

// ── main ─────────────────────────────────────────────────────────────────────
const startedAt = new Date();
const runId = buildRunId(startedAt, randomUUID().slice(0, 8));

const admission = probeAdmission({ flagEnabled: await flagEnabled(), forceLocal: FORCE_LOCAL });
if (!admission.allowed) {
  console.error(`canary-probe: refused — ${admission.reason}`);
  await disconnectRealtime();
  await armCliTeardown(2); // SWEEP-CLI-EXIT-001 pattern: drain or backstop, never hang
} else {
  log(`🐤 canary probe ${runId} (admission: ${admission.reason}; max-stages ${MAX_STAGES}; ${TEARDOWN ? 'teardown' : 'keep'})`);

  const { venture, created } = await provisionCanary();
  log(`   venture ${venture.id} (${created ? 'created' : 'reused'}; is_demo=${venture.is_demo}; stage ${venture.current_lifecycle_stage ?? 0})`);

  // Self-heal the orchestrator state at run start: the canary venture is
  // exclusively probe-driven, so any non-idle state is residue from a prior
  // (killed/failed) run — reset it so acquireProcessingLock can succeed.
  const { data: pre } = await supabase
    .from('ventures').select('orchestrator_state').eq('id', venture.id).single();
  if (pre?.orchestrator_state && pre.orchestrator_state !== 'idle') {
    log(`   self-heal: orchestrator_state '${pre.orchestrator_state}' → 'idle' (probe owns this venture exclusively)`);
    await supabase.from('ventures')
      .update({ orchestrator_state: 'idle', orchestrator_lock_id: null, orchestrator_lock_acquired_at: null })
      .eq('id', venture.id);
  }

  // Full-pass determinism: each run starts from stage 1 (the venture persists
  // across runs but its progress does not — every scheduled run is a complete
  // probe of the feasible range). --no-reset continues from the current stage.
  if (!args.includes('--no-reset') && (venture.current_lifecycle_stage ?? 0) > 1) {
    log(`   reset: stage ${venture.current_lifecycle_stage} → 1 (deterministic full pass; --no-reset to continue instead)`);
    await supabase.from('ventures')
      .update({ current_lifecycle_stage: 1 })
      .eq('id', venture.id);
  }

  const preCounts = await countCanaryRows(venture.id);
  const startStage = await currentStage(venture.id);
  const stageResults = [];
  const seenStages = new Set();

  const { StageExecutionWorker } = await import('../../lib/eva/stage-execution-worker.js');
  const worker = new StageExecutionWorker({
    supabase,
    logger: AS_JSON ? { log() {}, warn() {}, error() {} } : console,
    maxRetries: 1,
    gateTimeoutMs: 5000, // never hang on a gate — the probe approves then re-drives
  });

  let stage = startStage;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const act = nextAction(Math.max(stage, 1), MAX_STAGES);
    if (act.action === 'done') break;
    if (act.action === 'external_skip') {
      stageResults.push({ stage: act.stage, status: STAGE_STATUS.EXTERNAL_SKIP, duration_ms: null });
      log(`   stage ${act.stage}: external_skip (hard external dependency)`);
      break; // frontier reached — later stages are unreachable without it
    }

    // Drive (bounded): the worker advances until a boundary/block/fail.
    const driveStart = new Date().toISOString();
    try {
      await Promise.race([
        worker.processOneStage(venture.id),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`stage drive exceeded ${STAGE_TIMEOUT_MS}ms`)), STAGE_TIMEOUT_MS).unref?.()),
      ]);
    } catch (e) {
      stageResults.push({ stage, status: STAGE_STATUS.FAIL, duration_ms: null, error: e.message });
      log(`   stage ${stage}: FAIL (${e.message})`);
      break;
    }

    // Classify what the machinery recorded since this drive.
    const { data: execRows } = await supabase
      .from('stage_executions')
      .select('lifecycle_stage, status, started_at, completed_at, error_message')
      .eq('venture_id', venture.id)
      .gte('created_at', driveStart)
      .order('lifecycle_stage', { ascending: true });
    for (const row of execRows || []) {
      if (seenStages.has(row.lifecycle_stage)) continue;
      seenStages.add(row.lifecycle_stage);
      const result = classifyExecutionRow(row);
      stageResults.push(result);
      log(`   stage ${result.stage}: ${result.status}${result.error ? ` (${result.error})` : ''}${result.duration_ms != null ? ` ${result.duration_ms}ms` : ''}`);
    }

    // Approve any canary decisions the drive created, then continue.
    const approved = await approveCanaryDecisions(venture.id);
    if (approved > 0) log(`   approved ${approved} canary decision(s) under the recorded policy`);

    const newStage = await currentStage(venture.id);
    const hardFail = stageResults.some(r => r.status === STAGE_STATUS.FAIL);
    if (hardFail) break;
    if (newStage === stage && approved === 0) {
      // No progress and nothing to approve — blocked.
      if (!seenStages.has(newStage)) {
        stageResults.push({ stage: newStage, status: STAGE_STATUS.BLOCKED, duration_ms: null, error: 'no progress (worker boundary or unresolved gate)' });
      }
      break;
    }
    stage = newStage;
  }

  // Alerts for failures (deduped per stage per day).
  const alerts = [];
  for (const r of stageResults.filter(x => x.status === STAGE_STATUS.FAIL)) {
    alerts.push(await fileAlert(r, runId, venture.id, new Date()));
  }

  // Net-zero teardown (default) — the venture itself persists.
  let rowDelta = null;
  if (TEARDOWN) {
    const reaped = await teardownRunRows(venture.id, startedAt.toISOString());
    const postCounts = await countCanaryRows(venture.id);
    rowDelta = {};
    for (const t of Object.keys(preCounts)) rowDelta[t] = (postCounts[t] ?? 0) - (preCounts[t] ?? 0);
    log(`   teardown: reaped ${JSON.stringify(reaped)} | row delta vs pre-run ${JSON.stringify(rowDelta)}`);
  }

  const endStage = await currentStage(venture.id);
  const report = buildRunReport({
    runId, startedAt, endedAt: new Date(), startStage, endStage,
    stageResults, maxStage: MAX_STAGES, rowDelta,
  });
  report.alerts = alerts;

  if (AS_JSON) console.log(JSON.stringify(report, null, 1));
  else {
    log(`\n🐤 canary probe ${report.outcome}: ${report.summary.passed} pass / ${report.summary.failed} fail / ${report.summary.blocked} blocked / ${report.summary.external_skipped} external_skip (stages ${startStage}→${endStage})`);
  }
  // The StageExecutionWorker holds heartbeats/subscriptions that block a
  // natural drain — arm the SWEEP-CLI-EXIT-001 teardown (undici close +
  // unref'd backstop) so the probe can never ride to an external SIGTERM.
  await disconnectRealtime();
  await armCliTeardown(report.outcome === 'FAIL' ? 1 : 0);
}
