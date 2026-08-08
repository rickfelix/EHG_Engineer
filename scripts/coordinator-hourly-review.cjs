#!/usr/bin/env node
/**
 * coordinator-hourly-review.cjs — hourly responsibilities review for the COORDINATOR
 * plus a reminder dispatched to the live ADAM session, with built-in CYCLE-DOWN.
 *
 * Chairman request (2026-06-09):
 *   1. recurring hourly reminder for the coordinator to review its responsibilities,
 *   2. and for Adam to review its responsibilities,
 *   3. that CYCLES DOWN (self-suppresses) when no work is happening / the fleet is
 *      stopped — "no need to remind anyone of their job when the line is stopped",
 *   4. incorporated into coordinator startup AND Adam startup.
 *
 * Gate = lib/coordinator/fleet-quiescence.assessFleetActivity (fail-open to ACTIVE).
 * When quiescent -> print a one-line CYCLE-DOWN and exit 0 (no reminder, cheap turn).
 *
 * Adam leg resolves the LIVE Adam session at fire time (claude_sessions metadata
 * role='adam', fresh heartbeat_at) and dispatches via the validated dispatch guard —
 * NO hardcoded UUID, so it survives Adam restarts and silently skips when Adam is absent.
 *
 * SD-LEO-INFRA-SOLOMON-REFRESHER-FOUNDATIONS-EXTENSION-001: the Solomon leg's re-affirmation SET is
 * {role contract, Constitution, Mission/Vision, operating model} — not just the role contract — via
 * buildFoundationsPointer(), which POINTS at the canonical sources (protocol_constitution table,
 * docs/vision/ehg-mission-vision-canonical.md, eva_vision_documents, the two operating-model docs) rather
 * than embedding a paraphrase, so the grounding is first-hand + current.
 *
 * Flags:
 *   --dry-run   assess + print, but do NOT dispatch to Adam (for arming/testing).
 *
 * Exit code ALWAYS 0 (fail-open — a reminder loop must never wedge the session).
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
// SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: resolve the LIVE Solomon session at fire time
// (metadata.role='solomon', fresh heartbeat) via the canonical resolver — NO hardcoded UUID.
// SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-1: fetchAllSolomons + retargetStaleSolomonInbound
// were already exported (FR-2 of a prior SD) but had no periodic caller -- retargeting only ever
// happened on the NEXT Solomon registration event. Wiring them into this existing hourly tick
// closes that gap without touching either function's signature.
const { getActiveSolomonId, fetchAllSolomons, retargetStaleSolomonInbound } = require('../lib/coordinator/solomon-identity.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const ADAM_FRESH_S = Number(process.env.ADAM_FRESH_SECONDS || 600);

// Coordinator SRE duties — mirrors the /coordinator charter + coordinator-startup-check.
const COORDINATOR_DUTIES = [
  'Resource-pool: worktrees/claims/CI/rate-limits — reclaim BEFORE exhaustion stalls the line.',
  'Liveness: heartbeat + loop_state distinguish working/idle-alive/dead — auto-recover; loops self-reschedule.',
  'Flow + silent-failure: cycle-time, WIP limits, stuck/dead-letter/repeat-gate-fail workers — intervene (agents do not raise their hand).',
  'Dependency watch: blocked vs ready, critical path; orchestrator PARENTS auto-complete (never dispatch a parent).',
  'Keep workers busy (KPI): an idle worker while sourceable, conflict-free work exists = failure.',
  'Deploy-verification: SYNC -> RESTART -> CANARY. Merged + git-synced != RUNNING.',
  'Teardown discipline: never tear down while workers are active.',
];

// DRIFT-CHECK, NOT FULL RE-READ (coordinator 0ab6a99c, 2026-08-01, on Adam's ruling; reported by Solomon
// 52f5bab8, correlation 0be4e4f9). The previous wording said "re-read", which LITERALLY mandates re-reading
// ~30k tokens of provably-unchanged foundation docs EVERY HOUR. Solomon complied via a drift-check
// (content-hash / mtime / row-count, full re-read only on change) — but that was HIS INTERPRETATION, not the
// text. That gap is the defect: a directive whose literal reading and whose efficient reading diverge gets
// obeyed LITERALLY by exactly the sessions least able to afford it, and nothing signals when that happens.
// The drift-check gives the IDENTICAL grounding guarantee at ~1/30th the cost. Do NOT revert this to
// "re-read" — the grounding requirement is unchanged, only the method of establishing it is stated.
// Adam ruled it applies to BOTH role reminders because the same hazard sat in his own.

// Adam role-contract reminders — mirrors CLAUDE_ADAM.md / CONST-002 + the 8-dim self-rubric.
const ADAM_REMINDER =
  'Hourly responsibilities review: VERIFY your role contract UNCHANGED (content-hash / mtime / row-count); ' +
  'fully re-read ONLY what changed — CONST-002 (PROPOSE, never execute/accept/graduate), ' +
  'silence-by-default, one-advisory-per-tick, the hard rationale bar (cite a LIVE KR + counterfactual + dedup + CONST self-check), ' +
  'and your 8-dim self-rubric (D1_proactive_sourcing..D8_interface_clarity). Stay silent unless you have ONE ranked, defensible advisory.';

// SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: Solomon role-contract reminder — mirrors CLAUDE_SOLOMON.md
// / CONST-002 propose-only, silence-by-default, the consult triage gate, and Solomon's 5-dim self-rubric.
const SOLOMON_REMINDER =
  'Hourly responsibilities review: VERIFY your Solomon role contract (CLAUDE_SOLOMON.md) UNCHANGED ' +
  '(content-hash / mtime / row-count); fully re-read ONLY what changed — CONST-002 ' +
  '(PROPOSE, never execute/accept/graduate), silence-by-default, the consult triage gate (answer routed ' +
  'solomon_consult only — do not poll for problems), the per-sweep task_budget at ENTRY before any Read/Grep, ' +
  'and your 5-dim self-rubric. Stay silent unless you have a deep, defensible oracle answer.';

// SD-LEO-INFRA-SOLOMON-REFRESHER-FOUNDATIONS-EXTENSION-001: widens the Solomon re-affirmation SET from
// {role contract} to {role contract, Constitution, Mission/Vision, operating model}. This POINTS Solomon at
// the CANONICAL sources rather than embedding a paraphrase — Solomon's higher-order-framing and Adam-
// grounding-completeness duties both require FIRST-HAND, CURRENT grounding, not a copy baked into this
// script that goes stale the moment the Constitution/Vision changes. Kept CHEAP: a single lightweight
// protocol_constitution row-count query (fail-open to a static pointer) + fixed, small doc paths — no full
// text is fetched or embedded. Exported for tests.
const CANONICAL_CONSTITUTION_TABLE = 'protocol_constitution';
const CANONICAL_MISSION_VISION_DOC = 'docs/vision/ehg-mission-vision-canonical.md';
const CANONICAL_OPERATING_MODEL_DOCS = [
  'docs/03_protocols_and_standards/venture-hosting-standard.md',
  'docs/03_protocols_and_standards/only-the-chairman-can.md',
];

async function buildFoundationsPointer(sb) {
  // DRIFT-CHECK SHAPE (see the ADAM_REMINDER comment above for provenance). This pointer is the ~30k-token
  // bulk Solomon named. Note it ALREADY computes the row count below — that IS the drift signal, so the
  // reminder now hands it over as the verification anchor instead of computing it and then saying "re-read".
  let constPart = 'Constitution: VERIFY ' + CANONICAL_CONSTITUTION_TABLE +
    ' unchanged by row-count (CONST-001..014); full re-read ONLY if the count or any rule_code moved.';
  try {
    const { data } = await sb.from(CANONICAL_CONSTITUTION_TABLE).select('rule_code').order('rule_code');
    const codes = (data || []).map(function (r) { return r.rule_code; }).filter(Boolean);
    if (codes.length > 0) {
      constPart = 'Constitution: ' + CANONICAL_CONSTITUTION_TABLE + ' has ' + codes.length +
        ' rule(s) (' + codes[0] + '..' + codes[codes.length - 1] + ') — VERIFY count+range vs your last ' +
        'grounding; full re-read ONLY on mismatch.';
    }
  } catch (e) {
    // fail-open to the static pointer above — a foundations refresh must never block the reminder
  }
  return (
    constPart + ' ' +
    'Mission/Vision: VERIFY ' + CANONICAL_MISSION_VISION_DOC + ' (chairman-approved canonical) unchanged by ' +
    'content-hash/mtime, and your eva_vision_documents entries by updated_at; full re-read ONLY on change. ' +
    'Operating model: VERIFY ' + CANONICAL_OPERATING_MODEL_DOCS.join(' and ') +
    ' unchanged by content-hash/mtime; full re-read ONLY on change.'
  );
}

// SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: the Solomon leg — mirrors the Adam leg but resolves the
// live Solomon via getActiveSolomonId (no hardcoded UUID), reuses the SAME hourly cadence, dispatch guard,
// and cycle-down gate (the caller checks assessFleetActivity ONCE before invoking this). Self-contained
// (returns a verdict; does NOT exit main) so it composes alongside the Adam leg. Fail-open / non-fatal.
// Exported for tests. @returns {Promise<{dispatched:boolean, reason?:string, target?:string}>}
async function dispatchSolomonReminder(sb, { dryRun = DRY_RUN, resolveSolomon = getActiveSolomonId, insert = insertCoordinationRow, buildFoundations = buildFoundationsPointer } = {}) {
  try {
    const solomonId = await resolveSolomon(sb);
    if (!solomonId) {
      console.log('\n[HOURLY-REVIEW] Solomon: no live session — skipping Solomon reminder (itself a cycle-down).');
      return { dispatched: false, reason: 'no_live_solomon' };
    }
    if (dryRun) {
      console.log('\n[HOURLY-REVIEW] Solomon: would dispatch reminder to ' + String(solomonId).slice(0, 8) + '. [dry-run, not sent]');
      return { dispatched: false, reason: 'dry_run', target: solomonId };
    }
    // SD-LEO-INFRA-SOLOMON-REFRESHER-FOUNDATIONS-EXTENSION-001: only build the foundations pointer on the
    // real-dispatch path (not on the no-Solomon / dry-run early returns) — cheap, and "re-read only when
    // not idle" per the SD's cycle-down preservation requirement.
    const foundationsPointer = await buildFoundations(sb);
    const body = SOLOMON_REMINDER + '\n\nAlso re-affirm the FOUNDATIONS first-hand (your higher-order-' +
      'framing and Adam-grounding-completeness duties require current C/M/V grounding): ' + foundationsPointer;
    const row = {
      sender_session: process.env.CLAUDE_SESSION_ID || null,
      sender_type: 'coordinator',
      target_session: solomonId,
      message_type: 'INFO',
      subject: 'Hourly: review your Solomon responsibilities',
      body: body,
      payload: { kind: 'coordinator_reminder', topic: 'solomon_responsibilities', sent_at: new Date().toISOString() },
      expires_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    };
    await insert(sb, row, { logger: console });
    console.log('\n[HOURLY-REVIEW] Solomon: reminder dispatched to ' + String(solomonId).slice(0, 8) + '.');
    return { dispatched: true, target: solomonId };
  } catch (e) {
    console.log('[HOURLY-REVIEW] Solomon reminder skipped (non-fatal): ' + e.message);
    return { dispatched: false, reason: 'error' };
  }
}

/**
 * SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-1: periodic stale-identity reconciliation for the
 * Solomon lane. Solomon's own MODE-B advisory (session_coordination 09189ed9) instance (1): role-mail
 * retargeting was EVENT-driven only (a new Solomon registration), so a resolution fault or a gap
 * between a Solomon's death and its successor's registration left rows silently stranded at a stale
 * target for hours. This rides the SAME hourly cadence as dispatchSolomonReminder (no new scheduler):
 * resolve the live Solomon, list every OTHER role=solomon session (fetchAllSolomons, unfiltered by
 * freshness), and retarget each stale one's still-unread rows via the existing, unmodified
 * retargetStaleSolomonInbound primitive. Fail-open / non-fatal, mirrors the sibling reminder leg.
 * @returns {Promise<{reconciled:number, staleCount:number, reason?:string}>}
 */
async function reconcileStaleSolomonInbound(sb, { dryRun = DRY_RUN, resolveSolomon = getActiveSolomonId, fetchAll = fetchAllSolomons, retarget = retargetStaleSolomonInbound } = {}) {
  try {
    const liveSolomon = await resolveSolomon(sb);
    if (!liveSolomon) {
      return { reconciled: 0, staleCount: 0, reason: 'no_live_solomon' };
    }
    const allSolomons = await fetchAll(sb);
    const staleIds = Array.from(new Set(
      (allSolomons || [])
        .map(function (s) { return s && s.session_id; })
        .filter(function (id) { return id && id !== liveSolomon; })
    ));
    if (staleIds.length === 0) {
      return { reconciled: 0, staleCount: 0 };
    }
    if (dryRun) {
      console.log('\n[HOURLY-REVIEW] Solomon reconcile: would check ' + staleIds.length + ' stale identity(ies). [dry-run, not retargeted]');
      return { reconciled: 0, staleCount: staleIds.length, reason: 'dry_run' };
    }
    let reconciled = 0;
    for (const staleId of staleIds) {
      const result = await retarget(sb, { staleOriginator: staleId, liveSolomon });
      if (result && result.error) {
        console.log('[HOURLY-REVIEW] Solomon reconcile: retarget error for ' + String(staleId).slice(0, 8) + ' (non-fatal): ' + result.error);
        continue;
      }
      reconciled += (result && result.retargeted) || 0;
    }
    if (reconciled > 0) {
      console.log('\n[HOURLY-REVIEW] Solomon reconcile: re-targeted ' + reconciled + ' stale-addressed row(s) to the live Solomon (' + String(liveSolomon).slice(0, 8) + ').');
    }
    return { reconciled: reconciled, staleCount: staleIds.length };
  } catch (e) {
    console.log('[HOURLY-REVIEW] Solomon reconcile skipped (non-fatal): ' + e.message);
    return { reconciled: 0, staleCount: 0, reason: 'error' };
  }
}

async function resolveLiveAdam(sb, freshS) {
  // Filter role=adam SERVER-SIDE + order by heartbeat — an unfiltered select hits
  // Supabase's 1000-row cap and can miss Adam's row entirely.
  const { data } = await sb.from('claude_sessions')
    .select('session_id, heartbeat_at, metadata')
    .contains('metadata', { role: 'adam' })
    .order('heartbeat_at', { ascending: false })
    .limit(5);
  const now = Date.now();
  const adams = (data || [])
    .filter(function (s) { return s.heartbeat_at; })
    .map(function (s) { return { id: s.session_id, ageS: (now - new Date(s.heartbeat_at).getTime()) / 1000 }; })
    .filter(function (s) { return s.ageS < freshS; })
    .sort(function (a, b) { return a.ageS - b.ageS; });
  return adams[0] || null;
}

/**
 * GAUGE HEALTH — HOISTED OUT OF THE REMINDER LEGS ON PURPOSE.
 * This lived at the tail of main(), behind three early returns: fleet-quiescent CYCLE-DOWN, no live
 * Adam, and dry-run. So the one surface that distinguishes "gauges deduped and still watching" from
 * "gauges silently dead" could not evaluate precisely when the fleet was idle and nobody was
 * watching — the longest a dead gauge system would go unnoticed. It is a who-watches-the-watchmen
 * check with no dependency on Adam, on dry-run, or on fleet activity, so it runs unconditionally
 * and reads/logs only.
 */
async function reportGaugeHealth(sb) {
// SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-4 (invariant #0, who-watches-the-watchmen):
// an EXTERNAL check (this process is independently cron'd, separate from gauge-runner.mjs
// itself) that the gauge-runner is observably alive. A dead runner is a worse failure than any
// single invariant drifting (false all-clear) -- so a stale/missing heartbeat alarms here.
try {
  const { checkGaugeRunnerLiveness } = await import('../lib/governance/gauge-runner-liveness.js');
  // SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-B FR-3: take the newest NON-SYNTHETIC heartbeat, not simply
  // the newest row. This read takes ORDER BY scanned_at DESC LIMIT 1, so ONE synthetic row in this
  // dimension was enough to make a DEAD gauge runner report ALIVE — a single row defeats it, which
  // is why the fix is a scan window rather than a bigger sample.
  const { data: hbRows } = await sb.from('codebase_health_snapshots')
    .select('scanned_at, findings, metadata')
    .eq('dimension', 'gauge_runner_heartbeat')
    .order('scanned_at', { ascending: false })
    .limit(25);
  let isFixtureHealthSnapshot = null;
  try {
    ({ isFixtureHealthSnapshot } = await import('../lib/governance/fixture-exclusion.mjs'));
  } catch (e) {
    // ANNOUNCE rather than silently evaluating unfiltered — see the same note in health-urgency.js.
    console.error(`[coordinator-hourly-review] fixture predicate unavailable, heartbeat read UNFILTERED: ${e?.message || e}`);
  }
  const hbUsable = typeof isFixtureHealthSnapshot === 'function'
    ? (hbRows || []).filter((r) => !isFixtureHealthSnapshot(r))
    : (hbRows || []);
  // No real heartbeat in the window leaves hb undefined, so checkGaugeRunnerLiveness receives
  // undefined and reports DEAD — the correct direction for a liveness alarm.
  const hb = hbUsable[0];
  const liveness = checkGaugeRunnerLiveness(hb?.scanned_at, Date.now());
  if (liveness.alarm) {
    const ageNote = liveness.ageMs == null ? 'no heartbeat ever recorded' : Math.floor(liveness.ageMs / 60000) + 'm stale';
    console.log('\n[HOURLY-REVIEW] GAUGE-RUNNER LIVENESS ALARM — invariant gauges may be silently NOT running (' + ageNote + '). Investigate scripts/gauge-runner.mjs.');
  }

  // SD-FDBK-INFRA-LESSONS-CONVERSION-WIRING-001: SIGNAL liveness, not just PROCESS liveness.
  // The check above proves the runner RAN. It cannot prove the gauges still SEE anything —
  // writeHeartbeat fires unconditionally with a hardcoded score of 100 regardless of detector
  // outcomes, so a runner that executes flawlessly while every detector returns nothing produces
  // a perfect heartbeat. That gap became load-bearing when gauge findings started deduping:
  // nothing in this repo ever CLEARS a gauge finding, so `inserted` is 0 from the very first run
  // and stays there. `suppressed > 0` is the ONLY evidence the gauges are still watching.
  // ALL-QUIET IS THE ALARM CONDITION: every counter zero means either the detectors stopped
  // tripping or they stopped working, and those must not look identical.
  const routing = Array.isArray(hb?.findings) ? hb.findings[0] : null;
  if (routing && ['inserted', 'suppressed', 'skipped', 'error'].some((k) => typeof routing[k] === 'number')) {
    const { inserted = 0, suppressed = 0, skipped = 0, error = 0 } = routing;
    if (inserted + suppressed + skipped + error === 0) {
      console.log('\n[HOURLY-REVIEW] GAUGE SIGNAL ALARM — the runner is alive but routed NOTHING last pass '
        + '(inserted=0 suppressed=0 skipped=0 error=0). Either every detector stopped tripping or every '
        + 'detector stopped working; a healthy deduped pass reports suppressed>0. Investigate before trusting the gauges.');
    } else if (inserted > 0 && suppressed === 0) {
      // THE ALARM THAT WOULD HAVE CAUGHT THE DEFECT THIS PR ALMOST SHIPPED. The first version of
      // findOpenFinding filtered on a NOT NULL column being NULL, so the lookup could never match
      // and every pass took the INSERT branch — dedup permanently inert, amplification unchanged,
      // and the all-quiet alarm above silent because the counters were NOT all zero. Standing
      // trips are what this system is made of: after the first pass a working dedup ALWAYS reports
      // suppressed>0. inserted>0 with suppressed==0, pass after pass, is the signature of a dedup
      // that is not deduping — the exact shape 162 green unit tests failed to see.
      console.log('\n[HOURLY-REVIEW] GAUGE DEDUP ALARM — ' + inserted + ' inserted, 0 suppressed. Every gauge '
        + 'finding was NEW, which after the first pass means the dedup lookup is matching nothing (a filter that '
        + 'cannot match the rows the runner itself writes). Amplification is uncontrolled. Check findOpenFinding '
        + 'in lib/governance/plan-drift-detectors.js against the live feedback column definitions.');
    } else if (error > 0) {
      // Routing errors fail toward a duplicate row, so they never surface as silence — but they do
      // mean freshness stamps are being lost, and nothing else reports them.
      console.log('\n[HOURLY-REVIEW] GAUGE ROUTING ERRORS — ' + error + ' of '
        + (inserted + suppressed + skipped + error) + ' gauges failed to route last pass '
        + '(inserted=' + inserted + ' suppressed=' + suppressed + '). Stamps are being dropped.');
    } else {
      console.log('[HOURLY-REVIEW] gauge routing last pass: inserted=' + inserted + ' suppressed=' + suppressed
        + ' skipped=' + skipped + ' error=' + error);
    }
  }
} catch (e) {
  console.log('[HOURLY-REVIEW] gauge-runner liveness check skipped (non-fatal): ' + e.message);
}

}

/**
 * Render the six-axis drive state. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001 FR-6.
 *
 * This review is one of the three Layer-3 consumers FR-6 names as hand-concatenating their own
 * output. It now renders FROM the probe.
 *
 * THE REFUSAL IS NOT SWALLOWED (FR-6 AC-3). renderDriveState THROWS on an incomplete verdict;
 * catching that and printing the axes that happened to succeed is the defect this SD removes, and
 * silently reverting to hand-formatting is explicitly prohibited. So the catch prints the REFUSAL
 * banner — visible, labelled not-an-all-clear — and the try wraps only the compute, never a
 * fallback formatter. There is deliberately NO env gate (AC-4): an adoption criterion satisfiable
 * by code that never runs is the 'registration is not drainage' anti-precedent.
 */
async function reportDriveState(sb) {
  const { computeDriveState } = require('../lib/governance/drive-state/index.cjs');
  const { ADAPTERS } = require('../lib/governance/drive-state/adapters.cjs');
  const { renderDriveState, renderRefusal } = require('../lib/governance/drive-state/render.cjs');

  let lines;
  let verdict = null;
  try {
    verdict = await computeDriveState({ adapters: ADAPTERS, supabase: sb });
    lines = renderDriveState(verdict); // returns an ARRAY of lines
  } catch (e) {
    verdict = null;
    lines = renderRefusal(e && e.message ? e.message : String(e));
  }
  console.log('');
  for (const line of lines) console.log(line);

  // SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 FR-3 — THE SINGLE WRITER.
  //
  // This review is the ONLY caller that persists. adam-pm-board.mjs computes the same verdict and
  // deliberately does NOT write: both writing would record the same instant under two run_ids and
  // silently inflate every count and duration derived from the table. This review is chosen because
  // its cadence is regular and external, which is what makes a time series interpretable; the PM
  // board is on-demand and would sample irregularly. THAT IS A DECISION WITH A REASON — if you are
  // here to "fix" the missing write on the PM board, this comment is why it is missing.
  //
  // ORDER IS LOAD-BEARING: the render above has already happened and is never gated on the write.
  //
  // THE FAILURE IS VISIBLE, NOT SWALLOWED. An earlier draft required the output be byte-identical
  // under a persistence failure — but byte-identical means INVISIBLE, and persistence could then be
  // dead for weeks while every hourly report looked perfectly normal. That is precisely the defect
  // this SD exists to remove, recreated one layer down. So the existing lines are untouched AND a
  // distinguishable banner is printed when the write fails.
  await persistRenderedVerdict(verdict, sb);
}

/**
 * EXPORTED SO IT CAN BE EXECUTED BY A TEST, and that is the whole reason it is a function.
 *
 * The first version of this lived inline in reportDriveState and was "covered" by two regexes over
 * this file's own source text. A mutation review then dead-coded the call — `if (false) await
 * persistDriveState(...)` — and it SURVIVED the entire unit project, 3063 files and 37,365 tests.
 * Silent in production too: no write, no banner, no failure. That is precisely this SD's own thesis
 * ("an axis can sit stalled indefinitely while every hourly render reads as normal") reproduced one
 * layer down, inside the fix written to remove it. A regex pins a STATEMENT FORM; only an executed
 * test pins the DATA FLOW.
 *
 * @param {object|null} verdict computeDriveState's return: {axes, summary, measured_at}
 * @param {object} sb supabase client
 */
async function persistRenderedVerdict(verdict, sb) {
  // The verdict's own field is `axes` (index.cjs:70), NOT `entries`.
  if (!verdict || !Array.isArray(verdict.axes)) return { persisted: false, reason: 'no_verdict' };

  const { persistDriveState } = require('./lib/drive-state-verdict-store.cjs');
  // measured_at is the compute's SINGLE clock read. Taking a fresh timestamp here would stamp the
  // six rows a moment after the verdict they came from, so the history and the report would
  // disagree about when the reading happened.
  const runId = verdict.measured_at;
  try {
    const res = await persistDriveState({ supabase: sb, runId, entries: verdict.axes });
    return { persisted: true, run_id: runId, written: res.written };
  } catch (e) {
    // VISIBLE, never swallowed. Byte-identical output under failure would mean persistence could
    // be dead for weeks while every report looked normal.
    console.log(`⚠️  DRIVE-STATE HISTORY NOT WRITTEN (${e && e.message ? e.message : String(e)}) — the verdict above rendered, but it was NOT recorded, so no duration question can be answered about this run.`);
    return { persisted: false, reason: 'write_failed', error: e && e.message ? e.message : String(e) };
  }
}


async function main() {
  let sb;
  try { sb = createSupabaseServiceClient(); }
  catch (e) { console.log('[HOURLY-REVIEW] supabase unavailable (non-fatal): ' + e.message); return; }

  // BEFORE the quiescence gate: a dead gauge system is most dangerous when the fleet is idle.
  await reportGaugeHealth(sb);

  // FULL-SPECTRUM DRIVE STATE — SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-6.
  // ALSO before the quiescence gate, and for a stronger version of the same reason: a stalled axis
  // is most dangerous precisely when the fleet looks quiet. The CYCLE-DOWN branch below returns
  // early with "skipping reminders", and a reader seeing that on a quiet hour concludes there is
  // nothing to drive — which is the exact inference this SD exists to make uninferable. As
  // measured live while writing this, a quiescent-looking fleet had THREE stalled axes.
  await reportDriveState(sb);

  const activity = await assessFleetActivity(sb);
  if (activity.quiescent) {
    console.log('[HOURLY-REVIEW] CYCLE-DOWN — ' + activity.reason + '. Skipping coordinator + Adam reminders.');
    return;
  }

  console.log('[HOURLY-REVIEW] fleet ' + activity.reason + ' — running reminders.' + (DRY_RUN ? ' (dry-run)' : ''));
  console.log('\n-- Coordinator responsibilities (SRE charter) --');
  COORDINATOR_DUTIES.forEach(function (d, i) { console.log('  ' + (i + 1) + '. ' + d); });

  // SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: the Solomon leg runs BEFORE the Adam leg because the
  // Adam leg `return`s from main on no-Adam/dry-run; the cycle-down gate above already guards both legs.
  await dispatchSolomonReminder(sb);
  // SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-1: periodic stale-identity reconciliation, same tick.
  await reconcileStaleSolomonInbound(sb);

  // Adam leg
  try {
    const adam = await resolveLiveAdam(sb, ADAM_FRESH_S);
    if (!adam) {
      console.log('\n[HOURLY-REVIEW] Adam: no live session — skipping Adam reminder (itself a cycle-down).');
      return;
    }
    if (DRY_RUN) {
      console.log('\n[HOURLY-REVIEW] Adam: would dispatch reminder to ' + adam.id.slice(0, 8) + ' (hb ' + Math.round(adam.ageS) + 's). [dry-run, not sent]');
      return;
    }
    const row = {
      sender_session: process.env.CLAUDE_SESSION_ID || null,
      sender_type: 'coordinator',
      target_session: adam.id,
      message_type: 'INFO',
      subject: 'Hourly: review your Adam responsibilities',
      body: ADAM_REMINDER,
      payload: { kind: 'coordinator_reminder', topic: 'adam_responsibilities', sent_at: new Date().toISOString() },
      expires_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    };
    await insertCoordinationRow(sb, row, { logger: console });
    console.log('\n[HOURLY-REVIEW] Adam: reminder dispatched to ' + adam.id.slice(0, 8) + ' (hb ' + Math.round(adam.ageS) + 's).');
  } catch (e) {
    console.log('[HOURLY-REVIEW] Adam reminder skipped (non-fatal): ' + e.message);
  }

  // FR-2 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): hourly UNDELIVERED-receipt check.
  // Surfaces this coordinator's outbound rows sitting UNREAD at a LIVE target (read_at =
  // DELIVERED; the live 35-min-unread-GO incident class). Read-only + fail-open.
  try {
    const myId = process.env.CLAUDE_SESSION_ID;
    if (myId) {
      const { findUndelivered } = require('../lib/coordinator/receipts.cjs');
      const { ADAM_EXCLUDED_KINDS } = require('../lib/fleet/worker-status.cjs');
      const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // QF-20260719-828: EXCLUDED_KINDS stubs (cross_party_ping et al) are by-design
      // never read — they'd both false-flag as undelivered AND eat the 100-row limit.
      // Filter DB-side, null-safe (a bare NOT IN would silently drop kind-less rows).
      const { data: outbound } = await sb.from('session_coordination')
        .select('id, target_session, message_type, subject, payload, created_at, read_at')
        .eq('sender_session', myId)
        .is('read_at', null)
        .gte('created_at', sinceIso)
        .or('payload->>kind.is.null,payload->>kind.not.in.(' + ADAM_EXCLUDED_KINDS.join(',') + ')')
        .limit(100);
      const { data: sessions } = await sb.from('claude_sessions')
        .select('session_id, heartbeat_at')
        .gte('heartbeat_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .limit(200);
      const undelivered = findUndelivered(outbound || [], sessions || []);
      if (undelivered.length > 0) {
        console.log('\n[HOURLY-REVIEW] UNDELIVERED OUTBOUND — ' + undelivered.length + ' row(s) unread at a LIVE target (re-send or nudge):');
        undelivered.slice(0, 10).forEach(function (r) {
          const kind = (r.payload && r.payload.kind) || r.message_type || '?';
          console.log('  • [' + String(r.id).slice(0, 8) + '] → ' + String(r.target_session).slice(0, 8)
            + ' | ' + kind + ' | unread ' + Math.floor(r.ageMs / 60000) + 'm | ' + (r.subject || '').slice(0, 40));
        });
      }
    }
  } catch (e) {
    console.log('[HOURLY-REVIEW] undelivered-receipt check skipped (non-fatal): ' + e.message);
  }


  // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-3: surface the
  // relay/decision/review drop gauge. Read-only + fail-open (planRelayDrops never throws).
  try {
    const { planRelayDrops } = require('../lib/coordinator/relay-drop-gauge.cjs');
    const gauge = await planRelayDrops(sb);
    if (gauge.flagged > 0) {
      console.log('\n[HOURLY-REVIEW] RELAY/DECISION/REVIEW DROPS — ' + gauge.flagged + ' row(s) with no matching outbound within the window:');
      gauge.decisions.filter(function (d) { return d.action === 'flag'; }).slice(0, 10).forEach(function (d) {
        // SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 FR-1: id and correlation were printed as 8-char
        // prefixes here. This is the most likely literal source of the twice-repeated incident in
        // which an agent copied its own diagnostic output into a --reply-to: an 8-character
        // correlation stores verbatim, prints a success checkmark, and threads to NOTHING. Full
        // values only — a short form beside them would leave the copyable hazard in place.
        // (The .slice(0, 10) on the line above caps the ARRAY to 10 rows and is untouched: it
        // shortens no identifier.)
        console.log('  • [' + String(d.id) + '] correlation=' + String(d.correlationId) + ' | unactioned ' + Math.floor(d.ageMs / 60000) + 'm | ' + d.reason);
      });
    }
  } catch (e) {
    console.log('[HOURLY-REVIEW] relay-drop-gauge check skipped (non-fatal): ' + e.message);
  }
}

// SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: guard the main() invocation so the Solomon leg can be
// imported + unit-tested without running the whole hourly review.
if (require.main === module) {
  main().then(async function () {
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick,
    // regardless of which internal early-return branch main() took (supabase unavailable,
    // CYCLE-DOWN quiescent, no-live-Adam, dry-run) — reflects loop liveness (the tick ran
    // to completion), not whether a reminder actually fired this cycle.
    try {
      const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
      await stampLastFired(createSupabaseServiceClient(), 'standard_loop:hourly-review');
    } catch (err) {
      console.error('[HOURLY-REVIEW] stampLastFired failed (non-fatal): ' + err.message);
    }
  }).catch(function (e) { console.error('[HOURLY-REVIEW] error (non-fatal): ' + e.message); }).finally(function () { process.exit(0); });
}

module.exports = { dispatchSolomonReminder, SOLOMON_REMINDER, buildFoundationsPointer, reconcileStaleSolomonInbound, persistRenderedVerdict };
