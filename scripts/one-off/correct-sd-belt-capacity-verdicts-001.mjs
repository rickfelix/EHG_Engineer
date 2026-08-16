import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001';

const description =
  'scoreCapacityLeg (scripts/cron/drive-report-sweep.mjs) reports leg4 unavailable() on ANY failure ' +
  '(a gatherCapacityInputs read throw, a persist-guard throw, a re-check mismatch) without writing ' +
  'a belt_capacity_verdicts row -- so a run that could not be measured is indistinguishable from a ' +
  'run that was never swept at all. Verified live: belt_capacity_verdicts.verdict is NOT NULL with ' +
  "CHECK (verdict = ANY (ARRAY['DEFICIT-URGENT','DEFICIT','TIGHT','SURPLUS'])), and belt_depth/" +
  'demand_soon/deficit are all NOT NULL integer -- so even the literal fix (write a row with ' +
  'verdict=UNAVAILABLE and null measurements) is blocked by schema today, forcing a migration ' +
  '(classify-quick-fix.js\'s keyword-based schema check does not catch a DISCOVERED schema ' +
  'necessity, only an explicitly-named one -- flagged separately as a harness-bug candidate by ' +
  'Golf-3, not re-signaled here). Fix: (1) migration widening the verdict CHECK to admit UNAVAILABLE ' +
  'and making belt_depth/demand_soon/deficit nullable, plus a read_failed boolean NOT NULL DEFAULT ' +
  'false column; (2) a NEW, separate write path in capacity-verdict-store.mjs for the sentinel row ' +
  'that does NOT go through persistCapacityVerdict()\'s frozen-verdict/finite-number guards (those ' +
  'guards stay exactly as strict for the normal path); (3) scoreCapacityLeg\'s catch block calls the ' +
  'new sentinel-persist (best-effort, inner try/catch, never lets a secondary write failure block ' +
  'returning the unavailable() leg result) before returning.';

const keyChanges = [
  {
    change: 'Migration: add read_failed boolean NOT NULL DEFAULT false to belt_capacity_verdicts; widen the verdict CHECK constraint to also admit the literal \'UNAVAILABLE\'; make belt_depth, demand_soon, deficit nullable (no measurement exists on a read-failure run).',
    impact: 'Makes the schema able to represent "we tried to measure this run and could not" as a distinct, queryable state from every real verdict, without weakening the CHECK for the four real verdicts.',
  },
  {
    change: 'Add a second, narrow write path (e.g. makeCapacityVerdictUnavailablePersist) in scripts/lib/capacity-verdict-store.mjs that inserts {run_id, verdict: \'UNAVAILABLE\', read_failed: true, belt_depth: null, demand_soon: null, deficit: null, detail} directly -- does NOT reuse persistCapacityVerdict()\'s VERDICTS.includes/finite-number guards, since those guards correctly REJECT this exact shape for the normal path and must not be relaxed.',
    impact: 'A read-failure run now leaves a durable, queryable row instead of silently vanishing -- "how long has leg4 been unmeasurable" becomes answerable the same way "how long have we been in DEFICIT" already is.',
  },
  {
    change: 'Wire the new persist function through scoreCapacityLeg\'s existing catch block (scripts/cron/drive-report-sweep.mjs:223-229): on any leg4 failure, best-effort call the sentinel persist (own try/catch so a failed sentinel write can never block returning the unavailable() leg, which remains the report\'s house posture) before returning.',
    impact: 'Closes the visibility gap Solomon flagged (coordinator directive 2853569a) without changing leg4\'s scoring contract or the report\'s existing "degrade to unavailable, never to zero" posture.',
  },
  {
    change: 'Regression tests: a forced gatherCapacity() throw now produces exactly one belt_capacity_verdicts row with read_failed=true, verdict=UNAVAILABLE, null measurements, AND the leg4 result is still unavailable (never scored); a sentinel-persist failure does not prevent the unavailable() leg from being returned; the normal DEFICIT/TIGHT/SURPLUS path is unchanged (verdict CHECK widening does not weaken the existing four-value guard).',
    impact: 'Proves the fix without regressing the deliberate "throws propagate, never silently scored 0" contract this file\'s own header documents extensively.',
  },
];

const successCriteria = [
  {
    criterion: 'A forced gatherCapacityInputs() read failure produces a persisted belt_capacity_verdicts row with read_failed=true and verdict=UNAVAILABLE (not zero rows, not a fabricated DEFICIT).',
    measure: 'New unit test in tests/unit/cron/drive-report-sweep.test.js: inject a gatherCapacity that throws, assert exactly one row inserted via the sentinel persist mock with {read_failed:true, verdict:\'UNAVAILABLE\', belt_depth:null, demand_soon:null, deficit:null}.',
  },
  {
    criterion: 'scoreCapacityLeg still returns { leg: LEG4_ID, unavailable: ... } on failure -- the sentinel write is additive, it does not change what the caller (aggregateScore) receives or how leg4 is scored.',
    measure: 'Existing scoreCapacityLeg tests continue to pass unmodified; a new test asserts the returned shape is unchanged when persistUnavailable is (or is not) provided.',
  },
  {
    criterion: 'A sentinel-persist failure (e.g. the migration has not yet been applied, or a transient DB error) never prevents scoreCapacityLeg from returning its unavailable() result -- the report must not go down over a secondary failure while recording a primary one.',
    measure: 'New unit test: inject a persistUnavailable that itself throws, assert scoreCapacityLeg still resolves (not rejects) with the unavailable leg result.',
  },
  {
    criterion: 'The normal (non-failure) DEFICIT/DEFICIT-URGENT/TIGHT/SURPLUS write path is unchanged -- the CHECK-constraint widening and new nullable columns do not weaken persistCapacityVerdict()\'s existing VERDICTS.includes/finite-number guards or alter its insert shape.',
    measure: 'Existing capacity-verdict-store.mjs tests continue to pass unmodified; migration\'s own $verify$ block asserts the four original verdict values remain admitted and NOT NULL still holds on verdict itself.',
  },
];

const successMetrics = [
  {
    metric: 'belt_capacity_verdicts rows with read_failed=true after a forced read-failure test run',
    target: '1 (was 0 before this fix -- the exact gap this SD closes)',
  },
  {
    metric: 'Pre-existing capacity-verdict-store.mjs / drive-report-sweep.mjs test suite',
    target: '0 regressions (all pre-existing tests pass unmodified)',
  },
  {
    metric: 'New regression coverage for the sentinel write path (success + secondary-failure cases)',
    target: '>=3 new tests (sentinel-row-on-read-failure, unavailable-leg-shape-unchanged, sentinel-write-failure-does-not-block-leg-result)',
  },
];

const risks = [
  {
    risk: 'The migration touches a live, currently-applied table (belt_capacity_verdicts already exists and is written to) rather than a staged/unapplied one -- unlike this session\'s other recent chairman-gated migrations, this one is additive-only (new nullable column, widened CHECK) and does not drop or narrow anything, so the blast radius on existing rows/readers is low, but it is a real schema change to a live table, not a dormant one.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Additive-only DDL (ADD COLUMN, ALTER CONSTRAINT to widen, DROP NOT NULL on 3 columns) -- no existing row is rewritten, no existing reader\'s query shape changes. Verify via $verify$ block that the four original verdict values and existing rows are unaffected before COMMIT.',
  },
  {
    risk: 'A caller reading belt_capacity_verdicts.verdict without expecting the new UNAVAILABLE value (e.g. a dashboard that only branches on DEFICIT/TIGHT/SURPLUS) could mis-render an UNAVAILABLE row.',
    impact: 'low',
    likelihood: 'medium',
    mitigation: 'Search for existing readers of this table before merge; the primary known reader is leg4-capacity.js\'s own VERDICTS list, which is a SEPARATE, already-correct guard (it throws on any value outside its own frozen four -- UNAVAILABLE rows are never fed back into scoreLeg4, they only ever originate from the new sentinel path, which never calls scoreLeg4).',
  },
];

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'Run npx vitest run tests/unit/cron/drive-report-sweep.test.js tests/unit/cron/drive-report-hourly-sweep.test.js tests/unit/capacity-inputs.test.js (plus any new capacity-verdict-store unit test file)',
    expected_outcome: 'All pre-existing tests pass unmodified, plus new tests for the sentinel-persist-on-read-failure path pass.',
  },
  {
    step_number: 2,
    instruction: 'After the migration applies, inject a gatherCapacity that throws (or temporarily point capacity-inputs at a nonexistent table) and run the drive-report-sweep cron locally',
    expected_outcome: 'leg4 reports unavailable exactly as before (no scoring change), AND a new row appears in belt_capacity_verdicts with read_failed=true, verdict=UNAVAILABLE, belt_depth/demand_soon/deficit all null.',
  },
  {
    step_number: 3,
    instruction: 'Run the normal (healthy) drive-report-sweep path once more after step 2',
    expected_outcome: 'A normal DEFICIT/DEFICIT-URGENT/TIGHT/SURPLUS row is written exactly as before -- the widened CHECK constraint and new nullable columns do not change the shape or values of a healthy-path row.',
  },
];

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    scope: description,
    key_changes: keyChanges,
    success_criteria: successCriteria,
    success_metrics: successMetrics,
    risks,
    smoke_test_steps: smokeTestSteps,
  })
  .eq('id', existing.id);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log(`Corrected ${SD_KEY} LEAD-phase fields.`);
