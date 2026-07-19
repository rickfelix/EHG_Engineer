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

// Adam role-contract reminders — mirrors CLAUDE_ADAM.md / CONST-002 + the 8-dim self-rubric.
const ADAM_REMINDER =
  'Hourly responsibilities review: re-read your role contract — CONST-002 (PROPOSE, never execute/accept/graduate), ' +
  'silence-by-default, one-advisory-per-tick, the hard rationale bar (cite a LIVE KR + counterfactual + dedup + CONST self-check), ' +
  'and your 8-dim self-rubric (D1_proactive_sourcing..D8_interface_clarity). Stay silent unless you have ONE ranked, defensible advisory.';

// SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: Solomon role-contract reminder — mirrors CLAUDE_SOLOMON.md
// / CONST-002 propose-only, silence-by-default, the consult triage gate, and Solomon's 5-dim self-rubric.
const SOLOMON_REMINDER =
  'Hourly responsibilities review: re-read your Solomon role contract (CLAUDE_SOLOMON.md) — CONST-002 ' +
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
  let constPart = 'Constitution: re-read ' + CANONICAL_CONSTITUTION_TABLE + ' (CONST-001..014) directly.';
  try {
    const { data } = await sb.from(CANONICAL_CONSTITUTION_TABLE).select('rule_code').order('rule_code');
    const codes = (data || []).map(function (r) { return r.rule_code; }).filter(Boolean);
    if (codes.length > 0) {
      constPart = 'Constitution: re-read ' + CANONICAL_CONSTITUTION_TABLE + ' — ' + codes.length +
        ' live rule(s) (' + codes[0] + '..' + codes[codes.length - 1] + ').';
    }
  } catch (e) {
    // fail-open to the static pointer above — a foundations refresh must never block the reminder
  }
  return (
    constPart + ' ' +
    'Mission/Vision: re-read ' + CANONICAL_MISSION_VISION_DOC + ' (chairman-approved canonical) plus your ' +
    'current eva_vision_documents entries. ' +
    'Operating model: re-read ' + CANONICAL_OPERATING_MODEL_DOCS.join(' and ') + '.'
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

async function main() {
  let sb;
  try { sb = createSupabaseServiceClient(); }
  catch (e) { console.log('[HOURLY-REVIEW] supabase unavailable (non-fatal): ' + e.message); return; }

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

  // SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-4 (invariant #0, who-watches-the-watchmen):
  // an EXTERNAL check (this process is independently cron'd, separate from gauge-runner.mjs
  // itself) that the gauge-runner is observably alive. A dead runner is a worse failure than any
  // single invariant drifting (false all-clear) -- so a stale/missing heartbeat alarms here.
  try {
    const { checkGaugeRunnerLiveness } = await import('../lib/governance/gauge-runner-liveness.js');
    const { data: hb } = await sb.from('codebase_health_snapshots')
      .select('scanned_at')
      .eq('dimension', 'gauge_runner_heartbeat')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const liveness = checkGaugeRunnerLiveness(hb?.scanned_at, Date.now());
    if (liveness.alarm) {
      const ageNote = liveness.ageMs == null ? 'no heartbeat ever recorded' : Math.floor(liveness.ageMs / 60000) + 'm stale';
      console.log('\n[HOURLY-REVIEW] GAUGE-RUNNER LIVENESS ALARM — invariant gauges may be silently NOT running (' + ageNote + '). Investigate scripts/gauge-runner.mjs.');
    }
  } catch (e) {
    console.log('[HOURLY-REVIEW] gauge-runner liveness check skipped (non-fatal): ' + e.message);
  }

  // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-3: surface the
  // relay/decision/review drop gauge. Read-only + fail-open (planRelayDrops never throws).
  try {
    const { planRelayDrops } = require('../lib/coordinator/relay-drop-gauge.cjs');
    const gauge = await planRelayDrops(sb);
    if (gauge.flagged > 0) {
      console.log('\n[HOURLY-REVIEW] RELAY/DECISION/REVIEW DROPS — ' + gauge.flagged + ' row(s) with no matching outbound within the window:');
      gauge.decisions.filter(function (d) { return d.action === 'flag'; }).slice(0, 10).forEach(function (d) {
        console.log('  • [' + String(d.id).slice(0, 8) + '] correlation=' + String(d.correlationId).slice(0, 8) + ' | unactioned ' + Math.floor(d.ageMs / 60000) + 'm | ' + d.reason);
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

module.exports = { dispatchSolomonReminder, SOLOMON_REMINDER, buildFoundationsPointer, reconcileStaleSolomonInbound };
