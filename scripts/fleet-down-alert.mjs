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

// SD-LEO-INFRA-FLEET-DEAD-MAN-001 / FR-1: a THIRD, independent outage signal alongside the two
// above. checkWorkerFleetDown reads fleet_worker_pulse; checkDeadCoordinator reads claude_sessions
// filtered to is_coordinator=true. Neither would notice if the pulse-writer cron itself silently
// died, or if the live incident's own root cause (no reliable off-host SMS retry — see FR-2) meant
// an outage went unpaged for 36h despite the fleet later self-recovering. This predicate is
// deliberately independent: it never reads fleet_worker_pulse at all.
const FLEET_DEAD_MAN_WINDOW_MIN = Number(process.env.FLEET_DEAD_MAN_WINDOW_MIN) > 0
  ? Number(process.env.FLEET_DEAD_MAN_WINDOW_MIN)
  : 120;

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

// DELIVERY CHANNEL (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-5, corrected): this arm emails the
// operator via Resend (buildEmail/sendEmail below) -- it does NOT send a chairman SMS. An earlier
// draft of that SD assumed all 3 arms shared one SMS channel and could "triple-page" the chairman;
// that premise was false (this arm's channel is email, a different recipient/medium entirely) and
// has been corrected. See the docblock above checkFleetDeadMan for the freeze-vs-dead-man division
// of labor this arm participates in (this is the clock-frozen-while-present signal).
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
 * Pure decision (SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-1): is the ENTIRE fleet — workers AND
 * coordinator alike — showing zero signs of life at all?
 *
 * DIVISION OF LABOR (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-5, corrected): this function is a
 * heartbeat-writer/host-death signal, NOT a "row absence" detector (an earlier draft of that SD said
 * rows vanish; they do not -- 13,110+ of them persist indefinitely). A frozen-but-heartbeating seat
 * (heartbeat_at stamped by a separate always-on timer, independent of actual work) keeps THIS
 * function reading alive regardless of last_tool_at -- which is exactly why the SEPARATE freeze/
 * pager chain (checkWorkerFleetDown below, via liveFleetWorkers/classifySeat) exists: it is the
 * clock-frozen-while-present signal this function structurally cannot see. Neither replaces the
 * other. This function is UNMODIFIED by FR-1/FR-2 of that SD; see checkPerHostFreeze/
 * evaluatePerHostFreezePredicate below for the new, structurally separate per-host companion.
 *
 * Two independent legs, BOTH required:
 *   Leg A: zero claude_sessions heartbeats (any role) in the trailing window.
 *   Leg B: zero SD/QF completions (strategic_directives_v2.status='completed') in the window.
 * Leg B alone false-positives on a live-but-stuck fleet (one long task, nothing finishing yet).
 * Requiring Leg A too means something has stopped even checking in, not merely stopped
 * finishing — a much stronger "genuinely nothing is running" signal, and independent of
 * whatever data source checkWorkerFleetDown/checkDeadCoordinator each rely on.
 *
 * No time-of-day gate: unlike the chairman's own SMS quiet-hours (a delivery-time concern
 * handled downstream by sendChairmanSMS), this fleet has no expected-inactive window — workers
 * loop continuously per the fleet-worker loop directive, so silence is alarm-worthy at any hour.
 *
 * @param {Object} args
 * @param {string|null} args.lastHeartbeatAt - ISO timestamp of the most recent claude_sessions
 *   heartbeat (any role), or null if none has ever been recorded.
 * @param {number} args.completionsInWindow - count of SD/QF completions in the trailing window.
 * @param {Date} [args.now]
 * @param {number} [args.windowMin=FLEET_DEAD_MAN_WINDOW_MIN]
 * @returns {{dead:boolean, reason:string}}
 */
export function evaluateFleetDeadManPredicate({
  lastHeartbeatAt,
  completionsInWindow,
  now = new Date(),
  windowMin = FLEET_DEAD_MAN_WINDOW_MIN,
} = {}) {
  const nowTs = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const completions = Number.isFinite(completionsInWindow) ? completionsInWindow : 0;

  if (completions > 0) {
    return { dead: false, reason: `${completions} completion(s) in the trailing ${windowMin}min — fleet is producing` };
  }
  if (!lastHeartbeatAt) {
    return { dead: true, reason: 'zero completions and no claude_sessions heartbeat has ever been recorded' };
  }
  const last = new Date(lastHeartbeatAt);
  if (Number.isNaN(last.getTime())) {
    return { dead: true, reason: 'zero completions and lastHeartbeatAt is unparseable — treating as no signal' };
  }
  const elapsedMin = (nowTs.getTime() - last.getTime()) / 60000;
  if (elapsedMin < windowMin) {
    return { dead: false, reason: `zero completions but a heartbeat is ${elapsedMin.toFixed(1)}min old — within the ${windowMin}min window` };
  }
  return { dead: true, reason: `zero completions AND no heartbeat for ${elapsedMin.toFixed(1)}min (>= ${windowMin}min)` };
}

/** Pure: the chairman-SMS message payload for a fleet-dead-man trip (mirrors buildDeadCoordinatorMessage). */
export function buildFleetDeadManMessage(verdict, now = new Date()) {
  return {
    type: 'status',
    body: `FLEET DEAD-MAN: zero heartbeats and zero SD/QF completions for ${FLEET_DEAD_MAN_WINDOW_MIN}min. ${verdict.reason}. Start/restart a worker or coordinator session.`,
    kind: 'fleet_dead_man_alert',
    dedupeKey: `fleet-dead-man-${now.toISOString().slice(0, 13)}`,
  };
}

// SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2: the Solomon GROUP-BY-HOST binding constraint
// (SD-LEO-INFRA-FLEET-DEAD-MAN-001's own metadata.design_notes, never shipped) named "the dead-man
// predicate" specifically. evaluateFleetDeadManPredicate above cannot be made host-aware directly:
// its Leg B (completions) reads strategic_directives_v2, which carries NO hostname column and no
// reliably-populated session FK (measured: active_session_id populated on 1 of 500 completed SDs,
// claiming_session_id on 0) -- Leg B is structurally un-attributable to a host. Worse, Leg B's
// existing `if (completions > 0) return {dead:false}` short-circuits BEFORE Leg A is ever read, so a
// naive "group both legs by host" would let a completion on ANY host mask a real freeze on every
// OTHER host -- live-corroborated: all 5 most-recent fleet_dead_man_verdict rows read alive via this
// exact short-circuit. THE FIX: a separate, additive, Leg-A-ONLY check below -- it never reads
// completions and never touches evaluateFleetDeadManPredicate, which stays exactly as shipped and
// keeps covering the class it was built for (fleet-wide silence, not per-host).
//
// HOST ELIGIBILITY (measured live, 2026-08-21, full 13,110-row population): 12 distinct hostnames.
// Legion-Laptop's most recent heartbeat is live (seconds old); every other hostname -- 2 test
// fixtures ("test-host", "test"), 4 ephemeral runnervm* GitHub Actions runners (a new one per cron
// run), 2 CI-run-named hosts ("execute-stop-integration", "team-banner-integration", "integration-
// test" -- none matching a runnervm*/"test" pattern), and one unrecognized single-row host ("h") --
// is stale by WEEKS TO MONTHS (newest of the 11 non-live hosts: 2026-07-17, over a month before this
// comment was written). A single recency gate on the query itself (only consider hosts with at
// least one heartbeat inside HOST_ELIGIBILITY_WINDOW_MIN) correctly excludes every one of them
// without any pattern-matching or hardcoded denylist -- simpler and more robust than name-based
// exclusion, which would need updating for every new ephemeral/fixture hostname that appears (as
// the un-pattern-matched "execute-stop-integration"/"h" cases already demonstrate). NULL hostname
// rows (81 of them, also weeks-stale) are excluded explicitly at the query -- grouping NULLs
// together would otherwise collapse many small, unrelated registrations into one artificially-
// populated "host".
// WINDOW SIZE, REVISED (TESTING sub-agent finding H1, EXEC-TO-PLAN review): an unbounded/large-
// windowed read of claude_sessions is NOT safe against a single busy host's own row volume --
// Legion-Laptop heartbeats roughly every 30s, so a 24h window could alone contribute ~2,880 rows,
// well past PostgREST's default 1000-row page cap (measured live). Ordered newest-first, a capped
// page would keep the busiest host's rows and could silently push a quieter-but-real second host's
// rows out entirely -- in the one query whose job is finding quiet hosts. Shrunk to 4h: still 2x
// FLEET_DEAD_MAN_WINDOW_MIN (a host that went quiet within the dead-man window is still correctly
// evaluated, just correctly judged dead if truly silent), while bounding one host's worst-case
// contribution to ~480 rows at the same cadence -- comfortable headroom under HOST_QUERY_ROW_LIMIT
// even with several concurrent hosts (the near-term cloud-pilot scenario this FR exists for).
const HOST_ELIGIBILITY_WINDOW_MIN = Number(process.env.HOST_ELIGIBILITY_WINDOW_MIN) > 0
  ? Number(process.env.HOST_ELIGIBILITY_WINDOW_MIN)
  : 4 * 60;
// Explicit, generous bound (mirrors lib/fleet/stuck-seat-population.cjs's POPULATION_ROW_LIMIT
// pattern) so truncation is a loud, detectable event rather than a silent PostgREST default.
const HOST_QUERY_ROW_LIMIT = Number(process.env.HOST_QUERY_ROW_LIMIT) > 0
  ? Number(process.env.HOST_QUERY_ROW_LIMIT)
  : 5000;
// SECURITY sub-agent finding (EXEC-TO-PLAN review, Finding 1): claude_sessions carries
// `FOR ALL TO anon USING (true) WITH CHECK (true)` (database/migrations/20251204_multi_session_
// coordination.sql:436) -- any anon-key holder can insert up to HOST_QUERY_ROW_LIMIT fabricated
// hostnames with a heartbeat_at inside the eligibility window and, on the tick those rows age past
// FLEET_DEAD_MAN_WINDOW_MIN, every OTHER alert arm in this file sends at most one SMS per run, but
// this per-host loop had no such bound -- it paged the chairman once per dead host, unbounded. This
// caps worst-case chairman-SMS volume from a single run to a small, humanly-plausible number: a
// real simultaneous multi-host outage in the near-term cloud-pilot deployment this FR targets is
// expected to be a handful of hosts, never thousands. Truncation is reported loudly (never silent),
// mirroring this file's own HOST_QUERY_ROW_LIMIT/POPULATION_ROW_LIMIT convention -- a host beyond
// the cap is NOT silently un-paged forever: it stays 'dead'+untransitioned in system_events and is
// picked up the next run once earlier hosts have recovered or an operator raises the cap.
const MAX_HOSTS_PAGED_PER_RUN = Number(process.env.MAX_HOSTS_PAGED_PER_RUN) > 0
  ? Number(process.env.MAX_HOSTS_PAGED_PER_RUN)
  : 5;
// Deep-tier /ship adversarial review, Finding 1 (independently verified): MAX_HOSTS_PAGED_PER_RUN
// above only bounds the DEAD branch of checkPerHostFreeze's loop -- every ALIVE host still gets an
// unconditional recordFleetDeadManVerdict call (1 read + 1 write to system_events), every run, with
// no cap at all. The same fabricated-hostname attack that motivated MAX_HOSTS_PAGED_PER_RUN (anon
// can INSERT into claude_sessions) applies here just as directly: up to HOST_QUERY_ROW_LIMIT (5000)
// fabricated "alive" hosts would cost up to 10,000 sequential Supabase round-trips and 5000 new
// system_events rows on a single ~15-minute cron tick -- no chairman-SMS spam (alive hosts never
// page), but real DB-write amplification and, more importantly, a real risk of the cron job itself
// running long enough to threaten a workflow timeout, which would jeopardize every OTHER arm in
// this same run (runAlertArm isolates FAILURES, not SLOWNESS). Bounds the WHOLE loop (dead + alive
// combined), independent of and larger than MAX_HOSTS_PAGED_PER_RUN, since legitimate recency-
// filtered eligibility (HOST_ELIGIBILITY_WINDOW_MIN=4h) is expected to surface at most a handful of
// real hosts -- see fetchEligibleHosts' own HOST_QUERY_ROW_LIMIT comment for the same "several
// concurrent hosts, never thousands" scoping this SD targets.
const MAX_HOSTS_PROCESSED_PER_RUN = Number(process.env.MAX_HOSTS_PROCESSED_PER_RUN) > 0
  ? Number(process.env.MAX_HOSTS_PROCESSED_PER_RUN)
  : 200;

/**
 * Pure decision (FR-2): is THIS HOST showing zero heartbeat signs of life within the window?
 * Leg-A-ONLY -- never reads completions, never shares state with evaluateFleetDeadManPredicate.
 *
 * @param {Object} args
 * @param {string} args.hostname
 * @param {string|null} args.lastHeartbeatAtForHost - most recent heartbeat_at among this host's sessions
 * @param {Date} [args.now]
 * @param {number} [args.windowMin=FLEET_DEAD_MAN_WINDOW_MIN]
 * @returns {{dead:boolean, reason:string}}
 */
export function evaluatePerHostFreezePredicate({
  hostname,
  lastHeartbeatAtForHost,
  now = new Date(),
  windowMin = FLEET_DEAD_MAN_WINDOW_MIN,
} = {}) {
  const nowTs = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  if (!lastHeartbeatAtForHost) {
    return { dead: true, reason: `host ${hostname}: no heartbeat recorded in the eligibility window` };
  }
  const last = new Date(lastHeartbeatAtForHost);
  if (Number.isNaN(last.getTime())) {
    return { dead: true, reason: `host ${hostname}: lastHeartbeatAtForHost unparseable -- treating as no signal` };
  }
  const elapsedMin = (nowTs.getTime() - last.getTime()) / 60000;
  if (elapsedMin < windowMin) {
    return { dead: false, reason: `host ${hostname}: heartbeat ${elapsedMin.toFixed(1)}min old -- within the ${windowMin}min window` };
  }
  return { dead: true, reason: `host ${hostname}: no heartbeat for ${elapsedMin.toFixed(1)}min (>= ${windowMin}min)` };
}

// SECURITY sub-agent finding (EXEC-TO-PLAN review, Finding 3, LOW): hostname is an unvalidated
// claude_sessions column value (claude_sessions carries permissive anon RLS -- see
// MAX_HOSTS_PAGED_PER_RUN's comment) interpolated into a chairman-facing SMS body. Not an injection
// vector (SMS bodies are inert text), but an unbounded value could pad or reshape the message in a
// way that reads as chairman-deceptive. chairman-sms-gate already fail-closes at 1600 chars
// (lib/comms/adam-outbound/rubric-engine/lint.js:15, DEFAULT_MAX_LEN) -- but that only guarantees
// the send is REJECTED past 1600, not that a shorter padded/reshaped body never reaches the
// chairman. Bound the WHOLE composed body here, tighter than that backstop and complementary to it.
// MUST truncate the FINAL composed string, not just the hostname substitution: verdict.reason
// (built by evaluatePerHostFreezePredicate) ALSO embeds the raw hostname a second time, so
// truncating only the first interpolation left the second one unbounded -- caught by this file's
// own direct test for this function, not assumed safe from the sub-agent's finding alone.
const MAX_MESSAGE_BODY_CHARS = 200;

/** Pure: the chairman-SMS message payload for a per-host freeze trip. */
export function buildPerHostFreezeMessage(hostname, verdict, now = new Date()) {
  const rawBody = `HOST DOWN: ${hostname} -- ${verdict.reason}. Start/restart a worker session on that host.`;
  const body = rawBody.length > MAX_MESSAGE_BODY_CHARS
    ? `${rawBody.slice(0, MAX_MESSAGE_BODY_CHARS)}...(truncated)`
    : rawBody;
  return {
    type: 'status',
    body,
    kind: 'fleet_dead_man_alert',
    // TR-6: reuses the existing dedupeKey namespace convention (dead-coordinator-<hour>,
    // fleet-dead-man-<hour>) rather than inventing new cross-arm coordination -- host-qualified so
    // two hosts' pages can never collide, and hour-bucketed so a persistent outage doesn't re-spam.
    // Deliberately keyed on the ORIGINAL hostname, not the truncated body: this key only needs to
    // be stable and collision-resistant per real host, never displayed, so truncation here would
    // just discard uniqueness for no benefit.
    dedupeKey: `fleet-dead-man-host-${hostname}-${now.toISOString().slice(0, 13)}`,
  };
}

const FLEET_DEAD_MAN_EVENT_TYPE = 'fleet_dead_man_verdict';
// Distinct event_type (not an optional `host` field on the existing type) so the per-host and
// global verdict populations can never cross-contaminate each other's edge-trigger dedup reads --
// no JSONB-path null-filtering subtlety to get wrong, no query change to the existing global path.
const FLEET_DEAD_MAN_PER_HOST_EVENT_TYPE = 'fleet_dead_man_verdict_per_host';

/**
 * FR-3 (observability) + FR-1's own edge-trigger dedup, combined: writes ONE verdict row every
 * run (never just on transition — an operator/gauge reviewing system_events needs to see this
 * check is actually running even when nothing changed), and returns whether THIS run's state
 * differs from the last recorded one so the caller can fire only on alive->dead transitions.
 *
 * Read-then-write, not transactionally atomic — acceptable because fleet-down-alert-cron.yml's
 * `concurrency: {group, cancel-in-progress: true}` guarantees this workflow never has two
 * invocations in flight at once, so two ticks are always strictly sequential.
 *
 * TS-11: wrapped so a system_events outage degrades to "no audit row for this tick", never to
 * "no page sent" — and fails OPEN on the transition question (treats an unreadable prior state
 * as a transition) rather than risk silently swallowing a real outage. This applies uniformly to
 * BOTH the read and the write below (adversarial-review finding, accepted trade-off, not a bug):
 * an isolated insert failure on an already-known-dead tick can force one spurious re-page instead
 * of the silent no-op the pre-hardening code produced. An occasional extra page during a
 * persistent, already-alerted outage is a far cheaper failure mode than the silence this SD exists
 * to close, so this function never tries to distinguish "read failed" from "write failed" for the
 * purpose of softening the fail-open default.
 *
 * @param {string|null} [host] - FR-3: when provided, scopes both the read and the write to this
 *   host's OWN row population (via FLEET_DEAD_MAN_PER_HOST_EVENT_TYPE + a host-filtered read), so
 *   two hosts' edge-trigger states can never clobber each other. Omitting it (the pre-existing
 *   global caller) is byte-identical to this function's pre-FR-3 behavior -- same event_type, same
 *   unfiltered "most recent row" read, same payload shape.
 * @returns {Promise<{transitioned:boolean}>}
 */
export async function recordFleetDeadManVerdict(db, verdict, host = null) {
  try {
    let query = db
      .from('system_events')
      .select('payload')
      .eq('event_type', host ? FLEET_DEAD_MAN_PER_HOST_EVENT_TYPE : FLEET_DEAD_MAN_EVENT_TYPE);
    if (host) query = query.eq('payload->>host', host);
    const { data: rows, error } = await query.order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    const lastState = rows && rows[0] ? rows[0].payload?.state : 'alive'; // no prior row => assume alive
    const nextState = verdict.dead ? 'dead' : 'alive';
    const transitioned = nextState !== lastState;
    const payload = { state: nextState, reason: verdict.reason, transitioned };
    if (host) payload.host = host;
    // TESTING sub-agent finding: supabase-js does not throw on a PostgREST-level rejection
    // (constraint/RLS) -- it resolves {data:null, error:{...}}. The insert's own result must be
    // checked explicitly, or a rejected write silently vanishes into this same try block without
    // ever reaching the catch below.
    const { error: insertErr } = await db.from('system_events').insert({
      event_type: host ? FLEET_DEAD_MAN_PER_HOST_EVENT_TYPE : FLEET_DEAD_MAN_EVENT_TYPE,
      actor_type: 'system',
      actor_role: host ? 'fleet-down-alert-per-host' : 'fleet-down-alert',
      payload,
    });
    if (insertErr) throw new Error(insertErr.message);
    return { transitioned };
  } catch (err) {
    console.error(`[fleet-dead-man]${host ? ` host=${host}` : ''} verdict recording failed (non-fatal, alert logic unaffected):`, err.message);
    return { transitioned: true };
  }
}

// SD-LEO-INFRA-FLEET-DEAD-MAN-001 / FR-1: third independent arm, same injectable-sender /
// injectable-clock shape as checkDeadCoordinator (TS-1/TS-2/TS-9 assert against a fake db +
// spy sender without touching real Twilio/Supabase).
export async function checkFleetDeadMan(db, DRY, sendChairmanSMSFn = null, now = new Date()) {
  // Column-name traps (TS-8): fleet_worker_pulse.captured_at and claude_sessions.heartbeat_at
  // are NOT interchangeable with created_at/updated_at/last_seen_at — confirmed against live
  // schema. strategic_directives_v2.status='completed' covers BOTH SDs and QFs: QF rows are
  // ordinary strategic_directives_v2 rows keyed by an "QF-..." sd_key, not a separate table.
  //
  // completion_date, NOT updated_at (adversarial-review finding, verified live): updated_at on
  // an already-completed row keeps moving for months afterward -- post-completion housekeeping
  // (quality_checked_at, wiring_validated, retro generation, one-off maintenance scripts) routinely
  // re-touches old completed rows. Measured live across 30 recently-updated completed SDs: drift
  // between completion_date and updated_at ranged from minutes to 2600+ minutes. Filtering on
  // updated_at would make Leg B's "zero completions" condition almost always false (some old row
  // is nearly always being housekept), silently defeating this predicate's entire purpose.
  const windowStartIso = new Date(now.getTime() - FLEET_DEAD_MAN_WINDOW_MIN * 60000).toISOString();

  // TESTING sub-agent finding: DESC ordering on a nullable column is NULLS FIRST in Postgres --
  // a NULL heartbeat_at row would sort ahead of every real timestamp and read as "no heartbeat
  // ever", which is wrong (rows with other non-null activity exist). Currently inert (0 of
  // 13k+ rows are null) but excluding nulls at the query makes it structurally impossible rather
  // than relying on that fact staying true.
  const { data: hbRows, error: hbErr } = await db
    .from('claude_sessions')
    .select('heartbeat_at')
    .not('heartbeat_at', 'is', null)
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  if (hbErr) { console.error('[fleet-dead-man] heartbeat query failed:', hbErr.message); return; }

  const { count: completionsInWindow, error: cErr } = await db
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completion_date', windowStartIso);
  if (cErr) { console.error('[fleet-dead-man] completions query failed:', cErr.message); return; }

  const lastHeartbeatAt = hbRows && hbRows[0] ? hbRows[0].heartbeat_at : null;
  const verdict = evaluateFleetDeadManPredicate({ lastHeartbeatAt, completionsInWindow: completionsInWindow || 0, now });
  const { transitioned } = await recordFleetDeadManVerdict(db, verdict);
  console.log(`[fleet-dead-man] ${verdict.dead ? 'DEAD' : 'alive'} (transitioned=${transitioned}): ${verdict.reason}`);

  if (!verdict.dead || !transitioned) return;

  const message = buildFleetDeadManMessage(verdict, now);
  if (DRY) {
    console.log('[fleet-dead-man] [DRY] would page chairman via sendChairmanSMS:', message.body);
    return;
  }
  const send = sendChairmanSMSFn || (await import(pathToFileURL(path.resolve('lib/comms/adam-outbound/chairman-sms-gate/index.js')).href)).sendChairmanSMS;
  const { resolveChairmanZone } = await import(pathToFileURL(path.resolve('lib/comms/adam-outbound/quiet-hours-extension.js')).href);
  const { zone: chairmanZone } = await resolveChairmanZone(now);
  const r = await send(message, { now, chairmanZone });
  console.log('[fleet-dead-man] sendChairmanSMS result:', JSON.stringify(r));
}

/**
 * FR-2: fetch eligible hosts (recent-enough activity) and each one's most-recent heartbeat.
 * Excludes NULL hostnames and any host with no heartbeat inside HOST_ELIGIBILITY_WINDOW_MIN.
 *
 * @returns {Promise<Map<string,string>>} hostname -> most recent heartbeat_at (ISO string)
 */
export async function fetchEligibleHosts(db, now) {
  const windowStartIso = new Date(now.getTime() - HOST_ELIGIBILITY_WINDOW_MIN * 60000).toISOString();
  const { data, error } = await db
    .from('claude_sessions')
    .select('hostname, heartbeat_at')
    .not('hostname', 'is', null)
    .gte('heartbeat_at', windowStartIso)
    .order('heartbeat_at', { ascending: false })
    .limit(HOST_QUERY_ROW_LIMIT);
  if (error) throw new Error(error.message);
  const rows = data || [];
  // TRUNCATION IS REPORTED LOUDLY, NEVER SILENT (mirrors stuck-seat-population.cjs's own
  // truncated-flag discipline): hitting the cap means a busier host may be crowding a quieter one
  // out of this result, which is exactly the failure mode this function exists to avoid.
  if (rows.length >= HOST_QUERY_ROW_LIMIT) {
    console.error(`[fleet-dead-man-per-host] fetchEligibleHosts TRUNCATED at ${HOST_QUERY_ROW_LIMIT} rows -- a quieter host may be missing from this result. Consider raising HOST_QUERY_ROW_LIMIT or shrinking HOST_ELIGIBILITY_WINDOW_MIN.`);
  }
  const byHost = new Map();
  for (const row of rows) {
    // Rows arrive newest-first; the first row seen per host is that host's most recent heartbeat.
    if (!byHost.has(row.hostname)) byHost.set(row.hostname, row.heartbeat_at);
  }
  return byHost;
}

// SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2: per-host, Leg-A-only companion to checkFleetDeadMan.
// Same injectable-sender / injectable-clock shape; ships the Solomon GROUP-BY-HOST constraint
// without modifying the existing global check (see the design-rationale comment above
// evaluatePerHostFreezePredicate for why the two cannot be combined).
export async function checkPerHostFreeze(db, DRY, sendChairmanSMSFn = null, now = new Date()) {
  // TESTING sub-agent finding (M3, EXEC-TO-PLAN review): a local try/catch here would swallow a
  // real query failure as a clean, silent no-op -- runAlertArm would record ok:true, no PARTIAL
  // DELIVERY warning, exit code 0. That is precisely the indistinguishable-failure class
  // QF-20260803-882 fixed for the OTHER arms in this same file. Let it throw; runAlertArm's own
  // catch (below, in runAlertArm/runAlertArms) already logs "ARM FAILED" loudly and marks the run
  // non-zero-exit -- do not re-solve a problem this file already solved correctly.
  const eligibleHosts = await fetchEligibleHosts(db, now);

  // SECURITY sub-agent finding (EXEC-TO-PLAN review, Finding 1): see MAX_HOSTS_PAGED_PER_RUN's own
  // comment for the threat model. The cap bounds how many DEAD hosts get a FRESH recorded verdict
  // this run (a superset of how many actually page, since only transitioned ones do) -- a host
  // beyond the cap gets NO write this run, so its last recorded state is untouched and it
  // re-competes for a cap slot next run once this run's paged hosts have themselves flipped to
  // transitioned=false. Alive hosts never count against THIS cap; only dead ones do -- see
  // MAX_HOSTS_PROCESSED_PER_RUN immediately below for the cap that also covers alive hosts.
  let deadProcessed = 0;
  let deadSkippedByCap = 0;
  // Deep-tier /ship review, Finding 1: bounds total DB read+write volume (dead + alive combined),
  // independent of the paging cap above. Same residual limitation as fetchEligibleHosts' own
  // HOST_QUERY_ROW_LIMIT truncation (Finding 2, disclosed there, not re-solved here): eligibleHosts
  // is ordered by most-recent-heartbeat-first, so an adversarial flood of freshly-stamped fake
  // "alive" hosts could in principle push a genuinely stale real host past this cap in the same run
  // it would otherwise have been evaluated. Closing that fully requires a known-host allowlist or
  // tightened claude_sessions RLS -- out of scope for this SD; tracked as a follow-up.
  let totalProcessed = 0;

  for (const [hostname, lastHeartbeatAtForHost] of eligibleHosts) {
    if (totalProcessed >= MAX_HOSTS_PROCESSED_PER_RUN) {
      console.error(`[fleet-dead-man-per-host] STOPPED at ${MAX_HOSTS_PROCESSED_PER_RUN} hosts processed this run -- remaining eligible hosts got no verdict this tick. If this is a genuine mass outage rather than fabricated claude_sessions rows, raise MAX_HOSTS_PROCESSED_PER_RUN.`);
      break;
    }

    const verdict = evaluatePerHostFreezePredicate({ hostname, lastHeartbeatAtForHost, now });

    if (verdict.dead) {
      if (deadProcessed >= MAX_HOSTS_PAGED_PER_RUN) {
        deadSkippedByCap += 1;
        continue;
      }
      deadProcessed += 1;
    }

    totalProcessed += 1;
    const { transitioned } = await recordFleetDeadManVerdict(db, verdict, hostname);
    console.log(`[fleet-dead-man-per-host] ${hostname}: ${verdict.dead ? 'DEAD' : 'alive'} (transitioned=${transitioned}): ${verdict.reason}`);

    if (!verdict.dead || !transitioned) continue;

    const message = buildPerHostFreezeMessage(hostname, verdict, now);
    if (DRY) {
      console.log(`[fleet-dead-man-per-host] [DRY] would page chairman via sendChairmanSMS for ${hostname}:`, message.body);
      continue;
    }
    const send = sendChairmanSMSFn || (await import(pathToFileURL(path.resolve('lib/comms/adam-outbound/chairman-sms-gate/index.js')).href)).sendChairmanSMS;
    const { resolveChairmanZone } = await import(pathToFileURL(path.resolve('lib/comms/adam-outbound/quiet-hours-extension.js')).href);
    const { zone: chairmanZone } = await resolveChairmanZone(now);
    const r = await send(message, { now, chairmanZone });
    console.log(`[fleet-dead-man-per-host] sendChairmanSMS result for ${hostname}:`, JSON.stringify(r));
  }

  if (deadSkippedByCap > 0) {
    console.error(`[fleet-dead-man-per-host] CAPPED at ${MAX_HOSTS_PAGED_PER_RUN} dead host(s) processed this run -- ${deadSkippedByCap} additional dead host(s) were NOT recorded or paged. They will re-compete for a cap slot on the next run. If this is a genuine mass outage rather than fabricated claude_sessions rows, raise MAX_HOSTS_PAGED_PER_RUN.`);
  }
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
    ['fleet-dead-man-pager', () => checkFleetDeadMan(db, DRY)],
    ['fleet-dead-man-per-host-pager', () => checkPerHostFreeze(db, DRY)],
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
