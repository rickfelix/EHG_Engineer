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
import { TABLE as TASK_LEDGER_TABLE, syncParentRollupStatus } from '../lib/adam/task-ledger.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { decideCadence, detectSalientDelta, runCoresFailSoft } = require('../lib/coordinator/quiet-tick.cjs');
// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2/FR-3): surface which Claude account the fleet
// is running under, and detect a genuine account switch across ticks.
const { getAccountIdentity, detectAccountSwitch } = require('../lib/fleet/account-identity.cjs');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');

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

export async function checkVentureTraversalStalls(sb, priorSnapshot = {}) {
  const thresholdIso = new Date(Date.now() - VENTURE_STALL_THRESHOLD_MS).toISOString();
  const snapshot = {};
  const alerted = [];
  try {
    const { data: stuck } = await sb
      .from('ventures')
      .select('id, name, orchestrator_state, status, updated_at')
      .eq('status', 'active')
      .eq('orchestrator_state', 'blocked')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .lt('updated_at', thresholdIso);

    for (const v of (stuck || [])) {
      const { data: recent } = await sb
        .from('stage_executions')
        .select('id')
        .eq('venture_id', v.id)
        .gte('updated_at', thresholdIso)
        .limit(1);
      if (recent && recent.length > 0) continue; // actively executing, not stalled

      const escalated = !!priorSnapshot[v.id];
      snapshot[v.id] = priorSnapshot[v.id] || Date.now();
      alerted.push({ id: v.id, name: v.name, orchestrator_state: v.orchestrator_state, escalated });
    }
  } catch (e) {
    return { snapshot: priorSnapshot, alerted: [], error: e && e.message };
  }
  return { snapshot, alerted };
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

    const isDirectiveRow = (r) =>
      (r.payload && (DIRECTIVE_KINDS.includes(r.payload.kind) || r.payload.reply_needed || r.payload.reply_to)) || false;

    // Print-once dedup applies to the ITEM class only. DIRECTIVE-class rows are HARD
    // interrupts: they re-print EVERY tick until acknowledged_at converges them OR a
    // correlated reply is found — deduping a directive would let a single missed turn
    // hide it forever (the exact failure class this SD closes; adversarial review of PR #5802).
    const eligible = (rows || []).filter((r) => {
      const k = r.payload && r.payload.kind;
      if (k != null && ADAM_EXCLUDED_KINDS.includes(k)) return false;
      // SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-4 (instance 3): a courtesy-ACK
      // (kind='ack'/'coordinator_ack', already excluded from Adam's own inbox above) echoing
      // this directive's correlation_id must never suppress the eventual genuine reply/verdict.
      if (isDirectiveRow(r)) return !hasCorrelatedReply(r, correlationWindow || [], { excludeKinds: ADAM_EXCLUDED_KINDS });
      return !(r.payload && r.payload.tick_surfaced_at);
    });
    // FR-5: capHit now reflects a genuine authored-item backlog exceeding the display budget
    // (eligible.length > cap) OR the raw fetch itself being truncated (rows.length hit its own
    // higher ceiling) -- NOT "the raw window happened to contain 50 rows," which previously gave
    // a false CAP signal even when every one of those 50 rows was mechanical noise (eligible:[]).
    const capHit = eligible.length > INBOX_DISPLAY_CAP || (rows || []).length === INBOX_RAW_FETCH_LIMIT;
    if (eligible.length === 0) return { items: [], directives: 0, capHit };

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
    return { items, directives: items.filter((i) => i.isDirective).length, capHit };
  } catch (e) {
    return { items: [], directives: 0, error: e && e.message };
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
  let ventureStall = { snapshot: priorVentureStallSnapshot, alerted: [] };
  try {
    ventureStall = await checkVentureTraversalStalls(sb, priorVentureStallSnapshot);
  } catch (e) {
    ventureStall = { snapshot: priorVentureStallSnapshot, alerted: [], error: e && e.message };
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

  // FR-4: belt-countdown + offer-help collapse to a salient-delta check — Adam only
  // reaches the coordinator on a real belt/venture delta, never a "still idle" status.
  const salient = await readSalientState(sb);
  const delta = detectSalientDelta(priorSalient, salient);
  saveLastState({ salient, stallSnapshot: stall.snapshot, ventureStallSnapshot: ventureStall.snapshot });

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
        await insertCoordinationRow(sb, {
          sender_type: 'adam',
          target_session: coordinatorId,
          message_type: 'INFO',
          subject: '[ACCOUNT_SWITCH] Adam session Claude account changed',
          body: `Adam's Claude account switched from ${acctSwitch.event.from.email} (${acctSwitch.event.from.orgName}) ` +
            `to ${acctSwitch.event.to.email} (${acctSwitch.event.to.orgName}).`,
          payload: { kind: 'account_switch_notice', ...acctSwitch.event, reply_class: 'fire-and-forget' },
        });
        acctNotified = true;
      }
    } catch { /* fail-soft — see comment above; acctNotified stays false, baseline not advanced */ }
    if (acctNotified && currentIdentity) saveLastAccountIdentity(currentIdentity);
  }

  const delaySeconds = decideCadence({ quiescent, partyOffsetS: ADAM_PARTY_OFFSET_S });

  const result = {
    party: 'adam',
    mode: quiescent ? 'QUIESCENT' : 'ACTIVE',
    modeReason,
    acct: acctLabel,
    cores: tick.summary,
    failedCount: tick.failedCount,
    boardReconcile,
    stallAlerted: stall.alerted,
    ventureStallAlerted: ventureStall.alerted,
    inboxSurfaced: inboxSurface.items.length,
    inboxDirectives: inboxSurface.directives,
    outboundSilence,
    crossPartyPing: delta.changed,
    pingFields: delta.fields,
    accountSwitch: acctSwitch.changed,
    accountSwitchNotified: acctSwitch.changed ? acctNotified : null,
    nextWakeSeconds: delaySeconds,
  };

  if (asJson) {
    console.log(JSON.stringify(result));
  } else {
    console.log(
      `QUIET_TICK=adam mode=${result.mode} acct=${acctLabel} cores=[${tick.summary}] ` +
      `fail=${tick.failedCount} ` +
      `reconcile=parents:${boardReconcile.parents},errors:${boardReconcile.errors.length} ` +
      `stalls=${stall.alerted.length} ` +
      `ventureStalls=${ventureStall.alerted.length} ` +
      `inbox=${inboxSurface.items.length}(dir:${inboxSurface.directives}) ` +
      `probes=${outboundSilence.probed.length} esc=${outboundSilence.escalated.length} ` +
      `ping=${delta.changed ? delta.fields.join(',') : 'suppressed'} ` +
      `nextWakeSeconds=${delaySeconds} :: ${modeReason}`
    );
    if (delta.changed) {
      console.log(`QUIET_TICK_PING=adam->coordinator reason=${delta.fields.join(',')} (real delta — offer help / sourcing; if sending a subject-only stub ping, stamp payload.kind='cross_party_ping' per SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-5 — mechanical, never authored)`);
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
    for (const v of ventureStall.alerted) {
      console.log(`QUIET_TICK_VENTURE_STALL_ALERT=adam venture=${v.id} name="${v.name}" state=${v.orchestrator_state} escalated=${v.escalated}`);
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
    for (const p of outboundSilence.probed) {
      console.log(`QUIET_TICK_OUTBOUND_PROBE=adam target=${p.target} row=${p.rowId}`);
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
