import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const fr = prd.functional_requirements;
const ts = prd.test_scenarios;

// T-1 (HIGH, testing-agent evidence 20db50fc-b5aa-4194-95fe-e8bb7ca14eff): the module ALREADY
// imports VERDICTS at top for the EXISTING persistCapacityVerdict (TR-2 forbids removing it) --
// "never imports VERDICTS" was factually wrong. Rescope to the NEW function's own source text.
const fr2 = fr.find((f) => f.id === 'FR-2');
fr2.acceptance_criteria[1] =
  "The new function's OWN source (Function.prototype.toString() on makeCapacityVerdictUnavailablePersist's returned closure, or the narrower function it delegates to) does not reference VERDICTS.includes or the finite-number guard helper -- the MODULE as a whole still imports VERDICTS for the pre-existing persistCapacityVerdict, per TR-2, so this assertion is scoped to the new function's own body, not the module's import list.";

const fr5 = fr.find((f) => f.id === 'FR-5');
fr5.description = fr5.description.replace(
  'the function never imports VERDICTS or the finite-number guard (a static import-graph assertion',
  "the new function's OWN source never references VERDICTS or the finite-number guard (a static source-text assertion, scoped to the new function's body -- the module itself still imports VERDICTS for the pre-existing persistCapacityVerdict, per TR-2"
);
fr5.acceptance_criteria[0] = fr5.acceptance_criteria[0].replace(
  "a static assertion that the new function's source does not reference VERDICTS or the finite-number guard helper",
  "a static assertion that the new function's OWN source text does not reference VERDICTS or the finite-number guard helper (module-level imports for the pre-existing function are out of scope for this assertion)"
);
// T-3 (HIGH): the SD's central invariant -- UNAVAILABLE_VERDICT must never re-enter VERDICTS --
// was unguarded by any test. This is exactly the regression this SD's whole design exists to
// prevent (see FR-2's description). Pin it explicitly.
fr5.acceptance_criteria.push(
  "A permanent regression pin: expect(VERDICTS).not.toContain(UNAVAILABLE_VERDICT) -- guards against a future edit re-introducing the exact defect FR-2 was designed to avoid (UNAVAILABLE being scored by scoreLeg4 as a 0)."
);

// T-4 (MED): TS-6's "$verify$ would abort" was unfalsifiable as stated. Rephrase to the file's
// own established, provably-testable convention (static /POSTCONDITION FAILED/ pattern match,
// mirroring capacity-verdict-migration.test.js's existing style for the original file).
const ts6 = ts.find((t) => t.id === 'TS-6');
ts6.expected =
  'pg_constraint shows exactly 5 admitted verdict values; information_schema.columns shows the 3 measurement columns nullable and read_failed present; a pre-existing CONTROL row (inserted for this check, not assumed to already exist) is unaffected. Static: the alter migration file itself matches /POSTCONDITION FAILED/ and /PRECONDITION FAILED/ (mirroring the original file\'s own established, already-tested convention for asserting its claims in-transaction rather than exiting green on a partial apply).';

// T-5 (MED): FR-1 AC-5 was vacuous if the table happened to be empty when the migration runs --
// needs a positive CONTROL row, not an assumption one already exists.
const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.acceptance_criteria[4] =
  'A CONTROL row is inserted (via the normal persistCapacityVerdict() path) with a real DEFICIT/DEFICIT-URGENT/TIGHT/SURPLUS verdict BEFORE the migration applies, and is read back with identical values and identical NOT NULL-ness after the migration applies -- never assumed to already exist from other activity.';

// T-7 (LOW): FR-3 AC-4's "must never reach the persist call" reads as a claim about production
// once persistUnavailable exists there too -- narrow the wording to what the two pre-existing
// [QF-20260816-435] tests literally assert (they construct scoreCapacityLeg WITHOUT
// persistUnavailable, so the claim stays true of those tests specifically).
const fr3 = fr.find((f) => f.id === 'FR-3');
fr3.acceptance_criteria[3] =
  "The two pre-existing [QF-20260816-435]-tagged tests in tests/unit/cron/drive-report-sweep.test.js continue to pass unmodified -- both construct scoreCapacityLeg WITHOUT persistUnavailable, so their existing assertion (persistVerdict is never called on a gather failure) remains literally true of those specific test setups.";

// New TS-7: FR-2/FR-5 had NO test_scenario entry at all (testing-agent evidence
// 20db50fc-b5aa-4194-95fe-e8bb7ca14eff) -- TS-1..3 are scoreCapacityLeg-level (FR-3), TS-4 covers
// the OLD writer, TS-5/TS-6 cover the migration. The new writer's own insert-shape and
// throws-on-DB-error paths need their own scenario.
ts.push({
  id: 'TS-7',
  type: 'unit',
  scenario: 'New sentinel writer (makeCapacityVerdictUnavailablePersist) in isolation',
  expected: 'A successful call inserts {read_failed:true, verdict:UNAVAILABLE_VERDICT, belt_depth:null, demand_soon:null, deficit:null} and returns the row id; a DB error on insert throws (propagates, is not swallowed); the new function\'s own source text does not reference VERDICTS.includes or the finite-number guard helper.',
});

// New TS-8: the central-invariant regression pin (T-3), as its own scenario so it is not buried
// inside FR-5's prose only.
ts.push({
  id: 'TS-8',
  type: 'unit',
  scenario: 'Regression pin: UNAVAILABLE_VERDICT can never re-enter VERDICTS',
  expected: "expect(VERDICTS).not.toContain(UNAVAILABLE_VERDICT) -- if a future edit adds UNAVAILABLE to leg4-capacity.js's VERDICTS list, this test fails before scoreLeg4 can silently accept and score it as 0.",
});

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, test_scenarios: ts })
  .eq('id', PRD_ID);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log('PRD corrected per testing-agent PLAN-phase review (evidence 20db50fc-b5aa-4194-95fe-e8bb7ca14eff).');
