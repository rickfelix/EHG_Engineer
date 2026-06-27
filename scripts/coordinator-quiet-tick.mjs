#!/usr/bin/env node
/**
 * coordinator-quiet-tick.mjs — the coordinator hibernation aggregator
 * (SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001, FR-1/FR-4/FR-5/FR-6).
 *
 * ONE process that composes the EXISTING modular coordinator cores into a single
 * fail-soft tick, emits ONE summary line, and self-paces its own next wake —
 * replacing the N separate fixed crons (~37/hr -> ~4-6/hr) during quiescence.
 *
 * Reuse, do not rewrite: each core is the existing, tested CLI script, run
 * fail-soft via runCoresFailSoft (a throw/non-zero exit is logged + the tick
 * continues). Mode is sourced from lib/coordinator/fleet-quiescence.cjs
 * (assessFleetActivity) — QUIESCENT skips the expensive cores
 * (forecast/backlog/audit), ACTIVE runs the full set.
 *
 * Output ends with a single QUIET_TICK= line carrying the recommended
 * ScheduleWakeup delay so the calling /loop session can self-pace (FR-5/FR-6).
 *
 * Usage: node scripts/coordinator-quiet-tick.mjs [--json]
 */
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { decideCadence, detectSalientDelta, runCoresFailSoft } = require('../lib/coordinator/quiet-tick.cjs');

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LAST_STATE_FILE = join(REPO_ROOT, '.coord-quiet-tick-last.json');
const COORD_PARTY_OFFSET_S = 0; // coordinator parks at the base offset; Adam phases at +420 (FR-5).

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return createClient(url, key);
}

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * The cores this tick folds, with the cron each one replaces at operator cutover.
 * `quiescentSkip` = the core is suppressed in QUIESCENT mode (expensive, no value
 * when nothing is moving). `safety` cores always run (claim-reaping / inbox arrival).
 * Exported so the loop-parity test proves nothing is silently dropped when the
 * STANDARD_LOOPS cutover removes the corresponding separate crons.
 */
export const COMPOSED_CORES = [
  { key: 'sweep', script: 'stale-session-sweep.cjs', args: ['scripts/stale-session-sweep.cjs'], quiescentSkip: false, safety: true },
  { key: 'inbox', script: 'fleet-dashboard.cjs', args: ['scripts/fleet-dashboard.cjs', 'inbox'], quiescentSkip: false, safety: true },
  { key: 'charter-audit', script: 'coordinator-charter-audit.mjs', args: ['scripts/coordinator-charter-audit.mjs'], quiescentSkip: true },
  { key: 'capacity-forecast', script: 'coordinator-capacity-forecast.mjs', args: ['scripts/coordinator-capacity-forecast.mjs', '--dispatch'], quiescentSkip: true },
  { key: 'backlog-rank', script: 'coordinator-backlog-rank.mjs', args: ['scripts/coordinator-backlog-rank.mjs'], quiescentSkip: true },
  { key: 'audit', script: 'coordinator-audit.mjs', args: ['scripts/coordinator-audit.mjs'], quiescentSkip: true },
];

/** Build the fail-soft core list for the current mode (quiescent skips the expensive cores). */
export function buildCores(quiescent) {
  return COMPOSED_CORES.map((c) => scriptCore(c.key, c.args, { skip: quiescent && c.quiescentSkip }));
}

/** A core that shells the existing tested CLI script, fail-soft. */
function scriptCore(key, args, { skip = false } = {}) {
  return {
    key,
    skip,
    run: async () => {
      // --dry-run composes + lists WITHOUT executing the (side-effectful) cores,
      // so the tick can be smoke-tested without reaping claims / dispatching.
      if (DRY_RUN) return 'dry';
      const { stdout } = await execFileAsync('node', args, { cwd: REPO_ROOT, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
      const tail = String(stdout || '').trim().split('\n').slice(-1)[0] || 'ok';
      return tail.slice(0, 100);
    },
  };
}

/** Compute the salient state used for FR-4 cross-party no-delta suppression. */
async function readSalientState(sb) {
  const state = { beltZero: true, openSignalCount: 0, venture1State: null };
  try {
    const { data: claimable } = await sb
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft');
    // head+count returns count on the response; fall back to length if absent.
    state.beltZero = !(claimable && claimable.length > 0);
  } catch { /* fail-soft: leave default */ }
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: sigs } = await sb
      .from('session_coordination')
      .select('id')
      .not('payload->>signal_type', 'is', null)
      .is('acknowledged_at', null)
      .gte('created_at', since);
    state.openSignalCount = (sigs || []).length;
  } catch { /* fail-soft */ }
  return state;
}

function loadLastState() {
  try { return JSON.parse(readFileSync(LAST_STATE_FILE, 'utf8')); } catch { return null; }
}
function saveLastState(s) {
  try { writeFileSync(LAST_STATE_FILE, JSON.stringify(s)); } catch { /* fail-soft: never block the tick */ }
}

async function main() {
  const asJson = process.argv.includes('--json');
  const sb = makeClient();

  // FR-5: mode decision from the canonical quiescence gate (do not re-derive).
  let quiescent = false;
  let modeReason = 'assume-active';
  try {
    const q = await assessFleetActivity(sb, {});
    quiescent = q.quiescent === true;
    modeReason = q.reason;
  } catch (e) {
    quiescent = false; // fail-open to ACTIVE — never silence the fleet on a query error.
    modeReason = 'assess_error_fail_active: ' + (e && e.message);
  }

  // FR-1: compose existing cores. QUIESCENT -> skip the expensive cores; always
  // run the cheap safety set (inbox arrival + stale-sweep). ACTIVE -> full set.
  const tick = await runCoresFailSoft(buildCores(quiescent));

  // FR-4: cross-party no-delta ping suppression.
  const salient = await readSalientState(sb);
  const delta = detectSalientDelta(loadLastState(), salient);
  saveLastState(salient);

  // FR-5/FR-6: self-paced next wake (capped at 15min when quiescent, never 300s).
  const delaySeconds = decideCadence({ quiescent, partyOffsetS: COORD_PARTY_OFFSET_S });

  const result = {
    mode: quiescent ? 'QUIESCENT' : 'ACTIVE',
    modeReason,
    cores: tick.summary,
    failedCount: tick.failedCount,
    skippedCount: tick.skippedCount,
    crossPartyPing: delta.changed,
    pingFields: delta.fields,
    nextWakeSeconds: delaySeconds,
  };

  if (asJson) {
    console.log(JSON.stringify(result));
  } else {
    // ONE summary line for the whole tick.
    console.log(
      `QUIET_TICK=coordinator mode=${result.mode} cores=[${tick.summary}] ` +
      `fail=${tick.failedCount} skip=${tick.skippedCount} ` +
      `ping=${delta.changed ? delta.fields.join(',') : 'suppressed'} ` +
      `nextWakeSeconds=${delaySeconds} :: ${modeReason}`
    );
    if (delta.changed) {
      console.log(`QUIET_TICK_PING=coordinator->adam reason=${delta.fields.join(',')} (real delta — emit a prompt cross-party ping)`);
    }
  }
  return result;
}

// Only run the tick when invoked directly — importing for tests must not exec.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('QUIET_TICK_ERROR=coordinator', e && e.message ? e.message : e);
    process.exit(1);
  });
}
