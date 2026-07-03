#!/usr/bin/env node
/**
 * adam-quiet-tick.mjs — the Adam-side hibernation aggregator, hibernating IN SYNC
 * with the coordinator quiet-tick (SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001, FR-6).
 *
 * Collapses Adam's three recurring ticks (inbox-monitor + belt-countdown +
 * offer-help) into ONE fail-soft, mode-aware tick that shares the same cadence +
 * cross-party no-delta suppression mechanism as the coordinator tick. Adam PHASES
 * its park at COORD+420s so the two parties do not tap each other awake (FR-5).
 *
 * Reuse, do not rewrite: the inbox-monitor core runs the existing
 * scripts/adam-advisory.cjs inbox; belt-countdown + offer-help collapse into a
 * single salient-delta check (offer-help fires only on a real belt/venture delta,
 * never as a "still idle" status — FR-4).
 *
 * Usage: node scripts/adam-quiet-tick.mjs [--json]
 */
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import 'dotenv/config';
import { rehydrateBoard } from '../lib/adam/task-rehydrate.js';
import { checkAndAlertStalls } from '../lib/adam/stall-alert.js';
import { TABLE as TASK_LEDGER_TABLE } from '../lib/adam/task-ledger.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { decideCadence, detectSalientDelta, runCoresFailSoft } = require('../lib/coordinator/quiet-tick.cjs');

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LAST_STATE_FILE = join(REPO_ROOT, '.adam-quiet-tick-last.json');
const ADAM_PARTY_OFFSET_S = 420; // phase Adam's park 7min after the coordinator's (FR-5).

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return createClient(url, key);
}

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Adam folds three recurring ticks: inbox-monitor (a script core) plus
 * belt-countdown + offer-help (which collapse into the FR-4 salient-delta check,
 * not script cores). Exported so the parity test proves the inbox-monitor cron is
 * accounted for at cutover and the two agent-prompt loops are intentionally
 * delta-gated rather than dropped.
 */
export const COMPOSED_CORES = [
  { key: 'inbox-monitor', script: 'adam-advisory.cjs', args: ['scripts/adam-advisory.cjs', 'inbox', '--quiet'], quiescentSkip: false, safety: true },
];
export const DELTA_GATED_LOOPS = ['belt-countdown', 'offer-help'];

export function buildCores() {
  return COMPOSED_CORES.map((c) => scriptCore(c.key, c.args));
}

function scriptCore(key, args, { skip = false } = {}) {
  return {
    key,
    skip,
    run: async () => {
      if (DRY_RUN) return 'dry';
      const { stdout } = await execFileAsync('node', args, { cwd: REPO_ROOT, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
      const tail = String(stdout || '').trim().split('\n').slice(-1)[0] || 'ok';
      return tail.slice(0, 100);
    },
  };
}

// FR-1 (Child B): board<->reality RECONCILE on every tick, not only at /adam cold start
// (scripts/adam-startup-check.mjs's renderBoardRehydrate() calls rehydrateBoard() once, on cold
// start only). Reuses Child A's rehydrateBoard() as-is — no new upsert logic. rehydrateBoard()
// is already fail-soft per source internally; this wrapper adds an outer fail-soft layer so a
// synchronous throw (e.g. a malformed client) never aborts the tick.
export async function reconcileBoard(sb) {
  try {
    return await rehydrateBoard(sb);
  } catch (e) {
    return { threads: 0, parents: 0, sds: 0, awaited: 0, errors: [`reconcile failed: ${e && e.message}`] };
  }
}

// FR-2/FR-3 (Child B): critical-path (chairman-parent) task_ledger rows, fail-soft — a read
// error must never abort the tick. inFlightNextStep is derived from the row's OWN rolled-up
// status (lib/adam/task-ledger.js rollupParentStatus already writes 'in_progress' onto a parent
// while any child is still moving): status==='in_progress' -> treated as an intended hold (a
// known next step is itself progressing) so it never escalates even if this exact row's
// updated_at hasn't changed this tick; status==='blocked' (or anything else) is a genuine-stall
// candidate, matching the locked scope's noise-avoidance bias (default to NOT escalating when
// ambiguous, per stall-detector.js's classifyStaleness contract).
export async function readCriticalPathParents(sb) {
  try {
    // QF-20260703-229: pre-filter to OPEN nodes at the query — a done/cancelled parent has
    // stopped moving BY DEFINITION and is never a stall candidate. source_kind/source_ref are
    // read here too so checkAndAlertStalls can self-heal a sourced_sd node whose linked SD
    // already finished, instead of escalating a stale board row.
    const { data } = await sb
      .from(TASK_LEDGER_TABLE)
      .select('id, title, updated_at, status, source_kind, source_ref')
      .eq('tier', 'parent')
      .in('status', ['open', 'in_progress', 'blocked']);
    return (data || []).map((row) => ({ ...row, inFlightNextStep: row.status === 'in_progress' }));
  } catch {
    return [];
  }
}

async function readSalientState(sb) {
  const state = { beltZero: true, openSignalCount: 0, venture1State: null };
  try {
    const { data: claimable } = await sb
      .from('strategic_directives_v2')
      .select('id')
      .eq('status', 'draft')
      .limit(1);
    state.beltZero = !(claimable && claimable.length > 0);
  } catch { /* fail-soft */ }
  return state;
}

function loadLastState() {
  try { return JSON.parse(readFileSync(LAST_STATE_FILE, 'utf8')); } catch { return null; }
}
function saveLastState(s) {
  try { writeFileSync(LAST_STATE_FILE, JSON.stringify(s)); } catch { /* fail-soft */ }
}

async function main() {
  const asJson = process.argv.includes('--json');
  const sb = makeClient();

  let quiescent = false;
  let modeReason = 'assume-active';
  try {
    const q = await assessFleetActivity(sb, {});
    quiescent = q.quiescent === true;
    modeReason = q.reason;
  } catch (e) {
    quiescent = false;
    modeReason = 'assess_error_fail_active: ' + (e && e.message);
  }

  // FR-1: inbox-monitor always runs (cheap, catch /signal); the offer-help core
  // is delta-gated below, so only the inbox core needs composing here.
  const tick = await runCoresFailSoft(buildCores());

  // Child B FR-1: reconcile the durable task board against live reality every tick.
  const boardReconcile = await reconcileBoard(sb);

  const priorState = loadLastState() || {};
  // Back-compat: a state file written before this SD is a flat salient object, not
  // {salient, stallSnapshot} — treat it as the salient half and start with no stall snapshot.
  const priorSalient = priorState.salient !== undefined ? priorState.salient : priorState;
  const priorStallSnapshot = priorState.stallSnapshot || {};

  // Child B FR-2/FR-3: intended-hold-vs-genuine-stall check on critical-path parents every
  // tick. Only a genuine stall (per stall-detector.js's classifier) ever calls
  // recordPendingDecision — an intended hold or a quiet/hold period generates zero escalation.
  let stall = { snapshot: priorStallSnapshot, alerted: [] };
  try {
    const parents = await readCriticalPathParents(sb);
    stall = await checkAndAlertStalls(sb, parents, priorStallSnapshot, {});
  } catch (e) {
    stall = { snapshot: priorStallSnapshot, alerted: [], error: e && e.message };
  }

  // FR-4: belt-countdown + offer-help collapse to a salient-delta check — Adam only
  // reaches the coordinator on a real belt/venture delta, never a "still idle" status.
  const salient = await readSalientState(sb);
  const delta = detectSalientDelta(priorSalient, salient);
  saveLastState({ salient, stallSnapshot: stall.snapshot });

  const delaySeconds = decideCadence({ quiescent, partyOffsetS: ADAM_PARTY_OFFSET_S });

  const result = {
    party: 'adam',
    mode: quiescent ? 'QUIESCENT' : 'ACTIVE',
    modeReason,
    cores: tick.summary,
    failedCount: tick.failedCount,
    boardReconcile,
    stallAlerted: stall.alerted,
    crossPartyPing: delta.changed,
    pingFields: delta.fields,
    nextWakeSeconds: delaySeconds,
  };

  if (asJson) {
    console.log(JSON.stringify(result));
  } else {
    console.log(
      `QUIET_TICK=adam mode=${result.mode} cores=[${tick.summary}] ` +
      `fail=${tick.failedCount} ` +
      `reconcile=parents:${boardReconcile.parents},errors:${boardReconcile.errors.length} ` +
      `stalls=${stall.alerted.length} ` +
      `ping=${delta.changed ? delta.fields.join(',') : 'suppressed'} ` +
      `nextWakeSeconds=${delaySeconds} :: ${modeReason}`
    );
    if (delta.changed) {
      console.log(`QUIET_TICK_PING=adam->coordinator reason=${delta.fields.join(',')} (real delta — offer help / sourcing)`);
    }
    for (const a of stall.alerted) {
      console.log(`QUIET_TICK_STALL_ALERT=adam node=${a.id} title="${a.title}" escalated=${a.escalated}`);
    }
  }
  return result;
}

// SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-1): main() previously
// ran unconditionally at import time (no entry-point guard) — importing this module for its exports
// (reconcileBoard, buildCores, COMPOSED_CORES) would trigger a full tick execution, including a real
// subprocess spawn and process.exit(0), corrupting any importer/test. Guarded to match the established
// pattern (lib/utils/is-main-module.js) already used by sibling scripts.
if (isMainModule(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('QUIET_TICK_ERROR=adam', e && e.message ? e.message : e);
    process.exit(1);
  });
}
