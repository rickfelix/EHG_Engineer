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

export async function surfaceInboxItems(sb) {
  try {
    const { resolveAdamSessionId } = require('./read-adam-directives.cjs');
    const { DIRECTIVE_KINDS, ADAM_EXCLUDED_KINDS } = require('../lib/fleet/worker-status.cjs');
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
      .limit(50);
    if (error) return { items: [], directives: 0, error: error.message };

    const isDirectiveRow = (r) =>
      (r.payload && (DIRECTIVE_KINDS.includes(r.payload.kind) || r.payload.reply_needed || r.payload.reply_to)) || false;

    // Print-once dedup applies to the ITEM class only. DIRECTIVE-class rows are HARD
    // interrupts: they re-print EVERY tick until acknowledged_at converges them —
    // deduping a directive would let a single missed turn hide it forever (the exact
    // failure class this SD closes; adversarial review of PR #5802).
    const eligible = (rows || []).filter((r) => {
      const k = r.payload && r.payload.kind;
      if (k != null && ADAM_EXCLUDED_KINDS.includes(k)) return false;
      if (isDirectiveRow(r)) return true;
      return !(r.payload && r.payload.tick_surfaced_at);
    });
    const capHit = (rows || []).length === 50;
    if (eligible.length === 0) return { items: [], directives: 0, capHit };

    const items = eligible.map((r) => {
      const k = (r.payload && r.payload.kind) || '(untyped)';
      const isDirective = isDirectiveRow(r);
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      const subject = String(r.subject || (r.payload && r.payload.body) || r.body || '(empty)').replace(/\s+/g, ' ').slice(0, 140);
      return { id: r.id, kind: k, isDirective, ageMin, subject };
    });

    // Stamp the dedup marker on ITEM-class rows only (visibility marker — the row stays
    // unread/unacked-recoverable; directives are deliberately never marked).
    const seenAt = new Date().toISOString();
    for (const r of eligible.filter((x) => !isDirectiveRow(x) && !(x.payload && x.payload.tick_surfaced_at))) {
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

  const delaySeconds = decideCadence({ quiescent, partyOffsetS: ADAM_PARTY_OFFSET_S });

  const result = {
    party: 'adam',
    mode: quiescent ? 'QUIESCENT' : 'ACTIVE',
    modeReason,
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
      `ventureStalls=${ventureStall.alerted.length} ` +
      `inbox=${inboxSurface.items.length}(dir:${inboxSurface.directives}) ` +
      `probes=${outboundSilence.probed.length} esc=${outboundSilence.escalated.length} ` +
      `ping=${delta.changed ? delta.fields.join(',') : 'suppressed'} ` +
      `nextWakeSeconds=${delaySeconds} :: ${modeReason}`
    );
    if (delta.changed) {
      console.log(`QUIET_TICK_PING=adam->coordinator reason=${delta.fields.join(',')} (real delta — offer help / sourcing)`);
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
