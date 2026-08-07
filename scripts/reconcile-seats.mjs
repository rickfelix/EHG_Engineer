#!/usr/bin/env node
/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — SEAT reconciliation (the other half).
 *
 * FR-5 is "terminal reconciliation AND REAPING". The reaping half operates on CONSOLES and ships
 * in run-console-reaper.mjs. THIS is the reconciliation half, and it operates on SEATS — which is
 * the ONLY legitimate consumer of isSeatDead.
 *
 * WHY isSeatDead COULD NOT GO IN THE REAPER. An EXEC review flagged isSeatDead as unwired because
 * "the reaper reaps on descendant-count alone". The observation was right; the implied fix was
 * not. Both DEAD legs are properties of a SEAT — (A) the pid is ABSENT from a Win32_Process
 * CLAUDE.EXE name query, (B) last_tool_at IDENTICAL across two samples >= 10 min apart. A CONSOLE
 * has no last_tool_at and no claude.exe identity, so applying isSeatDead there would require
 * binding a console to a seat — which the SD forbids outright: "BINDING SEATS TO WINDOWS IS
 * IMPOSSIBLE TODAY and must not be attempted". Descendant-count is the correct and only
 * permissible console test. The two halves are separate on purpose.
 *
 * WHY THIS MUST RUN LOCALLY. The SD's complaint about existing scheduled reconciliation is that it
 * is "DB-to-DB-only BY DEPLOYMENT TARGET" — sweep-cron.yml:23 is ubuntu-latest, so leg A would
 * evaluate against a Linux runner that shares no process table with this host. A reconciler that
 * cannot see OS truth can only compare the database to itself. This one reads the real process
 * table, which is the entire point.
 *
 * REPORT-ONLY BY DEFAULT. Writing requires BOTH --reconcile AND
 * FLEET_SEAT_RECONCILE_ENABLED=on. It never kills anything — killing is operator-initiated and
 * lives in FR-2. The worst this can do with both gates open is mark an already-dead row released.
 */

import { createRequire } from 'node:module';
import { isSeatDead, MIN_ACTIVITY_SAMPLE_GAP_MS } from '../lib/fleet/console-reaper.mjs';
import { sampleToolActivityTwice } from '../lib/fleet/release-work-item.mjs';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const require = createRequire(import.meta.url);
const { pidIsClaude } = require('../lib/fleet/claimant-liveness.cjs');

const TAG = '[seat-reconcile]';

export function isSeatReconcileEnabled(env = process.env) {
  return env.FLEET_SEAT_RECONCILE_ENABLED === 'on';
}

/**
 * pidIsClaude is TRI-STATE ('MATCH' | 'NO_MATCH' | 'PROBE_FAILED'). Leg A asks "is the pid ABSENT
 * from the claude.exe image set", so:
 *   NO_MATCH     -> true  (absent — leg A satisfied)
 *   MATCH        -> false (a live claude.exe carries it)
 *   PROBE_FAILED -> null  (UNKNOWN, and isSeatDead treats a non-true as a failing leg)
 * PROBE_FAILED must NOT collapse to true: a broken probe would otherwise read as death, which is
 * the single most dangerous direction for this classifier.
 */
export function absentFromClaudeImages(probeResult) {
  if (probeResult === 'NO_MATCH') return true;
  if (probeResult === 'MATCH') return false;
  return null;
}

/**
 * Classify one seat. Pure apart from the injected probes.
 * @returns {{session_id, dead, legA, legB, why}}
 */
export async function classifySeat(supabase, session, deps = {}) {
  const {
    probePid = pidIsClaude,
    sample = sampleToolActivityTwice,
    intervalMs = MIN_ACTIVITY_SAMPLE_GAP_MS,
  } = deps;

  const legA = Number.isInteger(session.pid) ? absentFromClaudeImages(probePid(session.pid)) : null;
  const activitySample = await sample(supabase, session.session_id, { intervalMs });
  const verdict = isSeatDead({ absentFromClaudeImages: legA, activitySample });
  return { session_id: session.session_id, pid: session.pid ?? null, ...verdict };
}

export async function reconcileSeats(supabase, deps = {}) {
  const {
    env = process.env,
    write = false,
    onLog = (m) => console.log(`${TAG} ${m}`),
    loadSeats = async () => {
      const { data } = await supabase
        .from('claude_sessions')
        .select('session_id, pid, status, last_tool_at')
        .eq('status', 'active');
      return data || [];
    },
    classify = classifySeat,
    markReleased = async (sessionId) => {
      await supabase.from('claude_sessions')
        .update({ status: 'released', released_reason: 'SEAT_RECONCILE_DEAD', released_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('status', 'active'); // CAS: only while still active
    },
  } = deps;

  const seats = await loadSeats();
  const results = [];
  for (const s of seats) results.push(await classify(supabase, s, deps));

  const dead = results.filter((r) => r.dead);
  onLog(`examined ${results.length} active seat(s); ${dead.length} classify DEAD on both legs`);

  // BOTH gates. --reconcile alone is not enough, and neither is the flag: a reconciler that
  // mutates on one accidental switch is a reconciler nobody can safely leave scheduled.
  const mayWrite = write && isSeatReconcileEnabled(env);
  if (!mayWrite) {
    if (write) onLog('REPORT-ONLY: --reconcile was passed but FLEET_SEAT_RECONCILE_ENABLED is not on');
    return { examined: results.length, dead: dead.map((d) => d.session_id), wrote: 0, results, reportOnly: true };
  }

  let wrote = 0;
  for (const d of dead) {
    try { await markReleased(d.session_id); wrote += 1; }
    catch (err) { onLog(`WARN could not release ${d.session_id}: ${(err && err.message) || err}`); }
  }
  onLog(`reconciled ${wrote} seat(s) to released`);
  return { examined: results.length, dead: dead.map((d) => d.session_id), wrote, results, reportOnly: false };
}

async function main() {
  if (process.platform !== 'win32') {
    console.error(`${TAG} win32-only — leg A reads the Windows process table. On any other host this`);
    console.error(`${TAG} would compare the database to itself, which is the defect it exists to fix.`);
    process.exit(2);
  }
  const write = process.argv.includes('--reconcile');
  const out = await reconcileSeats(createSupabaseServiceClient(), { write });
  console.log(JSON.stringify({ ...out, results: undefined }, null, 2));
}

if (process.argv[1]?.endsWith('reconcile-seats.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
