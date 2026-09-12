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
const { terminalSessionUpdate } = require('../lib/fleet/terminal-session-update.cjs');

const TAG = '[seat-reconcile]';

export function isSeatReconcileEnabled(env = process.env) {
  return env.FLEET_SEAT_RECONCILE_ENABLED === 'on';
}

// QF-20260912-175 (c): no sanctioned writer existed to REVERSE an incorrectly (or now stale-ly)
// released seat back to a live status — only this reconciler's own markReleased() and the
// cancel-sd.js / release-claim-both-surfaces.mjs release paths this QF fixes. 10min mirrors the
// same-file MIN_ACTIVITY_SAMPLE_GAP_MS heartbeat-staleness horizon used to classify a seat dead.
export const REINSTATE_MAX_HEARTBEAT_AGE_MS = 10 * 60 * 1000;

/**
 * Reverse a claude_sessions row that was retired to 'released' while its process was actually
 * still alive (or has since restarted with the SAME pid — an edge case narrow enough not to
 * special-case). REFUSES unless BOTH the heartbeat is fresh AND the pid is verifiably a live
 * claude.exe process — this must never be able to revive a genuinely dead seat.
 * @returns {{ok: boolean, sessionId: string, reason?: string, targetStatus?: string}}
 */
export async function reinstateSeat(supabase, sessionId, opts = {}) {
  const { reason, by = 'operator', probePid = pidIsClaude, now = () => Date.now() } = opts;
  if (!sessionId) return { ok: false, sessionId, reason: 'sessionId is required' };
  if (!reason) return { ok: false, sessionId, reason: 'reason is required — an unattributed reinstate is refused' };

  const { data: row, error: readErr } = await supabase
    .from('claude_sessions')
    .select('session_id, pid, status, heartbeat_at, sd_key, metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (readErr || !row) return { ok: false, sessionId, reason: readErr?.message || 'session not found' };
  if (row.status !== 'released') return { ok: false, sessionId, reason: `status is '${row.status}', not 'released' — nothing to reinstate` };

  const heartbeatAgeMs = row.heartbeat_at ? now() - new Date(row.heartbeat_at).getTime() : Infinity;
  if (heartbeatAgeMs > REINSTATE_MAX_HEARTBEAT_AGE_MS) {
    return { ok: false, sessionId, reason: `heartbeat too stale (${Math.round(heartbeatAgeMs / 60000)}min) — refusing to reinstate a possibly-dead seat` };
  }
  const pidVerdict = Number.isInteger(row.pid) ? probePid(row.pid) : 'PROBE_FAILED';
  if (pidVerdict !== 'MATCH') {
    return { ok: false, sessionId, reason: `pid not verifiably live (${pidVerdict}) — refusing to reinstate` };
  }

  const targetStatus = row.sd_key ? 'active' : 'idle';
  const { error: updErr } = await supabase
    .from('claude_sessions')
    .update({
      status: targetStatus,
      is_alive: true,
      released_at: null,
      released_reason: null,
      metadata: { ...(row.metadata || {}), reinstated_at: new Date().toISOString(), reinstated_by: by, reinstated_reason: reason },
    })
    .eq('session_id', sessionId)
    .eq('status', 'released'); // CAS: only reinstate a row still 'released' at write time
  if (updErr) return { ok: false, sessionId, reason: updErr.message };
  return { ok: true, sessionId, targetStatus };
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
        .update(terminalSessionUpdate('released', { released_reason: 'SEAT_RECONCILE_DEAD', released_at: new Date().toISOString() }))
        .eq('session_id', sessionId)
        .eq('status', 'active'); // CAS: only while still active
    },
  } = deps;

  const seats = await loadSeats();
  // QF-20260911-969: classifySeat awaits a MIN_ACTIVITY_SAMPLE_GAP_MS (10min) two-sample gap per
  // seat. A sequential for-loop therefore takes seats.length x 10min of WALL TIME to finish (the
  // measured "0 bytes after 25 minutes" was ~2.5 seats into a sequential queue, not a hang). Each
  // seat's sample is independent, so running them concurrently bounds the whole sweep to ~10min
  // regardless of fleet size.
  const gapMin = Math.round(MIN_ACTIVITY_SAMPLE_GAP_MS / 60000);
  onLog(`classifying ${seats.length} active seat(s) in parallel (~${gapMin}min wall time, not ${seats.length}x that)`);
  const results = await Promise.all(
    seats.map(async (s) => {
      const r = await classify(supabase, s, deps);
      onLog(`seat ${s.session_id} classified: dead=${r.dead}`);
      return r;
    }),
  );

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

  // QF-20260912-175 (c): --reinstate <session_id> --reason "<text>" is a separate mode from the
  // classify/release sweep above — always writes (no --reconcile/FLEET_SEAT_RECONCILE_ENABLED
  // gate), since reinstateSeat's own heartbeat+pid refusal is the safety, not an env flag.
  const reinstateIdx = process.argv.indexOf('--reinstate');
  if (reinstateIdx !== -1) {
    const sessionId = process.argv[reinstateIdx + 1];
    const reasonIdx = process.argv.indexOf('--reason');
    const reason = reasonIdx !== -1 ? process.argv[reasonIdx + 1] : null;
    const r = await reinstateSeat(createSupabaseServiceClient(), sessionId, { reason });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  const write = process.argv.includes('--reconcile');
  const out = await reconcileSeats(createSupabaseServiceClient(), { write });
  console.log(JSON.stringify({ ...out, results: undefined }, null, 2));
}

if (process.argv[1]?.endsWith('reconcile-seats.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
