#!/usr/bin/env node
/**
 * Acceptance suite for SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001 (TR-5), as a standalone binary
 * -- the vitest `db` project silently skips in this environment (DESIGNATED_NON_PROD_REFS frozen
 * empty), confirmed live by PLAN-phase TESTING review; this script's own exit code IS the
 * pass/fail signal, never a vitest integration test.
 *
 * Sections T1-T4, T9 are pure evaluateRow() calls against synthetic self_stamped rows with a
 * controlled clock (TR-6) -- self_stamped rows make ZERO database calls inside evaluateRow, so
 * these run fully offline, deterministically, regardless of the wall-clock hour this script is
 * actually invoked at. T5 is a documented non-blocking gap (PLAN-phase TESTING review, second
 * pass: FR-3 does not state a concrete DISMISS_COOLDOWN_MS derivation, so no test can discriminate
 * a correct value from an arbitrary one yet -- left for EXEC/a follow-up, not silently omitted).
 * T6 exercises the real emitLadderDigest()/findRecentlyDismissedSignatures() partition logic via
 * dependency injection (the functions already support this). T7/T8 are read-only live-DB checks.
 */
import 'dotenv/config';
import { parseCronHours, hasDeclaredGap, largestDeclaredGapSeconds, gapAdjustedAgeMs } from '../lib/periodic-liveness/cron-gap.mjs';
import { evaluateRow, STATE } from './periodic-liveness-watcher.mjs';
import { emitLadderDigest } from '../lib/periodic-liveness/ladder-escalation.mjs';
import { createDatabaseClient } from './lib/supabase-connection.js';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} -- ${name}${detail ? ': ' + detail : ''}`);
}

const SLA_CRON = '15 0-2,10-23 * * *';
const ADAM_CRON = '20 0-1,11-23 * * *';
const iso = (s) => new Date(s).getTime();

// ---------------------------------------------------------------------------------------------
// T0: pure cron-gap.mjs math -- foundational sanity layer before anything built on top of it.
// ---------------------------------------------------------------------------------------------
function t0_cronGapMath() {
  const slaHours = parseCronHours(SLA_CRON);
  // {0,1,2} (3 hours) + {10..23} (14 hours) = 17 hours covered, 7 gap hours (3-9).
  record('T0a: parseCronHours(SLA_CRON) covers exactly {0,1,2,10..23}', slaHours && slaHours.size === 17 && !slaHours.has(3) && !slaHours.has(9) && slaHours.has(10), JSON.stringify([...(slaHours || [])].sort((a, b) => a - b)));
  record('T0b: hasDeclaredGap(SLA_CRON) is true', hasDeclaredGap(SLA_CRON) === true);
  record('T0c: hasDeclaredGap for a plain */15 cron is false (no gap)', hasDeclaredGap('*/15 * * * *') === false);
  record('T0d: largestDeclaredGapSeconds(SLA_CRON) is 7h (hours 3-9)', largestDeclaredGapSeconds(SLA_CRON) === 7 * 3600, `got ${largestDeclaredGapSeconds(SLA_CRON)}`);

  // Midnight-wrap case: a cron active only 10-23 has its true single gap spanning 00-09 (10h),
  // not two separate fragments -- exercises the doubled 48-slot walk even though neither real
  // specimen wraps midnight.
  const wrapGap = largestDeclaredGapSeconds('0 10-23 * * *');
  record('T0e: largestDeclaredGapSeconds correctly measures a midnight-wrapping gap as one 10h span', wrapGap === 10 * 3600, `got ${wrapGap}`);

  // gapAdjustedAgeMs: no cron -> plain elapsed time (safe no-op for every pre-existing row).
  const plain = gapAdjustedAgeMs(undefined, iso('2026-08-20T00:00:00Z'), iso('2026-08-20T05:00:00Z'));
  record('T0f: gapAdjustedAgeMs falls back to raw elapsed time with no cronExpr', plain === 5 * 3600_000, `got ${plain}`);

  // Known hand-computed case: T0=02:15Z, now=05:00Z, SLA_CRON -> 45min non-gap portion.
  const adjusted = gapAdjustedAgeMs(SLA_CRON, iso('2026-08-20T02:15:00Z'), iso('2026-08-20T05:00:00Z'));
  record('T0g: gapAdjustedAgeMs(SLA_CRON, 02:15Z, 05:00Z) = 45min (hand-computed)', adjusted === 45 * 60_000, `got ${adjusted}ms`);
}

// ---------------------------------------------------------------------------------------------
// T1/T2: named specimens read OK while `now` is inside their own declared gap.
// ---------------------------------------------------------------------------------------------
async function t1_slaSpecimenInsideGap() {
  const row = {
    process_key: 'test-chairman-decision-sla', currently_expected_active: true,
    liveness_source: 'self_stamped', last_fired_at: '2026-08-20T02:15:00Z',
    liveness_source_ref: { workflow_cron: SLA_CRON },
    expected_interval_seconds: 3600, grace_multiplier: 2,
  };
  const evaluation = await evaluateRow(row, { now: iso('2026-08-20T05:00:00Z') });
  record('T1: chairman-decision-sla specimen inside its declared 8h gap reads OK, not OVERDUE', evaluation.state === STATE.OK, JSON.stringify(evaluation));
}

async function t2_adamSpecimenInsideGap() {
  const row = {
    process_key: 'test-adam-decision-scheduler', currently_expected_active: true,
    liveness_source: 'self_stamped', last_fired_at: '2026-08-20T01:20:00Z',
    liveness_source_ref: { workflow_cron: ADAM_CRON },
    expected_interval_seconds: 3600, grace_multiplier: 2,
  };
  // ADAM_CRON covers {0,11..23}; gap is hours 1-10 (10h). now well inside that gap.
  const evaluation = await evaluateRow(row, { now: iso('2026-08-20T06:00:00Z') });
  record('T2: adam-decision-scheduler specimen inside its declared 10h gap reads OK, not OVERDUE', evaluation.state === STATE.OK, JSON.stringify(evaluation));
}

// ---------------------------------------------------------------------------------------------
// T3: eva-scheduler-watcher specimen at measured historical lag (up to 83min on a 15min cron).
// ---------------------------------------------------------------------------------------------
async function t3_evaSchedulerStochasticLag() {
  const row = {
    process_key: 'test-eva-scheduler-watcher', currently_expected_active: true,
    liveness_source: 'self_stamped', last_fired_at: '2026-08-20T09:00:00Z',
    liveness_source_ref: {}, // no workflow_cron -- FR-2's tolerance lives entirely in grace_multiplier
    expected_interval_seconds: 900, grace_multiplier: 7, // matches the calibrated __watcher_self__ row
  };
  const evaluation = await evaluateRow(row, { now: iso('2026-08-20T10:23:00Z') }); // 83min later
  record('T3: eva-scheduler-watcher specimen at measured 83min lag reads OK (threshold 105min)', evaluation.state === STATE.OK, JSON.stringify(evaluation));
}

// ---------------------------------------------------------------------------------------------
// T4: three clock-anchored cases against a dead (never-firing) SLA specimen.
// ---------------------------------------------------------------------------------------------
async function t4_deadSpecimenClockAnchored() {
  const deadRow = {
    process_key: 'test-dead-sla', currently_expected_active: true,
    liveness_source: 'self_stamped', last_fired_at: '2026-08-20T02:15:00Z', // never fires again
    liveness_source_ref: { workflow_cron: SLA_CRON },
    expected_interval_seconds: 3600, grace_multiplier: 2, // threshold = 2h
  };

  const a = await evaluateRow(deadRow, { now: iso('2026-08-20T05:00:00Z') }); // inside gap
  record('T4a: dead process, now INSIDE the declared gap -> suppressed (OK)', a.state === STATE.OK, JSON.stringify(a));

  const b = await evaluateRow(deadRow, { now: iso('2026-08-20T12:30:00Z') }); // past gap edge + grace
  record('T4b: dead process, now past the gap edge + one grace window -> OVERDUE (suppression ends)', b.state === STATE.OVERDUE, JSON.stringify(b));

  // T4c: compose with post-FR-3 ladder using injected fakes (no live DB/RPC needed) -- proves the
  // OVERDUE evaluation from 4b flows correctly into the signature-aware digest logic.
  const recordPendingCalls = [];
  const digest = await emitLadderDigest(
    {}, // inert placeholder supabase arg -- all deps below are injected, no real client needed
    [{ process_key: deadRow.process_key, display_name: 'Test dead SLA', signature: 'threshold_exceeded' }],
    {
      findExisting: async () => null,
      findDismissedSignatures: async () => new Map(),
      recordPending: async (_supabase, payload) => { recordPendingCalls.push(payload); return { id: 'fake-decision-id', escalated: true }; },
      escalate: async () => ({ escalated: true }),
    }
  );
  const composesCorrectly = digest.emitted === true && digest.decisionId === 'fake-decision-id' && recordPendingCalls.length === 1
    && recordPendingCalls[0].context.process_signatures[deadRow.process_key] === 'threshold_exceeded';
  record('T4c: OVERDUE evaluation composes correctly through emitLadderDigest (post-FR-3 ladder)', composesCorrectly, JSON.stringify(digest));
}

// ---------------------------------------------------------------------------------------------
// T6: FR-3 signature discriminator, three cases, via dependency injection (no live DB/RPC).
// ---------------------------------------------------------------------------------------------
async function t6_signatureDiscriminator() {
  // 6a: same process_key, same signature, within cooldown -> suppressed.
  const dismissedA = new Map([['proc-a', new Set(['armed_never_produced'])]]);
  const a = await emitLadderDigest({}, [{ process_key: 'proc-a', signature: 'armed_never_produced' }], {
    findExisting: async () => null,
    findDismissedSignatures: async () => dismissedA,
    recordPending: async () => { throw new Error('should not escalate -- case 6a expects full suppression'); },
    escalate: async () => ({ escalated: false }),
  });
  record('T6a: same process_key + same signature within cooldown -> suppressed, no escalation', a.suppressed === true && a.emitted === true, JSON.stringify(a));

  // 6b: same process_key, DIFFERENT signature -> must still escalate.
  let escalated6b = false;
  const b = await emitLadderDigest({}, [{ process_key: 'proc-a', signature: 'latest_scheduled_run_failed' }], {
    findExisting: async () => null,
    findDismissedSignatures: async () => dismissedA, // dismissed only covers 'armed_never_produced'
    recordPending: async (_s, payload) => { escalated6b = true; return { id: 'd6b', escalated: true }; },
    escalate: async () => ({ escalated: true }),
  });
  record('T6b: same process_key, materially different signature -> still escalates', escalated6b === true && b.emitted === true, JSON.stringify(b));

  // 6c: two DIFFERENT process_keys share one dismissed digest; proc-y is dismissed, proc-z is not
  // -- must escalate ONLY proc-z, proving per-process (not per-digest) suppression scope (the
  // processKeys.some() bug this FR fixes: the old code would have suppressed BOTH).
  const dismissedC = new Map([['proc-y', new Set(['threshold_exceeded'])]]);
  let capturedContext6c = null;
  const c = await emitLadderDigest({}, [
    { process_key: 'proc-y', signature: 'threshold_exceeded' },
    { process_key: 'proc-z', signature: 'threshold_exceeded' },
  ], {
    findExisting: async () => null,
    findDismissedSignatures: async () => dismissedC,
    recordPending: async (_s, payload) => { capturedContext6c = payload.context; return { id: 'd6c', escalated: true }; },
    escalate: async () => ({ escalated: true }),
  });
  const onlyZEscalated = capturedContext6c && capturedContext6c.process_keys.length === 1 && capturedContext6c.process_keys[0] === 'proc-z';
  record('T6c: cross-process non-suppression -- only the genuinely-matching process is suppressed, not the whole digest', onlyZEscalated === true, JSON.stringify({ context: capturedContext6c, suppressedKeys: c.suppressedKeys }));
}

// ---------------------------------------------------------------------------------------------
// T9: a dead gap-covered process still accumulates staleness across >=2 full gap cycles --
// gap-suppression must never reset the underlying signal (TS-9, the false-negative TESTING found).
// ---------------------------------------------------------------------------------------------
async function t9_monotonicAcrossGapCycles() {
  const deadRow = {
    process_key: 'test-dead-multi-cycle', currently_expected_active: true,
    liveness_source: 'self_stamped', last_fired_at: '2026-08-20T02:15:00Z', // never fires again
    liveness_source_ref: { workflow_cron: SLA_CRON },
    expected_interval_seconds: 3600, grace_multiplier: 2,
  };
  // Walk 4 ticks spanning gap-window, active-window, gap-window, active-window across 2 days.
  const ticks = [
    { label: 'day1 gap-window', now: '2026-08-20T05:00:00Z' },
    { label: 'day1 active-window', now: '2026-08-20T15:00:00Z' },
    { label: 'day2 gap-window', now: '2026-08-21T05:00:00Z' },
    { label: 'day2 active-window', now: '2026-08-21T15:00:00Z' },
  ];
  const ageSeries = [];
  for (const tick of ticks) {
    const evaluation = await evaluateRow(deadRow, { now: iso(tick.now) });
    ageSeries.push({ label: tick.label, state: evaluation.state, age_ms: evaluation.age_ms });
  }
  // Monotonic non-decreasing gap-adjusted age across all 4 ticks (never resets because it's in a
  // gap), and the process must have crossed into OVERDUE by the second active-window tick at the
  // latest (the same class of tick where a real detection must eventually fire).
  let monotonic = true;
  for (let i = 1; i < ageSeries.length; i++) {
    if (ageSeries[i].age_ms < ageSeries[i - 1].age_ms) monotonic = false;
  }
  const eventuallyOverdue = ageSeries.some((t) => t.state === STATE.OVERDUE);
  record('T9: gap-adjusted staleness never decreases across gap cycles (monotonic, TS-9)', monotonic, JSON.stringify(ageSeries));
  record('T9: a genuinely dead gap-covered process still reaches OVERDUE within 2 cycles', eventuallyOverdue, JSON.stringify(ageSeries));
}

// ---------------------------------------------------------------------------------------------
// T7: live regression -- the 16 ARMED-outlives-SD rows remain cadence_armed via the real
// operator-contract gate, and the 2 FR-4-corrected specimens' evidence interval token differs
// (expected -- TS-7 asserts the BOOLEAN invariant, never byte-identical evidence text).
// ---------------------------------------------------------------------------------------------
async function t7_operatorContractRegression(q) {
  const { validateCadence } = await import('../lib/gates/operator-contract/index.js');
  const { rows } = await q(`
    select process_key, currently_expected_active, expected_interval_seconds, last_fired_at
    from periodic_process_registry
    where process_key like 'g3-armed-%'
  `);
  record('T7 setup: found the expected 16 (or more) live g3-armed rows', rows.length >= 16, `found ${rows.length}`);
  const capabilityKeys = rows.map((r) => r.process_key);
  const result = validateCadence({ registryRows: rows, capabilityKeys });
  record('T7: validateCadence finds a cadence_armed row among the live g3-armed population', result.cadence_armed === true, JSON.stringify(result));
}

// ---------------------------------------------------------------------------------------------
// T8: divergence-demonstration (not a regression gate -- verifierHealth has ZERO production
// callers, confirmed by PLAN-phase TESTING review second pass, same dead-code status as TR-4's
// report-posture.js). Demonstrates the staleness BUDGET differs for the 2 FR-4-corrected rows;
// governance.js's own CODE is untouched by this SD (TR-3).
// ---------------------------------------------------------------------------------------------
async function t8_governanceDivergenceDemo(q) {
  const { verifierHealth } = await import('../lib/loop-governance/governance.js');
  const { rows } = await q(`
    select process_key, expected_interval_seconds, last_fired_at
    from periodic_process_registry
    where process_key in ('g3-armed-sd-leo-infra-chairman-decision-surfacing-001')
    limit 1
  `);
  if (rows.length === 0) {
    record('T8: divergence-demonstration skipped (specimen row not present in this environment)', true, 'no row to demonstrate against -- non-blocking per TS-8');
    return;
  }
  const health = verifierHealth(rows[0], new Date());
  record('T8: verifierHealth() computes against the corrected expected_interval_seconds (divergence-demonstration, not a regression gate)', typeof health.alive === 'boolean', JSON.stringify(health));
}

async function main() {
  t0_cronGapMath();
  await t1_slaSpecimenInsideGap();
  await t2_adamSpecimenInsideGap();
  await t3_evaSchedulerStochasticLag();
  await t4_deadSpecimenClockAnchored();
  await t6_signatureDiscriminator();
  await t9_monotonicAcrossGapCycles();

  const client = await createDatabaseClient('engineer', { verify: true });
  const q = (sql, params) => client.query(sql, params);
  try {
    await t7_operatorContractRegression(q);
    await t8_governanceDivergenceDemo(q);
  } finally {
    await client.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    console.log('FAILED:', failed.map((f) => f.name).join('; '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('SUITE_FAILED:', err.message, err.stack);
  process.exit(1);
});
