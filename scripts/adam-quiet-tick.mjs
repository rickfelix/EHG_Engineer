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
import { runOutboundSilenceWatchdog } from '../lib/adam/outbound-silence-watchdog.js';
// SD-LEO-FIX-QUIET-HOURS-GATE-001: relocated from a local definition here to a shared lib/
// module so presence-reply-window.js can consult the SAME discriminator (single source of
// truth). Imported here (creating the local binding the call site below still needs) AND
// re-exported below (external consumers, e.g. tests/unit/qf590-sms-watchdog-not-chairman.test.js,
// import both names FROM this file) -- a bare `export {...} from '...'` alone would NOT create a
// local binding and would throw ReferenceError at the call site (verified empirically).
import { WATCHDOG_BODY_PREFIX, isWatchdogBody } from '../lib/comms/adam-outbound/watchdog-detector.js';
// SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 FR-3: the tick's backlog COUNT comes from the
// same shared selector the watchdog uses, so the two agree BY CONSTRUCTION rather than by
// numeric reconciliation (criterion 3 is a RECURRENCE of the lane-002 close that claimed
// unified consumption semantics and did not achieve it).
import { fetchInboundBacklog, classifyBacklog, partitionByLiveness } from '../lib/adam/inbound-backlog.js';
import { resolveAdamSessionIds } from '../lib/adam/inbound-backlog-watchdog.js';
import { TABLE as TASK_LEDGER_TABLE, syncParentRollupStatus } from '../lib/adam/task-ledger.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: task_ledger has no archival/
// retention mechanism (verified) and the ventures stall-scan below has no .limit() either —
// both are unbounded processing reads (rows iterated for stall detection), so paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
// SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-B (Part 2): the divergent+stalled
// alarm class layered onto the existing orchestrator-blocked venture stall scan below. Consumes
// the Child-A discriminator (lib/governance/real-build-discriminator.mjs) transitively.
import { evaluateRealBuildStall } from '../lib/governance/real-build-stall-alarm.mjs';
// SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 FR-3: additive STALE escalation for a parked chairman
// SMS row unresolved >=24h, layered onto the existing QUIET_TICK_SMS_PARKED line below.
import { isStaleParkedSms } from '../lib/governance/parked-sms-stall.mjs';
// SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-3: additive STALE escalation for a chairman
// ratification unencoded >=24h, mirroring the parked-SMS-STALE pattern immediately above.
import { isStaleRatification, formatRatificationStaleLine } from '../lib/governance/ratification-stall.mjs';
// SD-LEO-INFRA-ADAM-DURABLE-STANDING-001: the durable standing priority. Surfaced ABOVE the inbox
// below, because the measured failure was the queue setting the agenda — a priority printed beneath
// a dozen inbound rows has been filed, not surfaced.
import { evaluateStandingPriority } from '../lib/adam/standing-priority.js';
import { runChairmanGatedDecisionRowGuard } from '../lib/chairman/chairman-gated-decision-row-guard.mjs';

const require = createRequire(import.meta.url);
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { decideCadence, detectSalientDelta, runCoresFailSoft } = require('../lib/coordinator/quiet-tick.cjs');
// QF-20260829-588: canonical non-fleet predicate (lib/claim/build-forbidden-session.cjs) --
// role seats (adam/solomon/coordinator) must not count as "idle" fleet workers.
const { isBuildForbiddenSession } = require('../lib/claim/build-forbidden-session.cjs');
// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2/FR-3): surface which Claude account the fleet
// is running under, and detect a genuine account switch across ticks.
const { getAccountIdentity, detectAccountSwitch } = require('../lib/fleet/account-identity.cjs');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { hasUndeliveredChairmanEscalation } = require('../lib/coordinator/undelivered-escalation.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
// QF-20260719-138: emit the mechanical cross-party ping stub ourselves (mirror of
// coordinator-quiet-tick.mjs) rather than instructing the agent to hand-insert it each tick.
const { emitCrossPartyPing } = require('../lib/coordinator/cross-party-ping.cjs');

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LAST_STATE_FILE = join(REPO_ROOT, '.adam-quiet-tick-last.json');
// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-3): a SEPARATE identity-only state file, kept
// independent of detectSalientDelta's tracked-field set (beltZero/openSignalCount/venture1State)
// so the two concerns don't have to share a shape. Mirrors LAST_STATE_FILE's own
// try/catch-load, JSON.stringify-write, single-slot pattern (see loadLastState/saveLastState).
const ACCOUNT_IDENTITY_STATE_FILE = join(REPO_ROOT, '.account-identity-last.json');
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
  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-1): --background — this cron core's
  // stdout is truncated to one line (scriptCore below), so it must NEVER consume (read_at);
  // it stamps delivered_at only. Operator-visible surfacing is FR-3's surfaceInboxItems.
  { key: 'inbox-monitor', script: 'adam-advisory.cjs', args: ['scripts/adam-advisory.cjs', 'inbox', '--quiet', '--background'], quiescentSkip: false, safety: true },
  // SD-LEO-INFRA-FORCE-ROLE-SESSIONS-001 (FR-3): the forced-capture obligation, evaluated at a
  // RECURRING OPERATING CHOKE rather than at turn end. A turn-end / Stop-hook guard is blind to
  // how role sessions actually die — four seats were measured wedged mid-iteration on 2026-08-02
  // with loop_state=active and a stale last_tool_at, and a wedged session never reaches turn-end.
  // Riding here means a frozen seat visibly stops passing, which is correct AND observable.
  // check-only: the tick never records on Adam's behalf — a gate that satisfies itself measures
  // nothing. The CLI always exits 0, so this contributes a state token and never a core failure.
  { key: 'capture-gate', script: 'role-capture-gate.mjs', args: ['scripts/role-capture-gate.mjs', 'check', '--role', 'adam'], quiescentSkip: false },
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
// status: status==='in_progress' -> treated as an intended hold (a known next step is itself
// progressing) so it never escalates even if this exact row's updated_at hasn't changed this
// tick; status==='blocked' (or anything else) is a genuine-stall candidate, matching the locked
// scope's noise-avoidance bias (default to NOT escalating when ambiguous, per stall-detector.js's
// classifyStaleness contract).
// QF-20260711-503: rollupParentStatus() (lib/adam/task-ledger.js) is PURE and was previously
// used only for the board VIEW (adam-pm-board.mjs) — nothing wrote its result back onto the
// parent's OWN persisted status column, so this read could see a STALE status (e.g. still
// 'blocked' from an earlier tick) even once the remaining child was unblocked and simply
// claimable on the belt, causing a false stall escalation. syncParentRollupStatus() persists
// the fresh rollup first so this read always reflects current children state.
export async function readCriticalPathParents(sb) {
  try {
    await syncParentRollupStatus(sb).catch(() => {}); // fail-soft: a sync error falls through to the pre-fix (possibly stale) read rather than aborting the tick
    // QF-20260703-229: pre-filter to OPEN nodes at the query — a done/cancelled parent has
    // stopped moving BY DEFINITION and is never a stall candidate. source_kind/source_ref are
    // read here too so checkAndAlertStalls can self-heal a sourced_sd node whose linked SD
    // already finished, instead of escalating a stale board row.
    const data = await fetchAllPaginated(() => sb
      .from(TASK_LEDGER_TABLE)
      // QF-20260728-544: `tier` MUST be selected. stall-alert.js decides suppression on
      // node.tier, and omitting it here left that value undefined on every row — the predicate
      // could not see its own input, so QF-20260725-639's anchor suppression never fired once
      // and 49 alerts/tick recurred. Selecting a column the WHERE clause already pins looks
      // redundant; it is not, because the consumer reads the VALUE, not the filter.
      .select('id, title, updated_at, status, tier, source_kind, source_ref')
      .eq('tier', 'parent')
      .in('status', ['open', 'in_progress', 'blocked'])
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    return data.map((row) => ({ ...row, inFlightNextStep: row.status === 'in_progress' }));
  } catch {
    return [];
  }
}

// QF-20260710-056: the quiet-tick only watched Adam-PM-board nodes (task_ledger) —
// a live venture stuck mid-traversal (orchestrator_state='blocked') went silently
// undetected for ~50min because nothing else was watching it. Scoped to
// status='active' + orchestrator_state='blocked' only (live-verified: adding a
// workflow_status='pending' OR-clause, as the raw incident report suggested, pulled
// in 25+ status='cancelled' dead/archived/e2e-fixture ventures whose workflow_status
// field was simply never updated after termination — pure noise, not stalls). A
// fresh stage_executions row means the venture is actively progressing, not
// stalled — checked per-candidate so a venture mid-stage-transition is never
// false-flagged. Escalates (escalated:true) only once a candidate has already been
// seen on a prior tick, matching the codebase's default-to-NOT-escalating bias.
const VENTURE_STALL_THRESHOLD_MS = 15 * 60 * 1000;

// SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-B (Part 2): a SECOND, distinct
// alarm class layered additively onto the same active-blocked candidate scan — the
// real_build_stall class. A venture alarms in this class only when it is BOTH divergent
// (simulation-validated its gauge past STAGE_SIMULATION_OK with no real-build evidence, per the
// Child-A discriminator) AND stalled beyond a tiered day-clock (evaluateRealBuildStall). This is
// orthogonal to the orchestrator-blocked class above: a working S19_HARD_GATE block (divergent
// but progressing) does NOT alarm. Reuses the same two-strike snapshot escalation shape (its OWN
// snapshot object so the two classes' clocks never conflate) and the same exclusions. Wrapped in
// its own try/catch so any error degrades to no real_build_stall alarm and NEVER aborts the
// class-1 scan or throws — the function's fail-soft contract is preserved.
/**
 * QF-20260725-638: DELIBERATE-NOT-WORK exclusion. The stall predicate is purely temporal
 * (active + blocked + updated_at older than 15min), so a venture parked ON PURPOSE alarms
 * forever. Worse, the documented remedy — "record a gating decision" — writes metadata and
 * therefore BUMPS updated_at, pushing the row inside the 15-minute window: the alarm vanishes
 * for exactly one tick and returns. Measured live 2026-07-25: Image Alt Text Generator and
 * ApexNiche AI both recorded a decision at 16:15:51, showed ventureStalls=0 on the next tick,
 * and alarmed again ~17 minutes later. That false-clear is the dangerous part — it invites the
 * operator to conclude the remedy worked.
 *
 * Exclusion is STATE-based, not time-based, so a recorded decision genuinely silences the
 * alarm instead of resetting its clock. It is never silent: every suppression logs who parked
 * it, why, and the unpark trigger, so an excluded venture stays auditable on the tick.
 * Applies to BOTH alarm classes — the real_build_stall message itself names "record a gating
 * decision" as its remedy, so honouring it in only one class would leave the same false-clear.
 */
export function readVenturePark(v) {
  const g = (v && v.metadata && v.metadata.gating_decision) || null;
  if (!g) return null;
  return {
    decision: g.decision || '(unspecified)',
    by: g.by || '(unknown)',
    at: g.at || '(undated)',
    unpark: g.unpark_trigger || g.unpark || '(no unpark trigger recorded)',
  };
}

export async function checkVentureTraversalStalls(sb, priorSnapshot = {}, priorRealBuildSnapshot = {}) {
  const thresholdIso = new Date(Date.now() - VENTURE_STALL_THRESHOLD_MS).toISOString();
  const snapshot = {};
  const alerted = [];
  const realBuildSnapshot = {};
  const realBuildStalled = [];
  try {
    const stuck = await fetchAllPaginated(() => sb
      .from('ventures')
      // Part 2 additive columns (current_lifecycle_stage / launch_mode / deployment_url /
      // repo_url / workflow_started_at / metadata) feed the discriminator + tier resolver;
      // the class-1 orchestrator-blocked path is unaffected by the widened projection.
      .select('id, name, orchestrator_state, status, updated_at, current_lifecycle_stage, launch_mode, deployment_url, repo_url, workflow_started_at, metadata')
      .eq('status', 'active')
      .eq('orchestrator_state', 'blocked')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .lt('updated_at', thresholdIso)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)

    for (const v of stuck) {
      // QF-20260725-638: deliberately-parked ventures are excluded from BOTH classes before
      // any clock is consulted. Cleared from both snapshots so an unpark starts a fresh
      // two-strike escalation rather than inheriting a stale pre-park tick.
      const park = readVenturePark(v);
      if (park) {
        console.log(`QUIET_TICK_VENTURE_PARK_SUPPRESSED=adam venture=${v.id} name="${v.name}" decision="${park.decision}" by="${park.by}" at=${park.at} unpark="${park.unpark}"`);
        continue;
      }

      const { data: recent } = await sb
        .from('stage_executions')
        .select('id, updated_at')
        .eq('venture_id', v.id)
        .gte('updated_at', thresholdIso)
        .limit(1);
      const freshStageRow = !!(recent && recent.length > 0); // actively executing, not stalled

      // --- Class 1: orchestrator-blocked traversal stall (UNCHANGED behavior) ---
      if (!freshStageRow) {
        const escalated = !!priorSnapshot[v.id];
        snapshot[v.id] = priorSnapshot[v.id] || Date.now();
        alerted.push({ id: v.id, name: v.name, orchestrator_state: v.orchestrator_state, escalated });
      }

      // --- Class 2: real-build STALL (divergent + stalled beyond tiered day-clock) ---
      // Fail-soft in its OWN try so a bad row/eval can never abort the class-1 scan above.
      // lastStageAdvanceAt derives from data already in hand: a fresh stage_executions row's
      // timestamp when present, else the venture's own last-update stamp (the same forward-motion
      // proxy the class-1 15-min threshold already uses) — no extra query.
      try {
        const lastStageAdvanceAt = (freshStageRow && recent[0] && recent[0].updated_at) || v.updated_at || null;
        const rb = evaluateRealBuildStall(v, { now: Date.now(), lastStageAdvanceAt });
        if (rb.alarm) {
          const rbEscalated = !!priorRealBuildSnapshot[v.id];
          realBuildSnapshot[v.id] = priorRealBuildSnapshot[v.id] || Date.now();
          realBuildStalled.push({
            id: v.id, name: v.name, class: 'real_build_stall',
            tier: rb.tier, clock_days: rb.clock_days, elapsed_days: rb.elapsed_days,
            reason: rb.reason, escalated: rbEscalated,
          });
        }
      } catch { /* fail-soft: no real_build_stall alarm for this venture */ }
    }
  } catch (e) {
    return { snapshot: priorSnapshot, alerted: [], realBuildSnapshot: priorRealBuildSnapshot, realBuildStalled: [], error: e && e.message };
  }
  return { snapshot, alerted, realBuildSnapshot, realBuildStalled };
}

// SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-3) — surface the Adam session's
// unacked directed rows as FIRST-CLASS lines in the TICK'S OWN stdout (the act-on-flagged-
// lines contract, same as QUIET_TICK_STALL_ALERT). Required because scriptCore truncates
// the child drain's stdout to its last line — content printed by the child is structurally
// invisible to the operator turn, so the tick itself must surface. Print-once dedup via
// payload.tick_surfaced_at (QF-20260702-414 orphan_seen_at pattern — a visibility marker,
// NEVER read_at/acknowledged_at). Fail-soft: any error returns items:[] without aborting.
const TICK_SURFACE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-5 (instance 6, INBOX_CAP overflow):
// the raw fetch and the DISPLAY budget were previously the SAME number (50) — a burst of
// mechanical rows (ADAM_EXCLUDED_KINDS) consumed the entire raw fetch before the mechanical
// filter ever ran client-side, starving genuinely authored items out of the window all day.
// Split them: fetch a generous raw window (matches correlationWindow's existing .limit(400)
// precedent a few lines below), filter mechanical rows out FIRST, THEN cap the display at 50 —
// so mechanical noise can no longer crowd out authored content regardless of burst size.
const INBOX_RAW_FETCH_LIMIT = 400;
const INBOX_DISPLAY_CAP = 50;

export async function surfaceInboxItems(sb) {
  try {
    const { resolveAdamSessionId } = require('./read-adam-directives.cjs');
    const { DIRECTIVE_KINDS, ADAM_EXCLUDED_KINDS } = require('../lib/fleet/worker-status.cjs');
    const { hasCorrelatedReply } = require('../lib/coordinator/reply-correlation.cjs');
    const adamId = await resolveAdamSessionId(sb);
    if (!adamId) return { items: [], directives: 0 };

    const cutoffIso = new Date(Date.now() - TICK_SURFACE_WINDOW_MS).toISOString();
    const { data: rows, error } = await sb
      .from('session_coordination')
      .select('id, subject, body, payload, sender_type, created_at')
      .eq('target_session', adamId)
      .is('acknowledged_at', null)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: true })
      .limit(INBOX_RAW_FETCH_LIMIT);
    if (error) return { items: [], directives: 0, error: error.message };

    // SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 (closure map class C6): a directive's
    // reply is Adam's own outbound row correlated by payload.reply_to/correlation_id, not
    // an update to THIS row's acknowledged_at — fetch the correlation window once.
    const { data: correlationWindow } = await sb
      .from('session_coordination')
      .select('id, payload, sender_session, target_session')
      .or(`sender_session.eq.${adamId},target_session.eq.${adamId}`)
      .gte('created_at', cutoffIso)
      .limit(400);

    // FR-3: the BACKLOG COUNT is derived from the shared SSOT selector — the same one the cron
    // watchdog consumes — so tick count and watchdog count agree BY CONSTRUCTION. The display
    // list below deliberately keeps its own 7d window + cap (TICK_SURFACE_WINDOW_MS is NOT
    // changed; aging out was verified NOT to be the cause and must not be "fixed"). Fail-soft:
    // any selector error leaves backlogCount null and the tick still prints its item list.
    let backlogCount = null;
    let backlogBreachingCount = null;
    let backlogPhantomCount = null;
    try {
      const { ids, liveIds } = await resolveAdamSessionIds(sb);
      if (ids && ids.length) {
        const { rows: backlogRows, error: backlogError } = await fetchInboundBacklog(sb, ids);
        if (!backlogError) {
          // QF-20260816-532: classify only rows targeting a LIVE session — a row addressed to a
          // retired seat can never breach meaningfully (nobody polls a dead session_id), so it
          // only ever padded this gauge. Reported separately so the real floor stays visible.
          //
          // ADVERSARIAL REVIEW FINDING (PR #7169): an empty liveIds means no Adam session is
          // currently active at all — nothing to partition AGAINST. Falling back to the full row
          // set here preserves this module's pre-existing "no live Adam is the WORST case, never
          // an exemption" invariant instead of silently reporting a clean gauge while Adam is dark.
          const { liveRows, phantomRows } = liveIds.length
            ? partitionByLiveness(backlogRows, liveIds)
            : { liveRows: backlogRows, phantomRows: [] };
          const verdict = classifyBacklog(liveRows, Date.now());
          backlogCount = verdict.rawBacklogCount;
          backlogBreachingCount = verdict.breachingCount;
          backlogPhantomCount = phantomRows.length;
        }
      }
    } catch { /* fail-soft — the count is advisory; the item list below is the hard signal */ }

    const isDirectiveRow = (r) =>
      (r.payload && (DIRECTIVE_KINDS.includes(r.payload.kind) || r.payload.reply_needed || r.payload.reply_to)) || false;

    // Print-once dedup applies to the ITEM class only. DIRECTIVE-class rows are HARD
    // interrupts: they re-print EVERY tick until acknowledged_at converges them OR a
    // correlated reply is found — deduping a directive would let a single missed turn
    // hide it forever (the exact failure class this SD closes; adversarial review of PR #5802).
    const eligible = (rows || []).filter((r) => {
      const k = r.payload && r.payload.kind;
      if (k != null && ADAM_EXCLUDED_KINDS.includes(k)) return false;
      // SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 FR-3 (narrowed per RCA, not deleted).
      //
      // Being a REPLY in a chain is not discharge of the ack obligation. (Stated narrowly on
      // purpose: "participation in a chain is not discharge" over-generalizes beyond what is
      // verified here — the reply case is exactly what this guard encodes.)
      //
      // hasCorrelatedReply keys on `payload.correlation_id || id`
      // (lib/coordinator/reply-correlation.cjs:30) and matches by equality at :36, so it admits
      // ancestors and siblings — not only descendants. The guaranteed-present ancestor is Adam's
      // own antecedent question, so ADAM'S QUESTION SUPPRESSED THE ANSWER TO ADAM'S QUESTION.
      // Live 2026-07-25: 26 of 41 directive-class unacked inbound rows suppressed, 26/26 non-root,
      // each by an OLDER Adam-sent row in its own thread (witnessed: 4479197b<-05ee0769,
      // a81f9948<-3ca3d677, c160ef08<-12139a29).
      //
      // RESIDUAL, recorded rather than implied away (db-expert, measured over all 3,885 rows):
      // the predicate is weaker than "correlated reply" even for roots. `payload.reply_to` never
      // holds a row id (0 of 139) and `correlation_id === own row id` occurs 0 times, so the
      // `|| id` fallback can never fire and the relation is UNDIRECTED — "shares a correlation_id
      // with some other row". Rootness therefore does not make it sound in general: 81
      // correlation_id groups are shared across >=2 ROOT rows (231 rows), so a root can still be
      // suppressed by a sibling. That measured 0 in this directive lane today, and this guard is
      // the option that closes the witnessed bug WITHOUT retiring the ratified assertions of
      // C6-001 and LANE-DELIVERY-CONTRACT-001 FR-4 (retiring another SD's shipped contract needs
      // its own supersession, not a side effect of this one). The durable fix is upstream and out
      // of scope here: make successorship decidable by ancestry (reply_to carrying the parent ROW
      // id, or a parent_id/thread_root_id column) instead of inferred from a shared group key.
      //
      // The root guard is behaviorally IDENTICAL to wholesale removal across the live population
      // (both suppress 0 of 41) while preserving SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 and
      // SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-4, whose fixtures are thread-root
      // rows. Those two contracts and this one are DISJOINT on thread-rootedness, not
      // conflicting — neither is superseded, and no assertion of either was retired.
      if (isDirectiveRow(r)) {
        const isThreadRoot = !(r.payload && r.payload.reply_to);
        return !(isThreadRoot && hasCorrelatedReply(r, correlationWindow || [], { excludeKinds: ADAM_EXCLUDED_KINDS }));
      }
      return !(r.payload && r.payload.tick_surfaced_at);
    });
    // FR-5: capHit now reflects a genuine authored-item backlog exceeding the display budget
    // (eligible.length > cap) OR the raw fetch itself being truncated (rows.length hit its own
    // higher ceiling) -- NOT "the raw window happened to contain 50 rows," which previously gave
    // a false CAP signal even when every one of those 50 rows was mechanical noise (eligible:[]).
    const capHit = eligible.length > INBOX_DISPLAY_CAP || (rows || []).length === INBOX_RAW_FETCH_LIMIT;
    if (eligible.length === 0) return { items: [], directives: 0, capHit, backlogCount, backlogBreachingCount, backlogPhantomCount };

    const surfaced = eligible.slice(0, INBOX_DISPLAY_CAP);
    const items = surfaced.map((r) => {
      const k = (r.payload && r.payload.kind) || '(untyped)';
      const isDirective = isDirectiveRow(r);
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      const subject = String(r.subject || (r.payload && r.payload.body) || r.body || '(empty)').replace(/\s+/g, ' ').slice(0, 140);
      return { id: r.id, kind: k, isDirective, ageMin, subject };
    });

    // Stamp the dedup marker on ITEM-class rows only (visibility marker — the row stays
    // unread/unacked-recoverable; directives are deliberately never marked).
    const seenAt = new Date().toISOString();
    for (const r of surfaced.filter((x) => !isDirectiveRow(x) && !(x.payload && x.payload.tick_surfaced_at))) {
      await sb.from('session_coordination').update({ payload: { ...(r.payload || {}), tick_surfaced_at: seenAt } }).eq('id', r.id);
    }
    return { items, directives: items.filter((i) => i.isDirective).length, capHit, backlogCount, backlogBreachingCount, backlogPhantomCount };
  } catch (e) {
    return { items: [], directives: 0, error: e && e.message };
  }
}

// QF-20260719-848: contract CHAIRMAN SMS CHANNEL DUTY (INBOUND WATCH) — every tick must surface
// undrained chairman replies. Never drop on a phone mismatch (labelled when CHAIRMAN_PHONE is
// set, but non-matches still surface). SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 FR-5: the original
// version of this comment described a drained_at IS NULL filter that QF-20260808-673 replaced —
// see the surfaceSmsInbound docstring below (current received_at-window + sms_outbound_obligations
// implementation) for the actual, current predicate.
const SMS_INBOUND_CAP = 50;
// QF-20260810-590 provenance now lives in lib/comms/adam-outbound/watchdog-detector.js
// (SD-LEO-FIX-QUIET-HOURS-GATE-001 relocation). Re-exported here so external consumers that
// import from this file's own path (e.g. tests/unit/qf590-sms-watchdog-not-chairman.test.js)
// are unaffected by the relocation.
export { WATCHDOG_BODY_PREFIX, isWatchdogBody };
// QF-20260719-825 (layer 2): oversight-staleness backstop. Even with the durable loop
// entries + the GHA cron (QF-20260719-196), a lost cron must not go unnoticed for days
// again (coordinator-health evidence was 70.4h stale; the self-score 16 days). Reads the
// last-run stamps and flags when a stamp exceeds 2x its cadence, so the armed wakeup
// prompt forces the check. Fail-soft: any read error reports nothing (never breaks the tick).
export const OVERSIGHT_CADENCE_MS = 6 * 60 * 60 * 1000;   // coordinator-health loop cadence
export const SELFSCORE_CADENCE_MS = 6 * 60 * 60 * 1000;   // self-score loop cadence
export async function checkOversightStaleness(sb, { nowMs = Date.now() } = {}) {
  const out = { oversightOverdueH: null, selfScoreOverdueH: null };
  try {
    const { data } = await sb
      .from('codebase_health_snapshots')
      .select('created_at')
      .eq('dimension', 'adam_coordinator_health')
      .order('created_at', { ascending: false })
      .limit(1);
    const last = data && data[0] && Date.parse(data[0].created_at);
    if (Number.isFinite(last) && nowMs - last > 2 * OVERSIGHT_CADENCE_MS) {
      out.oversightOverdueH = Math.round((nowMs - last) / 3600000);
    }
  } catch { /* fail-soft */ }
  try {
    const { data } = await sb
      .from('feedback')
      .select('created_at')
      .eq('category', 'adam_self_assessment')
      .order('created_at', { ascending: false })
      .limit(1);
    const last = data && data[0] && Date.parse(data[0].created_at);
    if (Number.isFinite(last) && nowMs - last > 2 * SELFSCORE_CADENCE_MS) {
      out.selfScoreOverdueH = Math.round((nowMs - last) / 3600000);
    }
  } catch { /* fail-soft */ }
  return out;
}

// QF-20260823-131: the ONLY heartbeat cadence check ran once/hour (the durable 'heartbeat-sms'
// ADAM_LOOPS entry, cron '14 * * * *', which itself measures the gap against this SAME 55min
// bar), so a send just after :14 (e.g. :44) left the hourly cadence contract unenforceable until
// the NEXT hour's :14 tick -- worst case 90min, witnessed live as a chairman "are you still
// there" ping. Quiet-tick already runs every 15min and reads sms_outbound_obligations for the
// oversight/self-score staleness check above; this reuses that SAME instrument-first pattern so
// a breach is caught within one quiet-tick cycle instead of waiting up to 46 more minutes for the
// next hourly check. Fail-soft: a read error or a heartbeat that has never been sent reports
// nothing (never a false alarm) -- mirrors checkOversightStaleness's contract exactly.
// Cadence re-ratified EVERY 3 HOURS (chairman verbal 2026-08-28, ratification 9eebe200,
// supersedes the 2026-07-31 hourly verbal): threshold = cadence minus 5min grace, same
// shape as the old 55min-under-60min bar.
export const HEARTBEAT_OVERDUE_THRESHOLD_MS = 175 * 60 * 1000;
export async function checkHeartbeatCadence(sb, { nowMs = Date.now() } = {}) {
  try {
    const { data } = await sb
      .from('sms_outbound_obligations')
      .select('created_at')
      .eq('kind', 'heartbeat_status')
      .order('created_at', { ascending: false })
      .limit(1);
    const last = data && data[0] && Date.parse(data[0].created_at);
    if (Number.isFinite(last) && nowMs - last >= HEARTBEAT_OVERDUE_THRESHOLD_MS) {
      return { overdueMin: Math.round((nowMs - last) / 60000) };
    }
  } catch { /* fail-soft */ }
  return { overdueMin: null };
}

/** QF-20260808-673: how far back to look for an unanswered chairman inbound. */
export const SMS_ANSWER_WINDOW_MIN = 60;

/**
 * QF-20260808-673: surface chairman inbound that was never ANSWERED.
 *
 * THE OLD PREDICATE WAS `drained_at IS NULL`, AND IT MISSES THE REAL MISS. `drained_at` means
 * CONSUMED FROM STAGING BY THE DRAINER — not "the chairman got a reply". Those are different
 * facts, and conflating them is the read_at-is-not-delivery class. Witnessed: chairman SMS
 * b09ced65 arrived 19:22:00Z and was auto-drained 19:24:05Z, ~2 minutes later, BEFORE anyone
 * answered it. The row races the drainer and loses, so by the next tick `drained_at IS NULL`
 * returns nothing and the alarm is silent about a chairman who is still waiting.
 *
 * THE ANSWERED SIGNAL EXISTS AND IS QUERYABLE — the ticket's acceptance criterion asked to ADD a
 * chairman-reply store, but one is already in service: `sms_outbound_obligations`. The ad-hoc
 * reply path proves it — lib/comms/adam-outbound/chairman-sms-gate enqueues an obligation,
 * dispatches it, then reads that row back for status/provider_message_id and only reports
 * dispatched when it landed. Measured live: 590 rows to the chairman number, 589 with sent_at.
 *
 * `sent_at` is a SEND-SIDE fact (Twilio accepted; delivery callback is disabled), and that is the
 * right bar HERE — this alarm asks "did Adam reply at all", not "did the handset receive it".
 * The gate's own comment reaches the same conclusion: claiming delivery would be an over-claim.
 */
export async function surfaceSmsInbound(sb) {
  try {
    const chairmanPhone = process.env.CHAIRMAN_PHONE || null;
    const sinceIso = new Date(Date.now() - SMS_ANSWER_WINDOW_MIN * 60_000).toISOString();
    const { data, error } = await sb
      .from('sms_relay_staging')
      .select('id, from_phone, body_raw, signature_valid, received_at')
      // WINDOW, deliberately NOT `drained_at IS NULL` — see above.
      .gte('received_at', sinceIso)
      // QF-20260823-384: resolved_at is a distinct, EXPLICIT disposition signal (stamped only by
      // scripts/resolve-parked-chairman-sms.cjs) -- unlike drained_at (an automatic drain event
      // QF-20260808-673 already ruled out gating on), a resolved row was terminally dispositioned
      // by an operator and must never re-fire the hard interrupt. Measured: a row drained+parked+
      // resolved 27min earlier still surfaced QUIET_TICK_SMS_INBOUND because this predicate never
      // read resolved_at at all.
      .is('resolved_at', null)
      .order('received_at', { ascending: true })
      .limit(SMS_INBOUND_CAP);
    if (error) return { rows: [], count: 0, error: error.message };

    const candidates = data || [];
    if (candidates.length === 0) return { rows: [], count: 0 };

    // One outbound read for the whole window, from the oldest row onward.
    let replyTimes = null; // null = UNKNOWN, never silently 0
    if (chairmanPhone) {
      const { data: outs, error: oerr } = await sb
        .from('sms_outbound_obligations')
        .select('sent_at')
        .eq('recipient_phone', chairmanPhone)
        .not('sent_at', 'is', null)
        .gte('sent_at', candidates[0].received_at);
      if (!oerr) replyTimes = (outs || []).map((o) => new Date(o.sent_at).getTime());
    }

    // EXCLUDE ONLY ON POSITIVE EVIDENCE OF AN ANSWER. Two existing guarantees are preserved here
    // deliberately, because the suite that asserts them is defending a real hazard:
    // "surfaces BOTH (never drops on phone mismatch)" and "an unset env must not re-hide replies".
    // Filtering by `from_phone === CHAIRMAN_PHONE` would silently hide a genuine chairman message
    // whose number is formatted differently (missing country code, spacing) — trading the bug this
    // ticket fixes for a quieter one. `isChairman` therefore remains a LABEL, never a gate.
    //
    // UNKNOWN IS NOT ANSWERED: if the reply store could not be read, or no chairman number is
    // configured, nothing can be shown to have been answered — so every row surfaces. Resolving
    // unknown to "answered" would silence a chairman-facing alarm on a failed query, the worst
    // direction to fail on this channel.
    const answeredUnknown = replyTimes === null;
    const rows = candidates
      .filter((r) => {
        if (answeredUnknown) return true;
        const t = new Date(r.received_at).getTime();
        return !replyTimes.some((rt) => rt > t); // answered = a reply left AFTER it arrived
      })
      .map((r) => ({
        id: r.id,
        fromPhone: r.from_phone,
        isChairman: chairmanPhone ? r.from_phone === chairmanPhone : true,
        signatureValid: r.signature_valid === true,
        ageMin: Math.floor((Date.now() - new Date(r.received_at).getTime()) / 60_000),
        body: String(r.body_raw || '').replace(/\s+/g, ' ').slice(0, 120),
      }));
    return { rows, count: rows.length, answeredUnknown };
  } catch (e) {
    return { rows: [], count: 0, error: e && e.message };
  }
}

/**
 * SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-2: surface PARKED chairman SMS every tick,
 * until explicitly resolved (scripts/resolve-parked-chairman-sms.cjs). A parked row is a
 * verified-chairman-number message that resolved to a PARK_OUTCOMES value (no_match/
 * rate_limited/expired/ambiguous, per lib/chairman/sms-bridge.js) and already terminal-
 * drained (drained_at is set) — surfaceSmsInbound's received_at window above will never show it
 * again once it ages out. This detector has NO time window: `parked_at IS NOT NULL AND
 * resolved_at IS NULL` IS the queue, so a parked row re-fires every tick for as long as it stays
 * unaddressed — that persistence (not a decaying window) is the FR-2 acceptance criterion.
 */
export async function surfaceParkedChairmanSms(sb) {
  try {
    const { data, error } = await sb
      .from('sms_relay_staging')
      .select('id, from_phone, body_raw, parked_at')
      .not('parked_at', 'is', null)
      .is('resolved_at', null)
      .order('parked_at', { ascending: true })
      .limit(SMS_INBOUND_CAP);
    if (error) return { rows: [], count: 0, error: error.message };

    const rows = (data || []).map((r) => ({
      id: r.id,
      fromPhone: r.from_phone,
      ageMin: Math.floor((Date.now() - new Date(r.parked_at).getTime()) / 60_000),
      body: String(r.body_raw || '').replace(/\s+/g, ' ').slice(0, 120),
    }));
    return { rows, count: rows.length };
  } catch (e) {
    return { rows: [], count: 0, error: e && e.message };
  }
}

/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-3: chairman ratifications unencoded >=24h.
 * FAIL-SOFT on a table-absent error (42P01/PGRST205) -- the chairman-gated migration is STAGED
 * NOT APPLIED until the chairman signs it, so this degrades to a no-op until then, never a
 * crash. Any OTHER error is surfaced via the `error` field (same discard-class fix applied to
 * QF-20260822-215 this session: table-absent and genuine-failure must never be conflated).
 */
export async function surfaceStaleRatifications(sb) {
  try {
    const { data, error } = await sb
      .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, not yet applied
      .select('id, ratified_at, target_contracts')
      .is('encoded_at', null)
      .order('ratified_at', { ascending: true })
      // .limit(999): a chairman ratification ledger, expected cardinality in the dozens over
      // years — explicit bound (count-truncation-diff-lint) rather than fetchAllPaginated, which
      // would lose the error.code-based 42P01/PGRST205 branch below (it re-throws with only
      // .message preserved).
      .limit(999);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return { rows: [], count: 0 };
      return { rows: [], count: 0, error: error.message };
    }
    const nowMs = Date.now();
    const rows = (data || [])
      .map((r) => ({ ...r, ageHours: (nowMs - new Date(r.ratified_at).getTime()) / 3_600_000 }))
      .filter((r) => isStaleRatification(r.ageHours, null));
    return { rows, count: rows.length };
  } catch (e) {
    return { rows: [], count: 0, error: e && e.message };
  }
}

/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-4: production I/O wrapper around the pure
 * lib/chairman/ratification-regression-detector.mjs (which is deliberately DB/fs-free per its own
 * docblock — this is the only call site that feeds it live data, mirroring how
 * surfaceStaleRatifications above wraps lib/governance/ratification-stall.mjs's pure predicate).
 *
 * Sources the two most recent claude-generation-manifest.json snapshots from git history (per the
 * PRD's own implementation guidance) for Stage 1; reads each already-encoded row's live
 * target_file from disk for Stage 2. Fail-soft throughout: a missing table, missing manifest,
 * missing prior commit, or missing file never throws — it only narrows what can be checked, never
 * crashes the tick (matching TS-8a/TS-8b's "first-ever manifest is a structural no-op" contract).
 */
export async function checkRatificationRegressions(sb, { repoRoot = REPO_ROOT } = {}) {
  try {
    // REGRESSION finding (PLAN_VERIFICATION evidence row db85362a): moved inside the try so the
    // docblock's "Fail-soft throughout" claim is literally true for every statement in this
    // function, not just the ones after this line.
    const { detectRatificationRegression } = await import('../lib/chairman/ratification-regression-detector.mjs');

    const { data, error } = await sb
      .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, not yet applied
      .select('id, encoded_at, encoded_ref, marker_text')
      .not('encoded_at', 'is', null)
      // .limit(999): same bounded-ledger rationale as surfaceStaleRatifications above
      // (count-truncation-diff-lint).
      .limit(999);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return { rows: [], count: 0 };
      return { rows: [], count: 0, error: error.message };
    }
    // REGRESSION finding: skip the manifest read + git subprocess spawns entirely when there is
    // nothing encoded yet — avoids a standing per-tick cost once the migration lands and the
    // table is legitimately empty or all-unencoded.
    if (!data || data.length === 0) return { rows: [], count: 0 };

    let newerManifest = null;
    try {
      const parsed = JSON.parse(readFileSync(join(repoRoot, 'claude-generation-manifest.json'), 'utf8'));
      newerManifest = parsed.section_digests || null;
    } catch { /* no manifest on disk -- nothing to check against */ }
    if (!newerManifest) return { rows: [], count: 0 };

    let olderManifest = null;
    try {
      const log = (await execFileAsync('git', ['log', '--format=%H', '-n', '2', '--', 'claude-generation-manifest.json'], { cwd: repoRoot, timeout: 5000 })).stdout.trim();
      const priorHash = log.split('\n').filter(Boolean)[1]; // the SECOND most recent commit touching the file
      if (priorHash) {
        const raw = (await execFileAsync('git', ['show', `${priorHash}:claude-generation-manifest.json`], { cwd: repoRoot, timeout: 5000, maxBuffer: 8 * 1024 * 1024 })).stdout;
        olderManifest = JSON.parse(raw).section_digests || null;
      }
    } catch { /* fewer than 2 commits touched the manifest yet -- Stage 1 becomes a structural no-op */ }

    const regressed = [];
    for (const row of data || []) {
      const sectionId = row.encoded_ref && row.encoded_ref.section_id;
      const targetFile = sectionId && newerManifest.meta && newerManifest.meta[sectionId] && newerManifest.meta[sectionId].target_file;
      let liveFileContent;
      if (targetFile) {
        try { liveFileContent = readFileSync(join(repoRoot, targetFile), 'utf8'); } catch { /* file gone/unreadable -- detectMarkerMissing treats this as the marker being gone */ }
      }
      const result = detectRatificationRegression(row, { newerManifest, olderManifest, liveFileContent });
      if (result.regressed) regressed.push({ ...row, ...result });
    }
    return { rows: regressed, count: regressed.length };
  } catch (e) {
    return { rows: [], count: 0, error: e && e.message };
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

// QF-20260828-922: witnessed 08-28 -- the chairman caught 1 live-idle seat beside 4
// claimable drafts before any role did. A seat's heartbeat_at/last_tool_at can be kept
// artificially fresh post-release by the /clear-survivor daemon (a "shell"), so a seat
// only counts as genuinely idle-and-available when its last real tool call happened
// AFTER its most recent release (or it was never released at all).
export async function checkIdleBesideClaimable(sb) {
  try {
    // QF-20260829-588: this is the RAW-UNCLAIMED draft count, not the dispatchable-leaf
    // extent (belt-skip classes like human_action_required/orchestrator/dep-blocked are
    // still counted here) -- named accordingly so a reader does not compare it against a
    // different extent (the two-extents class from the corpus-hygiene instrument-naming rider).
    const { count: rawUnclaimedCount } = await sb
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft');
    if (!rawUnclaimedCount) return null;
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: seats } = await sb
      .from('claude_sessions')
      .select('session_id, released_at, last_tool_at, metadata')
      .is('sd_key', null)
      .in('status', ['active', 'idle'])
      .gte('last_tool_at', cutoff)
      .limit(200);
    // QF-20260829-588: role seats (adam/solomon/coordinator, metadata.non_fleet=true /
    // role='adam' / is_coordinator=true) are legitimately idle by design -- they must
    // never count as fleet-worker idle capacity here.
    const idleCount = (seats || []).filter(
      (s) => !isBuildForbiddenSession(s.metadata)
        && (!s.released_at || new Date(s.last_tool_at) > new Date(s.released_at))
    ).length;
    return idleCount > 0 ? { idleCount, rawUnclaimedCount } : null;
  } catch { return null; }
}

function loadLastState() {
  try { return JSON.parse(readFileSync(LAST_STATE_FILE, 'utf8')); } catch { return null; }
}
function saveLastState(s) {
  try { writeFileSync(LAST_STATE_FILE, JSON.stringify(s)); } catch { /* fail-soft */ }
}

// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-3): mirrors loadLastState/saveLastState's
// pattern for a dedicated single-slot identity state file.
function loadLastAccountIdentity() {
  try { return JSON.parse(readFileSync(ACCOUNT_IDENTITY_STATE_FILE, 'utf8')); } catch { return null; }
}
function saveLastAccountIdentity(s) {
  try { writeFileSync(ACCOUNT_IDENTITY_STATE_FILE, JSON.stringify(s)); } catch { /* fail-soft */ }
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

  // SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2/FR-3): which Claude account is this fleet
  // running under, and did it just switch? getAccountIdentity() is fail-safe (never throws;
  // null when the config is missing/malformed).
  const currentIdentity = getAccountIdentity();
  const acctLabel = (currentIdentity && currentIdentity.email) || 'unknown';

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
  const priorVentureStallSnapshot = priorState.ventureStallSnapshot || {};
  const priorVentureRealBuildStallSnapshot = priorState.ventureRealBuildStallSnapshot || {};

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

  // QF-20260710-056: a venture stuck mid-traversal is the thing that matters most —
  // check it every tick, independent of the task_ledger stall watch above.
  let ventureStall = { snapshot: priorVentureStallSnapshot, alerted: [], realBuildSnapshot: priorVentureRealBuildStallSnapshot, realBuildStalled: [] };
  try {
    ventureStall = await checkVentureTraversalStalls(sb, priorVentureStallSnapshot, priorVentureRealBuildStallSnapshot);
  } catch (e) {
    ventureStall = { snapshot: priorVentureStallSnapshot, alerted: [], realBuildSnapshot: priorVentureRealBuildStallSnapshot, realBuildStalled: [], error: e && e.message };
  }

  // SD-LEO-FIX-ADAM-OUTBOUND-SILENCE-001: watch Adam's own outbound rows at a live
  // target for reply-expected silence (probe then, on a second consecutive breach,
  // a chairman-visible feedback row). Fail-soft — never blocks the rest of the tick.
  let outboundSilence = { probed: [], escalated: [], laneHealth: { unactionedCount: 0, maxAgeMs: 0 } };
  try {
    outboundSilence = await runOutboundSilenceWatchdog(sb, {});
  } catch (e) {
    outboundSilence = { probed: [], escalated: [], laneHealth: { unactionedCount: 0, maxAgeMs: 0 }, error: e && e.message };
  }

  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-3): surface unacked directed rows
  // as first-class tick output (the child drain above ran --background and consumed nothing).
  const inboxSurface = await surfaceInboxItems(sb);

  // QF-20260719-848: contract INBOUND WATCH — surface undrained chairman SMS every tick.
  const smsInbound = await surfaceSmsInbound(sb);

  // SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-2: parked chairman SMS — orthogonal to the
  // window-bound smsInbound above (drained_at is already set on these rows; only parked_at/
  // resolved_at gate this queue), so it is read and surfaced separately every tick.
  const smsParked = await surfaceParkedChairmanSms(sb);

  // SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-3: chairman ratifications unencoded >=24h.
  // Fail-soft no-op until the chairman-gated migration is applied (surfaceStaleRatifications).
  const staleRatifications = await surfaceStaleRatifications(sb);

  // SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-4: already-encoded ratifications whose
  // clause was silently reverted (whole-section removal or within-section marker-text deletion).
  const regressedRatifications = await checkRatificationRegressions(sb);

  // SD-LEO-INFRA-ADAM-DURABLE-STANDING-001: evaluate the durable standing priority. Fail-soft like
  // its siblings above — and fail QUIET: a detector that cannot read its store reports 'unknown'
  // and renders nothing, because an unreadable store must never be shown as a held priority.
  let standing = { status: 'unknown', priority: null, servedBy: [], anchored: false };
  try {
    standing = await evaluateStandingPriority(sb);
  } catch { /* fail-quiet — 'unknown' renders nothing; absent measurement is not a pass */ }

  // FR-4: belt-countdown + offer-help collapse to a salient-delta check — Adam only
  // reaches the coordinator on a real belt/venture delta, never a "still idle" status.
  const salient = await readSalientState(sb);
  const delta = detectSalientDelta(priorSalient, salient);
  saveLastState({ salient, stallSnapshot: stall.snapshot, ventureStallSnapshot: ventureStall.snapshot, ventureRealBuildStallSnapshot: ventureStall.realBuildSnapshot });

  // SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-3): cold-start rule — loadLastAccountIdentity()
  // returning null (no prior state file / first tick after deploy-restart) means
  // detectAccountSwitch always reports changed:false; the baseline write below still happens
  // silently. A switch only fires when a PRIOR state EXISTED and differs from currentIdentity.
  const priorIdentity = loadLastAccountIdentity();
  const acctSwitch = detectAccountSwitch(priorIdentity, currentIdentity);
  let acctNotified = false;
  if (!acctSwitch.changed) {
    // Cold start / stable tick: no notification to send, always advance the baseline.
    if (currentIdentity) saveLastAccountIdentity(currentIdentity);
  } else {
    // Fail-soft, but NOT silent-drop: the baseline is only advanced on CONFIRMED delivery
    // (below). If the coordinator lookup fails or the DB insert throws, priorIdentity stays
    // persisted, so the NEXT tick sees the same delta and retries — a security-relevant
    // "which account is the fleet authenticated as" switch is never lost, only delayed.
    try {
      const coordinatorId = await getActiveCoordinatorId(sb);
      if (coordinatorId) {
        const subject = '[ACCOUNT_SWITCH] Adam session Claude account changed';
        const body = `Adam's Claude account switched from ${acctSwitch.event.from.email} (${acctSwitch.event.from.orgName}) ` +
          `to ${acctSwitch.event.to.email} (${acctSwitch.event.to.orgName}).`;
        // QF-20260719-208: mirror adam-advisory.cjs's L1 pre-send Solomon-consult gate at this
        // tick's emit choke (previously bypassed it entirely). The tick is non-interactive (no
        // live session to bounded-await a reply against), so a required consult fires a durable,
        // non-blocking solomon_consult row alongside the send rather than adam-advisory's
        // synchronous wait — Solomon still sees every consequential tick-originated send.
        // Fail-open by construction: a gate/consult error never blocks the account-switch notice.
        try {
          const { evaluatePreSendConsult } = await import('../lib/adam/should-consult-solomon.js');
          if (evaluatePreSendConsult({ title: subject, body, isChairmanTargeted: false }).action === 'consult-then-send') {
            const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');
            const { buildSolomonConsultPayload } = require('./worker-signal.cjs');
            const solomonId = await getActiveSolomonId(sb).catch(() => null);
            // SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-5: set the STRUCTURAL discriminator.
            // Without consult_purpose this row is indistinguishable from a genuine consult except
            // by its body prefix, so Solomon's drain — which sorts on kind and arrival time — lets
            // a CC needing no answer hold a real question behind it. The field has existed since
            // SOLOMON-CONSULT-CANNOT-DELIVER-001 FR-2; this producer simply never passed it.
            const cp = buildSolomonConsultPayload({ correlationId: crypto.randomUUID(), body: `[PRE-SEND CONSULT] ${body}`, senderCallsign: 'adam-quiet-tick', repo: process.cwd(), severity: 'high', consultPurpose: 'pre_send' });
            await insertCoordinationRow(sb, { sender_type: 'adam', target_session: solomonId || 'broadcast-solomon', message_type: 'INFO', subject: '[SOLOMON_CONSULT] pre-send', body: cp.body, payload: cp }, { targetRoleHint: 'solomon' });
          }
        } catch { /* fail-open — see comment above */ }
        await insertCoordinationRow(sb, {
          sender_type: 'adam',
          target_session: coordinatorId,
          message_type: 'INFO',
          subject,
          body,
          payload: { kind: 'account_switch_notice', ...acctSwitch.event, reply_class: 'fire-and-forget' },
        });
        acctNotified = true;
      }
    } catch { /* fail-soft — see comment above; acctNotified stays false, baseline not advanced */ }
    if (acctNotified && currentIdentity) saveLastAccountIdentity(currentIdentity);
  }

  // SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-3): Adam is the delivery leg to the
  // chairman, so an undelivered pick-class escalation must hold Adam's tick in the
  // hard-wake band too (§6d hard-park precondition). Detector is internally fail-soft.
  const undeliveredEscalation = await hasUndeliveredChairmanEscalation(sb);
  const delaySeconds = decideCadence({
    quiescent,
    partyOffsetS: ADAM_PARTY_OFFSET_S,
    hasUndeliveredChairmanEscalation: undeliveredEscalation,
  });

  const result = {
    party: 'adam',
    mode: quiescent ? 'QUIESCENT' : 'ACTIVE',
    modeReason: undeliveredEscalation ? `${modeReason} [ESCALATION_HARD_WAKE]` : modeReason,
    acct: acctLabel,
    cores: tick.summary,
    failedCount: tick.failedCount,
    boardReconcile,
    stallAlerted: stall.alerted,
    ventureStallAlerted: ventureStall.alerted,
    ventureRealBuildStallAlerted: ventureStall.realBuildStalled || [],
    // SD-LEO-INFRA-ADAM-DURABLE-STANDING-001: 'none' | 'served' | 'unserved' | 'unknown'.
    // 'unserved' is the state that used to be indistinguishable from an idle tick.
    standingPriority: standing.status,
    standingPriorityAnchored: standing.priority ? standing.anchored : null,
    standingPrioritySource: standing.priority ? standing.priority.source : null,
    inboxSurfaced: inboxSurface.items.length,
    inboxDirectives: inboxSurface.directives,
    // FR-3: the SUPPRESSION-FREE backlog count from the shared SSOT selector. Distinct from
    // inboxSurfaced, which is the windowed+capped DISPLAY count — the very number that read
    // "1-5" while 21 rows sat unacked. Surfacing only the display count is what made the
    // incident invisible, so the real one has to reach the operator, not just be computed.
    inboxBacklog: inboxSurface.backlogCount,
    inboxBacklogBreaching: inboxSurface.backlogBreachingCount,
    inboxBacklogPhantom: inboxSurface.backlogPhantomCount,
    smsInbound: smsInbound.count,
    smsParked: smsParked.count,
    outboundSilence,
    crossPartyPing: delta.changed,
    pingFields: delta.fields,
    accountSwitch: acctSwitch.changed,
    accountSwitchNotified: acctSwitch.changed ? acctNotified : null,
    nextWakeSeconds: delaySeconds,
  };

  // QF-20260719-138: a real salient delta emits the mechanical cross_party_ping stub HERE
  // (side-effect in both --json and human modes); the console line below is a record-of-sent.
  const pingSent = delta.changed ? await emitCrossPartyPing(sb, { from: 'adam', fields: delta.fields }) : false;

  if (asJson) {
    console.log(JSON.stringify(result));
  } else {
    console.log(
      `QUIET_TICK=adam mode=${result.mode} acct=${acctLabel} cores=[${tick.summary}] ` +
      `fail=${tick.failedCount} ` +
      `reconcile=parents:${boardReconcile.parents},errors:${boardReconcile.errors.length} ` +
      `stalls=${stall.alerted.length} ` +
      `ventureStalls=${ventureStall.alerted.length} ` +
      `realBuildStalls=${(ventureStall.realBuildStalled || []).length} ` +
      `inbox=${inboxSurface.items.length}(dir:${inboxSurface.directives}) ` +
      // The suppression-free backlog, printed alongside the display count. During the witnessed
      // incident `inbox=` read 1-5 while 21 rows sat unacked; this is the number that would have
      // shown the truth. `?` when the selector failed, never a healthy-looking 0.
      `backlog=${inboxSurface.backlogCount ?? '?'}(breach:${inboxSurface.backlogBreachingCount ?? '?'},phantom:${inboxSurface.backlogPhantomCount ?? '?'}) ` +
      `sms=${smsInbound.count} ` +
      `smsParked=${smsParked.count} ` +
      `probes=${outboundSilence.probed.length} esc=${outboundSilence.escalated.length} ` +
      `ping=${delta.changed ? delta.fields.join(',') : 'suppressed'} ` +
      `nextWakeSeconds=${delaySeconds} :: ${modeReason}`
    );
    if (delta.changed) {
      console.log(`QUIET_TICK_PING=adam->coordinator reason=${delta.fields.join(',')} sent=${pingSent} (mechanical cross_party_ping stub emitted by the tick — record of sent, not an instruction; author substantive help/sourcing separately only if warranted)`);
    }
    if (acctSwitch.changed) {
      const noticeStatus = acctNotified
        ? 'notice sent to active coordinator'
        : 'notice NOT sent (no active coordinator / send error) — will retry next tick';
      console.log(`ACCOUNT_SWITCH detected: adam session Claude account changed from ${acctSwitch.event.from.email} to ${acctSwitch.event.to.email} — ${noticeStatus}`);
    }
    for (const a of stall.alerted) {
      console.log(`QUIET_TICK_STALL_ALERT=adam node=${a.id} title="${a.title}" escalated=${a.escalated}`);
    }
    // QF-20260725-639: audit trail for ledger rows EXCLUDED from the stall class (parent-tier
    // anchors, advisory_thread comms). INFORMATIONAL ONLY — deliberately absent from the NO-OP
    // gate in adam-startup-check.mjs, exactly like QUIET_TICK_VENTURE_PARK_SUPPRESSED: a tick
    // whose only output is suppression lines is still a NO-OP. Treating these as actionable
    // would wake Adam to be told nothing is wrong, rebuilding the alert fatigue QF-638 removed.
    for (const s of stall.suppressed || []) {
      console.log(`QUIET_TICK_STALL_SUPPRESSED=adam node=${s.id} title="${s.title || ''}" tier=${s.tier} source_kind=${s.source_kind} reason=${s.reason} ticks=${s.ticks}`);
    }
    for (const v of ventureStall.alerted) {
      console.log(`QUIET_TICK_VENTURE_STALL_ALERT=adam venture=${v.id} name="${v.name}" state=${v.orchestrator_state} escalated=${v.escalated}`);
    }
    // SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-B (Part 2): the DISTINCT
    // real_build_stall class — a simulation-validated venture that advanced past
    // STAGE_SIMULATION_OK with no real build AND has sat motionless beyond its tiered clock.
    for (const v of (ventureStall.realBuildStalled || [])) {
      console.log(`QUIET_TICK_VENTURE_REAL_BUILD_STALL_ALERT=adam venture=${v.id} name="${v.name}" tier=${v.tier} clock_days=${v.clock_days} elapsed_days=${v.elapsed_days} reason=${v.reason} escalated=${v.escalated} — divergent (stage past simulation-OK, no real build) AND stalled beyond its clock. Act: start the real build or record a gating decision.`);
    }
    // QF-20260719-825 (layer 2): flag overdue oversight/self-score stamps so the armed
    // wakeup prompt forces the check even when a cron was lost (act-on-flagged-lines contract).
    const oversightStale = await checkOversightStaleness(sb);
    if (oversightStale.oversightOverdueH) {
      console.log(`QUIET_TICK_OVERSIGHT_OVERDUE=adam lastSnapshotAgeH=${oversightStale.oversightOverdueH} — run node scripts/adam-coordinator-health.mjs NOW (durable cron lost or failing; cadence 6h, threshold 2x)`);
    }
    if (oversightStale.selfScoreOverdueH) {
      console.log(`QUIET_TICK_SELFSCORE_OVERDUE=adam lastScoreAgeH=${oversightStale.selfScoreOverdueH} — run node scripts/adam-self-assessment-writer.cjs NOW (durable cron lost or failing; cadence 6h, threshold 2x)`);
    }
    // QF-20260823-131 (re-tuned 2026-08-28, ratification 9eebe200: cadence now EVERY 3 HOURS):
    // re-checks the SAME >=175min measured-gap bar the durable cron uses, every 15min via this tick.
    const heartbeatCadence = await checkHeartbeatCadence(sb);
    if (heartbeatCadence.overdueMin) {
      console.log(`QUIET_TICK_HEARTBEAT_OVERDUE=adam gapMin=${heartbeatCadence.overdueMin} — 3-hourly heartbeat cadence contract breached (>=175min since last send; chairman verbal 2026-08-28); send NOW: node scripts/adam-chairman-sms.mjs --kind heartbeat_status --body "<short status line>" (quiet hours/rate caps enforced by the send gate itself)`);
    }
    // SD-LEO-INFRA-ADAM-DURABLE-STANDING-001: THE STANDING PRIORITY IS PRINTED HERE, ABOVE THE
    // INBOX LOOP BELOW, AND THE POSITION IS THE POINT. The measured failure was the queue setting
    // the agenda; a priority rendered under a dozen inbound rows has been filed, not surfaced.
    //
    // 'unserved' carries its OWN token because an idle tick that cannot distinguish "nothing to do"
    // from "priority unserved" is exactly the defect — those two states produced identical silence.
    // status 'none' deliberately emits nothing (a tick with no priority set is a genuine NO-OP, and
    // waking the operator to be told nothing is wrong is the alert fatigue QF-20260725-638 removed);
    // 'unknown' likewise emits nothing, because an unreadable store must never render as held.
    if (standing.status === 'served') {
      console.log(`QUIET_TICK_STANDING_PRIORITY=adam status=served source=${standing.priority.source} anchored=${standing.anchored} title="${standing.priority.title}" servedBy=${standing.servedBy.join(',')}`);
    } else if (standing.status === 'unserved') {
      console.log(`QUIET_TICK_STANDING_PRIORITY_UNSERVED=adam source=${standing.priority.source} anchored=${standing.anchored} title="${standing.priority.title}" linked=${(standing.priority.linked_sd_keys || []).join(',') || '(none)'} — a standing priority is set and NOTHING is routed into it. This tick is NOT a no-op: route work to it, or clear it deliberately.`);
    }

    // QF-20260828-922: idle capacity beside claimable work is a dispatch gap, not a no-op.
    const idleBesideClaimable = await checkIdleBesideClaimable(sb);
    if (idleBesideClaimable) {
      console.log(`QUIET_TICK_IDLE_BESIDE_CLAIMABLE=adam idle=${idleBesideClaimable.idleCount} raw_unclaimed=${idleBesideClaimable.rawUnclaimedCount} — live-idle fleet-worker seat(s) (role seats excluded) beside raw-unclaimed draft(s) on the belt (not the dispatchable-leaf extent); dispatch now (node scripts/worker-checkin.cjs) rather than leaving both sides waiting.`);
    }

    // SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001: a chairman-gated SD with no
    // chairman_decisions row is invisible to every decision-driving instrument. Own try/catch
    // (not the outer one) so a guard-specific failure never aborts the rest of this tick's
    // checks — matches this tick's per-check resilience convention.
    try {
      const guard = await runChairmanGatedDecisionRowGuard(sb);
      if (guard.hits > 0) {
        console.log(`QUIET_TICK_CHAIRMAN_GATED_UNSURFACED=${guard.hits} recorded=${guard.recorded} backfilled=${guard.backfilled} suppressed=${guard.suppressed} errors=${guard.errors.length}`);
      }
      for (const e of guard.errors) {
        console.error(`QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR=adam sd_key=${e.sd_key} error="${e.error}"`);
      }
    } catch (e) {
      console.error(`QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR=adam guard_failed error="${e && e.message ? e.message : e}"`);
    }
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-3): first-class inbox surfacing —
    // directive/reply-needed rows carry the distinct hard-interrupt token.
    for (const i of inboxSurface.items) {
      const token = i.isDirective ? 'QUIET_TICK_INBOX_DIRECTIVE' : 'QUIET_TICK_INBOX_ITEM';
      console.log(`${token}=adam id=${i.id} kind=${i.kind} age=${i.ageMin}m subject="${i.subject}"`);
    }
    if (inboxSurface.capHit) {
      console.log('QUIET_TICK_INBOX_CAP=adam fetched=50 oldest-first — within-window overflow; ack surfaced rows to reach newer ones');
    }
    // SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 FR-3: the backlog breach needs its OWN
    // actionable token, not just a console figure. adam-startup-check's gate treats a tick with
    // none of its allowlisted QUIET_TICK_* tokens as a NO-OP, so a tick whose ONLY anomaly was a
    // backlog breach would be read as "nothing to do" — the fix would then be exactly as
    // invisible as the incident it closes (regression-agent 108066da). The display list can be
    // empty while the backlog is deep: that is the witnessed shape, 21 unacked behind "1-5".
    if (inboxSurface.backlogBreachingCount > 0) {
      console.log(`QUIET_TICK_INBOX_BACKLOG_BREACH=adam backlog=${inboxSurface.backlogCount} breaching=${inboxSurface.backlogBreachingCount} — unacked inbound rows past their breach threshold; drain via node scripts/adam-advisory.cjs inbox (the full-lane reader, no correlation filter)`);
    }
    // QF-20260719-848: undrained chairman SMS as first-class hard-interrupt lines (mirrors
    // QUIET_TICK_INBOX_DIRECTIVE) — the contract INBOUND WATCH duty. Act: drain + reply.
    // QF-20260808-834: the QUIET_TICK_SMS_INBOUND token IS the hard interrupt (adam-startup-check
    // allowlists these tokens; a tick with none is read as a NO-OP). It points at
    // scripts/sms-relay-drain.cjs, which is INERT while SMS_RELAY_DRAIN_ENABLED is unset. So an
    // undrained row re-fired the interrupt EVERY tick toward a remediation nobody could perform,
    // and a genuinely-new inbound then hid behind the permanent stale one — alert fatigue that
    // masks the very thing the detector exists to catch.
    //
    // DOWNGRADE, DO NOT SILENCE. The ticket offered "skip entirely when the flag is off" and
    // named the trade itself: pre-cutover inbounds would not be surfaced AT ALL. A detector that
    // goes fully dark on a CHAIRMAN SMS channel is a worse failure than the one being fixed, and
    // "what state silences this alarm, and can anyone reach it?" is exactly the question that
    // should stop a blanket skip. So: withhold the INTERRUPT TOKEN (the thing that falsely
    // promises an actionable drain) while still printing the row. Visibility is preserved;
    // only the false call-to-action is removed.
    const smsDrainEnabled = !['', '0', 'false', 'off', 'no']
      .includes(String(process.env.SMS_RELAY_DRAIN_ENABLED ?? '').trim().toLowerCase());
    for (const s of smsInbound.rows) {
      const detail = `id=${s.id} from=${s.fromPhone} chairman=${s.isChairman} sig=${s.signatureValid} age=${s.ageMin}m body="${s.body}"`;
      // QF-20260810-590: checked FIRST, unconditionally of the drain flag — a watchdog body is
      // never the chairman regardless of whether the drain is enabled.
      if (isWatchdogBody(s.body)) {
        console.log(`QUIET_TICK_SMS_WATCHDOG=adam ${detail} — automated are-you-still-there watchdog, not the chairman; check your own outbound cadence, do not reply-to-chairman. INFORMATIONAL, not a hard interrupt.`);
        continue;
      }
      if (!smsDrainEnabled) {
        // REGRESSION FIX (mine, from QF-20260808-834): the suppressed line used to carry NO token
        // at all. But the summary above still prints `sms=${smsInbound.count}` — that count is
        // rows.length and is completely independent of this flag — so a flag-off tick with
        // undrained rows printed `sms=1` alongside ZERO surfaced QUIET_TICK_ lines. That is the
        // count-vs-surface mismatch QF-20260808-673 names as a defect class: a reader trusting
        // "no lines = no SMS" treats the tick as a NO-OP and misses the chairman. I introduced it
        // by removing the token without reconciling the counter that still reports the rows.
        //
        // FOLLOWS THE ESTABLISHED CONVENTION rather than inventing one: QUIET_TICK_STALL_SUPPRESSED
        // and QUIET_TICK_VENTURE_PARK_SUPPRESSED are informational tokens DELIBERATELY ABSENT from
        // the NO-OP allowlist in adam-startup-check.mjs — they exist so an exclusion is never
        // silent, without waking anyone. This is the same shape: `sms=N` now reconciles against N
        // machine-greppable lines, and because the token is NOT allowlisted it does not re-arm the
        // hard interrupt toward a drain that is still inert.
        console.log(`QUIET_TICK_SMS_SUPPRESSED=adam ${detail} — undrained chairman SMS, but SMS_RELAY_DRAIN_ENABLED is unset so scripts/sms-relay-drain.cjs is a no-op. Recorded so sms=${smsInbound.count} never coexists with zero surfaced rows; INFORMATIONAL, not a hard interrupt. Durable fix: complete the SMS drain cutover.`);
        continue;
      }
      console.log(`QUIET_TICK_SMS_INBOUND=adam ${detail} — undrained chairman SMS; DRAIN+reply per CHAIRMAN SMS CHANNEL DUTY (node scripts/sms-relay-drain.cjs, then reply with node scripts/adam-chairman-sms.mjs --reply-to-inbound --kind heartbeat_status --body "<line>" to reach the quiet-hours measured-presence carve-out)`);
    }
    // SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-2: a parked row already terminal-drained
    // (drained_at is set) as a PARK_OUTCOMES value (no_match/rate_limited/expired/ambiguous),
    // so it will NEVER appear in the smsInbound loop above — this is the only surface that
    // re-fires it. Hard interrupt, unconditionally
    // (unlike QUIET_TICK_SMS_INBOUND above, there is no inert-drain-flag case to downgrade for:
    // resolving a parked row is a CLI script, not gated on SMS_RELAY_DRAIN_ENABLED).
    for (const s of smsParked.rows) {
      console.log(`QUIET_TICK_SMS_PARKED=adam id=${s.id} from=${s.fromPhone} age=${s.ageMin}m body="${s.body}" — parked chairman SMS awaiting disposition; resolve via node scripts/resolve-parked-chairman-sms.cjs ${s.id}`);
      // SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 FR-3: additive escalation — the line above fires
      // identically for a 2-minute-old row and a 6-day-old one, which is exactly how 356 rows
      // accumulated as unread noise. A distinct tag for anything >=24h makes a genuinely-overdue
      // row grep-able instead of indistinguishable from routine parked traffic.
      if (isStaleParkedSms(s.ageMin)) {
        console.log(`QUIET_TICK_SMS_PARKED_STALE=adam id=${s.id} from=${s.fromPhone} age=${s.ageMin}m — parked >=24h unresolved, chairman-channel integrity risk; resolve via node scripts/resolve-parked-chairman-sms.cjs ${s.id}`);
      }
    }
    for (const p of outboundSilence.probed) {
      console.log(`QUIET_TICK_OUTBOUND_PROBE=adam target=${p.target} row=${p.rowId}`);
    }
    // SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-3. Deliberately placed AFTER the
    // outboundSilence.probed loop above, not between the smsInbound.rows loop and it —
    // tests/unit/sms-count-render-invariant.test.js slices exactly that gap as "the SMS per-row
    // loop" and asserts a 1:1 console.log-to-QUIET_TICK-token ratio inside it; inserting an
    // unrelated loop there breaks that invariant's own accounting (this loop's token is emitted
    // by formatRatificationStaleLine, not inlined in this file's source text).
    for (const r of staleRatifications.rows) {
      console.log(formatRatificationStaleLine('adam', r, r.ageHours));
    }
    // SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-4: both stages feed the SAME
    // QUIET_TICK_RATIFICATION_STALE token as FR-3 (a regression IS a staleness case — the
    // encoding was reverted), per the PRD's own wiring instruction.
    for (const r of regressedRatifications.rows) {
      const sectionId = r.encoded_ref && r.encoded_ref.section_id;
      console.log(`QUIET_TICK_RATIFICATION_STALE=adam id=${r.id} REGRESSED stage1_section_removed=${r.stage1} stage2_marker_missing=${r.stage2} section=${sectionId} — an already-encoded chairman ratification's clause was silently reverted; re-encode via lib/chairman/ratification-writer.mjs markRatificationEncoded().`);
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
