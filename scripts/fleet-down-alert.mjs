// fleet-down-alert.mjs — SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001
//
// Chairman directive: when the fleet cold-dies to 0 workers, the operator currently can't be
// reached — claimable work sits stranded until a human happens to notice. This alert emails the
// operator on a SUSTAINED fleet-down with claimable work waiting.
//
// CRITICAL: this MUST run in always-on GitHub Actions (mirroring fleet-worker-pulse-cron.yml),
// NOT in the coordinator-audit path — that path DIES WITH THE COORDINATOR, exactly when the alert
// is needed most.
//
// Oscillation-robust (fleet-health is an AVERAGE-over-window, not point-in-time): a single
// active_count==0 dip self-recovers as /loop workers cycle (complete→park→self-claim). Only a
// SUSTAINED window (≈3 consecutive 15-min pulses == ~45min, all active==0) is a real outage.
// Edge-triggered dedup: fire ONCE when sustained-down is first confirmed (the pulse just before the
// window was still up, or there is no prior pulse); do NOT re-spam every 15 min during a long
// outage. The next alert only fires after the fleet recovers (a pulse>0) and goes down again.

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import path from 'path';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { getActiveCoordinatorId } from '../lib/coordinator/resolve.cjs';

const REQUIRED_CONSECUTIVE = Number(process.env.FLEET_DOWN_CONSECUTIVE_PULSES) > 0
  ? Number(process.env.FLEET_DOWN_CONSECUTIVE_PULSES)
  : 3;

// SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001 / FR-3: a coordinator's own death is a DISTINCT
// outage class from the worker-fleet-down case above (a live worker fleet with no coordinator
// still drains claimable work; the risk here is the coordinator's standing responsibilities —
// sweeps, gauges, dispatch-rank — silently going unattended for 43h+, per Solomon tri-role
// evidence). Deliberately a SEPARATE, independently-named constant from
// lib/coordinator/resolve.cjs's own internal STALE_THRESHOLD_MIN (10min) — that constant governs
// resolve.cjs's own multi-source resolution chain and has unrelated blast radius; changing it to
// serve this alert would silently affect every OTHER getActiveCoordinatorId() caller fleet-wide.
const DEAD_COORDINATOR_STALE_MIN = Number(process.env.DEAD_COORDINATOR_STALE_MIN) > 0
  ? Number(process.env.DEAD_COORDINATOR_STALE_MIN)
  : 15;
// This leg runs on fleet-down-alert-cron.yml's existing ~15min cadence (11,26,41,56 * * * *) —
// used only to size the edge-trigger window below, not to gate execution.
const DEAD_COORDINATOR_CRON_INTERVAL_MIN = Number(process.env.DEAD_COORDINATOR_CRON_INTERVAL_MIN) > 0
  ? Number(process.env.DEAD_COORDINATOR_CRON_INTERVAL_MIN)
  : 15;

/**
 * Pure decision: should we page the chairman that the coordinator itself is dead?
 *
 * No new table is introduced for edge-trigger dedup (TR-4: no schema changes). Instead this
 * derives dedup purely from elapsed time since the last known coordinator heartbeat: the alert
 * fires only on the tick where elapsed time FIRST crosses the staleness threshold (a window one
 * cron interval wide just past the threshold) — the next tick's elapsed time will already be past
 * that window, so it self-suppresses without persisted state, mirroring evaluateFleetDownAlert()'s
 * edge-triggered intent with a continuous-timestamp signal instead of discrete pulses.
 *
 * @param {Object} args
 * @param {string|null} args.lastCoordinatorHeartbeatAt - ISO timestamp of the most recently
 *   known coordinator session's heartbeat (from claude_sessions, regardless of whether that
 *   session is still the currently-elected coordinator), or null if none has ever been seen.
 * @param {Date} [args.now] - injectable clock for tests.
 * @param {number} [args.staleMin=DEAD_COORDINATOR_STALE_MIN]
 * @param {number} [args.cronIntervalMin=DEAD_COORDINATOR_CRON_INTERVAL_MIN]
 * @returns {{alert:boolean, reason:string, elapsedMin:number|null}}
 */
export function evaluateDeadCoordinatorAlert({
  lastCoordinatorHeartbeatAt,
  now = new Date(),
  staleMin = DEAD_COORDINATOR_STALE_MIN,
  cronIntervalMin = DEAD_COORDINATOR_CRON_INTERVAL_MIN,
} = {}) {
  if (!lastCoordinatorHeartbeatAt) {
    return { alert: false, reason: 'no coordinator has ever been seen — insufficient history to confirm a dead-coordinator outage', elapsedMin: null };
  }
  const last = new Date(lastCoordinatorHeartbeatAt);
  if (Number.isNaN(last.getTime())) {
    return { alert: false, reason: 'invalid lastCoordinatorHeartbeatAt', elapsedMin: null };
  }
  const nowTs = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const elapsedMin = (nowTs.getTime() - last.getTime()) / 60000;

  if (elapsedMin < staleMin) {
    return { alert: false, reason: `coordinator heartbeat is ${elapsedMin.toFixed(1)}min old, within the ${staleMin}min staleness window`, elapsedMin };
  }
  if (elapsedMin >= staleMin + cronIntervalMin) {
    return { alert: false, reason: `coordinator has been dead for ${elapsedMin.toFixed(1)}min — already past the first alertable tick (edge-trigger dedup)`, elapsedMin };
  }
  return {
    alert: true,
    reason: `DEAD COORDINATOR: no coordinator heartbeat for ${elapsedMin.toFixed(1)}min (>= ${staleMin}min threshold)`,
    elapsedMin,
  };
}

/**
 * Pure decision: should we email the operator that the fleet is sustained-down?
 *
 * @param {Object} args
 * @param {Array<{active_count:number}>} args.pulses - recent fleet_worker_pulse rows, NEWEST FIRST.
 * @param {number} args.claimableCount - count of claimable work items (SDs/QFs) waiting.
 * @param {number} [args.requiredConsecutive=3] - consecutive all-zero pulses that define sustained-down.
 * @returns {{alert:boolean, reason:string, consecutiveZero:number}}
 */
export function evaluateFleetDownAlert({ pulses, claimableCount, requiredConsecutive = 3 } = {}) {
  const rows = Array.isArray(pulses) ? pulses : [];
  const claimable = Number.isFinite(claimableCount) ? claimableCount : 0;
  const n = Number.isFinite(requiredConsecutive) && requiredConsecutive > 0 ? requiredConsecutive : 3;

  // Count the leading run of active==0 pulses (newest first).
  let consecutiveZero = 0;
  for (const p of rows) {
    if (p && Number(p.active_count) === 0) consecutiveZero += 1;
    else break;
  }

  if (claimable <= 0) {
    return { alert: false, reason: 'no claimable work — not an alert condition (do not alarm on an idle, empty queue)', consecutiveZero };
  }
  if (rows.length < n) {
    return { alert: false, reason: `insufficient pulse history (${rows.length} < ${n}) — cannot confirm a sustained outage`, consecutiveZero };
  }
  const windowAllZero = rows.slice(0, n).every((p) => p && Number(p.active_count) === 0);
  if (!windowAllZero) {
    return { alert: false, reason: `fleet active within the last ${n} pulses (not sustained-down)`, consecutiveZero };
  }
  // Edge-trigger dedup: suppress if the pulse just BEFORE the window was also 0 (already alerted on
  // this down-episode). Fire when the prior pulse was up (>0) or there is no prior pulse.
  const prior = rows[n];
  if (prior && Number(prior.active_count) === 0) {
    return { alert: false, reason: 'sustained-down already alerted earlier in this outage (edge-trigger dedup)', consecutiveZero };
  }
  return {
    alert: true,
    reason: `FLEET DOWN: ${n} consecutive pulses with active_count=0 (~${n * 15}min) and ${claimable} claimable item(s) stranded`,
    consecutiveZero,
  };
}

function buildEmail({ claimableCount, consecutiveZero, requiredConsecutive }) {
  const subject = `🛑 LEO fleet DOWN — 0 active workers, ${claimableCount} item(s) stranded`;
  const text = [
    `The LEO fleet has had 0 active workers across ${requiredConsecutive} consecutive pulses (~${requiredConsecutive * 15} min).`,
    `${claimableCount} claimable work item(s) are waiting and nothing is picking them up.`,
    '',
    'This alert runs in always-on GitHub Actions (independent of the coordinator), so it fires even',
    'when the coordinator itself is down. Start a worker / coordinator to drain the belt.',
  ].join('\n');
  const html = `<h2>🛑 LEO fleet DOWN</h2>
<p>The LEO fleet has had <strong>0 active workers</strong> across ${requiredConsecutive} consecutive pulses (~${requiredConsecutive * 15} min).</p>
<p><strong>${claimableCount}</strong> claimable work item(s) are waiting and nothing is picking them up.</p>
<p>This alert runs in always-on GitHub Actions (independent of the coordinator), so it fires even when the coordinator itself is down. Start a worker / coordinator to drain the belt.</p>`;
  return { subject, text, html };
}

async function checkWorkerFleetDown(db, DRY) {
  // Read one more than the window so the edge-trigger dedup can inspect the pulse before it.
  const { data: pulses, error: pErr } = await db
    .from('fleet_worker_pulse')
    .select('active_count, captured_at')
    .order('captured_at', { ascending: false })
    .limit(REQUIRED_CONSECUTIVE + 1);
  if (pErr) { console.error('[fleet-down-alert] pulse query failed:', pErr.message); return; }

  // Claimable-work-exists: count candidates the fleet could pick up right now.
  const { count: claimableCount, error: cErr } = await db
    .from('v_sd_next_candidates')
    .select('*', { count: 'exact', head: true });
  if (cErr) { console.error('[fleet-down-alert] claimable query failed:', cErr.message); return; }

  const verdict = evaluateFleetDownAlert({
    pulses: pulses || [],
    claimableCount: claimableCount || 0,
    requiredConsecutive: REQUIRED_CONSECUTIVE,
  });
  console.log(`[fleet-down-alert] ${verdict.alert ? 'ALERT' : 'no-alert'}: ${verdict.reason}`);

  if (!verdict.alert) return;

  const email = buildEmail({ claimableCount: claimableCount || 0, consecutiveZero: verdict.consecutiveZero, requiredConsecutive: REQUIRED_CONSECUTIVE });
  const to = process.env.CLAUDE_NOTIFY_EMAIL;
  if (DRY || !to) {
    console.log(`[fleet-down-alert]${DRY ? ' [DRY]' : ''} would email ${to || '(no CLAUDE_NOTIFY_EMAIL set)'}: ${email.subject}`);
    return;
  }
  const mod = await import(pathToFileURL(path.resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'LEO Fleet Reliability <onboarding@resend.dev>', to, subject: email.subject, html: email.html, text: email.text });
  console.log('[fleet-down-alert] email sent:', r?.id || JSON.stringify(r));
}

/** Pure: the chairman-SMS message payload for a dead-coordinator trip (TS-7). */
export function buildDeadCoordinatorMessage(verdict, now = new Date()) {
  return {
    type: 'status',
    body: `DEAD COORDINATOR: no active-coordinator heartbeat for ${verdict.elapsedMin.toFixed(0)}min. Coordinator standing duties (sweeps, gauges, dispatch-rank) are unattended. Start/restart a coordinator session.`,
    kind: 'dead_coordinator_alert',
    dedupeKey: `dead-coordinator-${now.toISOString().slice(0, 13)}`,
  };
}

// SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001 / FR-3: independent of checkWorkerFleetDown above —
// a live worker fleet does not imply a live coordinator (the coordinator's standing
// responsibilities — sweeps, gauges, dispatch-rank — are a distinct outage class). Deliberately
// kept as a SEPARATE function with its own query and its own edge-trigger state, so a bug in one
// predicate can never mask or entangle the other (TESTING gate finding, non-regression scenario).
//
// TS-7: sendChairmanSMSFn is injectable (defaults to the real dynamic import) so a test can assert
// the trip actually invokes the sender with the right message, not just that the pure predicate
// returns alert:true — mirrors the opts.fallbackSend injectable pattern already used by
// lib/comms/adam-outbound/chairman-sms-gate/index.js for the same testability reason.
export async function checkDeadCoordinator(db, DRY, sendChairmanSMSFn = null, now = new Date()) {
  // getActiveCoordinatorId is used here purely for the log line (console visibility into WHY
  // an alert fired); the actual trip decision below is entirely heartbeat-elapsed-time-driven.
  // Fail-open on any resolution hiccup (e.g. a minimal test double lacking the full resolution
  // chain's query surface) so a coordinator-ID lookup failure can never suppress the alert.
  let coordinatorId = null;
  try {
    coordinatorId = await getActiveCoordinatorId(db);
  } catch (e) {
    console.error('[dead-coordinator-alert] getActiveCoordinatorId failed (non-fatal, continuing):', e.message);
  }

  // Regardless of whether a coordinator is CURRENTLY elected, find the most recent heartbeat any
  // coordinator-flagged session has ever reported — this is what evaluateDeadCoordinatorAlert()'s
  // elapsed-time edge-trigger needs, and it degrades gracefully to "no alert" if none exists yet.
  const { data: rows, error } = await db
    .from('claude_sessions')
    .select('heartbeat_at')
    .eq('metadata->>is_coordinator', 'true')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  if (error) { console.error('[fleet-down-alert] coordinator-heartbeat query failed:', error.message); return; }

  const lastCoordinatorHeartbeatAt = rows && rows[0] ? rows[0].heartbeat_at : null;
  const verdict = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt, now });
  console.log(`[dead-coordinator-alert] activeCoordinatorId=${coordinatorId || 'null'} ${verdict.alert ? 'ALERT' : 'no-alert'}: ${verdict.reason}`);

  if (!verdict.alert) return;

  const message = buildDeadCoordinatorMessage(verdict, now);
  if (DRY) {
    console.log('[dead-coordinator-alert] [DRY] would page chairman via sendChairmanSMS:', message.body);
    return;
  }
  const send = sendChairmanSMSFn || (await import(pathToFileURL(path.resolve('lib/comms/adam-outbound/chairman-sms-gate/index.js')).href)).sendChairmanSMS;
  // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (E1/FR-3 completion): resolve the chairman's zone
  // before sending -- this dead-coordinator page is the second of 2 production sendChairmanSMS
  // callers testing-agent found still silently defaulting to ET. Dynamic import (same
  // reasoning as the sendChairmanSMSFn resolution above): keeps quiet-hours-extension.js out
  // of this file's static import graph. Never throws (fail-safe ET default).
  const { resolveChairmanZone } = await import(pathToFileURL(path.resolve('lib/comms/adam-outbound/quiet-hours-extension.js')).href);
  const { zone: chairmanZone } = await resolveChairmanZone(now);
  const r = await send(message, { now, chairmanZone });
  console.log('[dead-coordinator-alert] sendChairmanSMS result:', JSON.stringify(r));
}

/**
 * QF-20260803-882: run one notification arm in isolation, so no arm can suppress another.
 *
 * THE DEFECT THIS REPLACES: main() ran the arms as two bare awaits with nothing between them, and
 * the EMAIL arm ran FIRST. A throw from Resend — an outage, a rate limit, a malformed address —
 * aborted main() before the chairman pager ever fired. So the fleet-down pager, shipped as the
 * freeze remedy, had a path where the alarm simply does not go off, and that path was SILENT: a
 * failed run and a clean run were indistinguishable in the logs and in the exit code.
 *
 * A pager whose reliability depends on an unrelated third-party email call is not a pager.
 *
 * PURE-ish and exported for test: the two-sided acceptance (email throws → pager still fires; pager
 * throws → email still sends AND the failure is visible) cannot be asserted against a main() that
 * takes no seams.
 *
 * @param {string} name arm label used in the log line
 * @param {() => Promise<any>} fn the arm
 * @param {{log?:Function, error?:Function}} [io]
 * @returns {Promise<{name:string, ok:boolean, error?:string}>} never throws
 */
export async function runAlertArm(name, fn, io = {}) {
  const err = io.error || ((m) => console.error(m));
  try {
    await fn();
    return { name, ok: true };
  } catch (e) {
    // LOUD, not swallowed. A caught-and-ignored arm failure would recreate the silence this fixes.
    err(`[fleet-down-alert] ARM FAILED: ${name}: ${(e && e.message) || e}`);
    return { name, ok: false, error: (e && e.message) || String(e) };
  }
}

/**
 * QF-20260803-882: run every arm independently and report partial delivery.
 *
 * ORDER IS DELIBERATE — the chairman pager goes FIRST. Both arms are now isolated, so ordering can
 * no longer cause suppression; but if the process is killed mid-run (workflow timeout, runner
 * eviction) the arm that already fired should be the one that reaches a human.
 *
 * @returns {Promise<{results:Array, failed:Array}>}
 */
export async function runAlertArms(arms, io = {}) {
  const results = [];
  for (const [name, fn] of arms) results.push(await runAlertArm(name, fn, io));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    const err = io.error || ((m) => console.error(m));
    err(`[fleet-down-alert] PARTIAL DELIVERY: ${failed.length} of ${results.length} arm(s) failed `
      + `(${failed.map((f) => f.name).join(', ')}) — this alert did NOT fully fire.`);
  }
  return { results, failed };
}

async function main() {
  enforceCliSendGuard({ scriptName: 'scripts/fleet-down-alert.mjs', flags: [{ name: '--dry-run' }] });
  const DRY = !!process.env.FLEET_DOWN_ALERT_DRYRUN || process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[fleet-down-alert] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // QF-20260803-882: isolated arms, pager first. Previously two bare awaits — an email throw
  // suppressed the pager entirely and the run still looked clean.
  const { failed } = await runAlertArms([
    ['dead-coordinator-pager', () => checkDeadCoordinator(db, DRY)],
    ['worker-fleet-email', () => checkWorkerFleetDown(db, DRY)],
  ]);
  // A half-delivered alert must not exit 0. The workflow treating a partial page as success is the
  // same silence one layer up.
  if (failed.length) process.exitCode = 1;
}

// Run main() only as a CLI (guarded so tests can import the pure helper).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('[fleet-down-alert] fatal:', e.message); process.exit(1); });
}
