#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 -- PLAN-phase PRD corrections from TESTING's PLAN-TO-EXEC
 * review (sub_agent_execution_results fd168314-ba23-4d35-b201-bb186ff80870, CONDITIONAL_PASS 88).
 *
 * Real findings, not style nits:
 *  - The fixture-blind bug in signal-router.cjs is worse than the PRD described: a SECOND branch
 *    (:379) makes the idempotency guard unconditionally unreachable (undefined AND anything is
 *    false), re-stamping acknowledged_at + corrupting source_age_ms on every tick -- new TS-9.
 *  - TS-4/5/6/7 (both HIGH-severity guards) were typed 'integration', which routes to the
 *    excluded db vitest project -- green-over-unrun. Corrected tier guidance added.
 *  - tests/helpers/postgrest-fixture-store.js's select() ignores the column list, so a "real row
 *    shape" test is behaviourally identical to the current mocks -- FR-4 AC-3 needs an explicit
 *    fixture-projection-or-db-tier note, not a vague "real row shape" ask.
 *  - FR-2 substantially duplicates lib/fleet/outstanding-signals.cjs (already does the
 *    acknowledged_at IS NULL filter, oldest-first, named DEFAULT_ALERT_AGE_MIN=30, 20+ tests) --
 *    corrected to extend it, not build new dashboard code or a rival SLA constant.
 *  - FR-1 AC-3 misdescribed buildReceipt()'s failure mode (whole-receipt null, not per-field drop).
 *  - TR-4 (single canonical writer) had no test -- added TR-5 requiring a census-style test.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-SIGNAL-LANE-PER-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, metadata')
  .eq('id', PRD_ID)
  .single();
if (readErr || !prd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const fr = structuredClone(prd.functional_requirements);
const tr = structuredClone(prd.technical_requirements);
const ts = structuredClone(prd.test_scenarios);

// FR-1: correct buildReceipt() blast radius (whole receipt is dropped, not a per-field value).
const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.description += " CORRECTION (TESTING, fd168314): receipt-ledger.cjs:89's buildReceipt() returns null for the WHOLE receipt object when a disposition is unmapped, not a single dropped field -- so an unmapped value stamps acknowledged_at while ZERO ledger rows are written, removing the signal from both the answered-rate numerator AND denominator. TS-3 must assert the receipt is non-null before any field-level check (a null-check-then-throw ordering bug would otherwise mask this as a TypeError, not a failed assertion).";

// FR-2: extend lib/fleet/outstanding-signals.cjs, don't build new dashboard code or a rival SLA constant.
const fr2 = fr.find((f) => f.id === 'FR-2');
fr2.description = "CORRECTED (TESTING, fd168314): lib/fleet/outstanding-signals.cjs already implements the acknowledged_at IS NULL filter, oldest-first ordering, age reporting, truncation-honesty, and a read-only guarantee, with a named threshold DEFAULT_ALERT_AGE_MIN=30 and 20+ passing tests -- the original FR-2 (pointing at fleet-dashboard.cjs, inventing a new SIGNAL_DISPOSITION_SLA_MINUTES constant) would have duplicated this and reintroduced the exact vocabulary-drift class FR-1 exists to eliminate. EXEC must EXTEND outstanding-signals.cjs: widen its current single-session .eq('sender_session', sessionId) filter to a coordinator-wide view, and REUSE DEFAULT_ALERT_AGE_MIN as the SLA threshold (or rename it in place if a signal-lane-specific name is truly needed -- do not add a second, parallel constant for the same concept).";
fr2.acceptance_criteria = [
  "A fixture signal row older than DEFAULT_ALERT_AGE_MIN appears in the widened (coordinator-wide, not single-session) surfaced oldest-first list with an explicit overdue marker.",
  "A fixture signal row younger than DEFAULT_ALERT_AGE_MIN does NOT appear as overdue.",
  "No new SLA constant is introduced; the existing DEFAULT_ALERT_AGE_MIN (or an explicit rename of it) is the single source of truth for this threshold.",
];

// FR-4: document the second, more severe fixture-blind branch, and the test-fixture projection gap.
const fr4 = fr.find((f) => f.id === 'FR-4');
fr4.description += " CORRECTION (TESTING, fd168314): the fixture-blind bug is worse than initially scoped -- loadRecentSignals's missing acknowledged_at in its select list breaks TWO downstream branches in opposite directions: signal-router.cjs:414 degrades a guard (partially masked, since routed_to_coordinator lives inside the selected payload), but :379's idempotency check (`if (r.payload?.routed_to_coordinator && r.acknowledged_at) continue;`) is unconditionally false when acknowledged_at is undefined, making the `continue` UNREACHABLE in production -- an already-acked row gets RE-STAMPED with a fresh acknowledged_at on every tick, which also corrupts source_age_ms (computed at write time, unrecoverable later). Confirmed there is no recordReceipt() call at the :384-387 update either. ALSO: tests/helpers/postgrest-fixture-store.js's select() ignores its column-list argument and returns whole seeded rows -- seeding a 'real' row into this fixture is behaviourally IDENTICAL to the current hand-supplied mocks and cannot observe the projection bug. FR-4's tests for this specific defect need either (a) projection support added to the fixture, (b) a db-tier test against the real schema, or (c) a static source-pin test on the actual select() string (precedent: tests matching the ack-paths-explicit-id-source-pins.test.js pattern) -- a plain unit test with a mock client cannot catch this class of bug.";

// TR-5: single canonical writer needs an explicit census-style test (TR-4 currently has none).
tr.push({
  id: 'TR-5',
  title: 'TR-4 (single canonical writer) requires an explicit census-style test',
  description: "TR-4 states the invariant but the PRD had no test verifying it. EXEC must add a census test (precedent: ack-paths-explicit-id-source-pins.test.js) that enumerates every code path capable of writing acknowledged_at + a disposition value together and asserts exactly one (FR-1's canonical writer) exists post-EXEC -- this is the SD's core architectural guarantee and the one thing that, if violated, silently reintroduces the whole defect class.",
});

// Correct test tiers + add missing TS-9, negative arm for TS-1, source_age_ms for TS-4.
for (const id of ['TS-4', 'TS-5', 'TS-6', 'TS-7']) {
  const t = ts.find((x) => x.id === id);
  if (t) {
    t.type = 'unit-or-db-tier (see note)';
    t.expected += " TIER CORRECTION (TESTING, fd168314): originally typed 'integration', which vitest.config.js routes to the 'db' project -- excluded from the default 'unit' project and from plain `npm test`, meaning both HIGH-severity guards (answered-rate ledger integrity, SIGNAL_RESOLVED positive/negative control) would be green-over-unrun. Prefer a pure-unit form where possible (e.g. TS-4 should assert on lib/coordination/answered-rate.cjs's computeAnsweredRate() output using the existing fakeClient() pattern from advisory-receipt-lane.test.js:19-33, not a live-DB row count); only fall back to a genuinely-run db-tier test (VITEST_DB_ALLOW_REF set) where a pure-unit fixture cannot observe the behavior (e.g. the projection-dependent parts of TS-6/TS-7).";
  }
}
const ts4 = ts.find((x) => x.id === 'TS-4');
if (ts4) ts4.expected += ' Must also assert source_age_ms is NOT computed from a fake write-time timestamp for backfilled rows (the LEAD-phase scope correction flagged up-to-38h fake latencies as a distinct failure mode from raw ledger-count corruption).';
const ts1 = ts.find((x) => x.id === 'TS-1');
if (ts1) ts1.expected += ' Must include a NEGATIVE arm: a hand-stamped (non-canonical-writer) disposition on a fixture row must be detected as such, not just "clean" asserted unconditionally by a detector that could return true regardless of input.';
const ts3 = ts.find((x) => x.id === 'TS-3');
if (ts3) ts3.expected = 'Each value maps to a real, non-null receipt object (assert non-null BEFORE any field-level check, since buildReceipt() returns null for the whole receipt on an unmapped value, per the corrected FR-1 AC-3) that is distinguishable per disposition value.';

ts.push({
  id: 'TS-9',
  scenario: "signal-router.cjs's idempotency guard at :379 is unconditionally unreachable due to the missing acknowledged_at column in loadRecentSignals's select list",
  type: 'unit',
  expected: 'A fixture row already carrying acknowledged_at + payload.routed_to_coordinator=true, when re-processed by the FIXED loadRecentSignals (selecting acknowledged_at), is correctly skipped (continue fires) and its acknowledged_at/source_age_ms are NOT overwritten. Against the CURRENT unfixed code, this test must fail, proving it actually observes the bug rather than passing vacuously.',
});

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: fr,
    technical_requirements: tr,
    test_scenarios: ts,
    metadata: {
      ...prd.metadata,
      plan_prd_correction: {
        performed_at: new Date().toISOString(),
        source: 'TESTING sub_agent_execution_results fd168314-ba23-4d35-b201-bb186ff80870 (PLAN-TO-EXEC, CONDITIONAL_PASS 88)',
        summary: 'Corrected FR-1 AC-3 blast radius, FR-2 to extend outstanding-signals.cjs instead of duplicating it, FR-4 to document the second (more severe) fixture-blind branch + the test-fixture projection gap, added TR-5 (canonical-writer census test), retyped TS-4/5/6/7 tier guidance to avoid green-over-unrun, added TS-9, added negative arms to TS-1/TS-3/TS-4.',
      },
    },
  })
  .eq('id', PRD_ID);
if (updErr) { console.error('WRITE ERR', updErr.message); process.exit(1); }
console.log('OK: PRD corrected for', PRD_ID);
