import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks, integration_operationalization, metadata')
  .eq('id', PRD_ID)
  .single();
if (readErr) throw readErr;

const fr = prd.functional_requirements;
const byId = (arr, id) => arr.find(x => x.id === id);

// ============================================================
// pub-obs-testing-plan-2 re-verification (evidence 1a24f0c5-8c38-488e-9504-1a9b6260ef4b):
// 4 blockers design-correct, but 2 of their tests cannot discriminate, and the correction
// itself opened a new HIGH gap. Fixing all three classes now.
// ============================================================

// A) Strike the still-present FALSE premise sentence at the top of FR-1 (the round-1 fix
// was appended ~200 words later without reconciling the opening claim -- an EXEC reader
// hitting the false sentence first would reimplement the original defect).
byId(fr, 'FR-1').description = byId(fr, 'FR-1').description.replace(
  "It reads the venture_channel_publish_ledger row by correlation_id, then joins campaign_content on campaign_content.idempotency_key = ledger.correlation_id (both are the identical `${ventureId}:${content.id}:${platform}:<ts>` string built once in lib/marketing/publisher/index.js:39 and reused for both writes -- confirmed by direct read, no new correlation scheme).",
  "It reads the venture_channel_publish_ledger row by correlation_id, then joins campaign_content on campaign_content.idempotency_key = ledger.correlation_id. NOTE: prior to the fix below, these two values are NOT reliably the same string -- see the CRITICAL FIX paragraph. After the fix, campaign_content.idempotency_key is always set to authCheck.correlationId, the same value the ledger row is keyed by."
);

// B) FR-1 acceptance criteria: the "real two-attempt integration test" AC is UNPROVABLE in
// this repo/CI. Measured: tests/helpers/db-target.js:25 DESIGNATED_NON_PROD_REFS is frozen
// to [] -- describeDb (describe.skipIf) SKIPS unconditionally here and in CI, so an
// integration-test-only proof of a CRITICAL fix would report green while never running.
// SECOND, independent reason the integration form is unworkable: the chairman-gated
// outbound-gate trigger rejects any venture_channel_publish_ledger INSERT unless the
// venture is is_demo=false AND status=active AND stage>=24 AND launch_mode=live -- which
// directly contradicts FR-8's mock-only mandate for this increment. The load-bearing proof
// is retyped to a UNIT test against the EXISTING table-aware mock in
// tests/unit/marketing/publisher.test.js (already models venture_channel_publish_ledger).
const fr1acs = byId(fr, 'FR-1').acceptance_criteria;
fr1acs[fr1acs.length - 1] = "A UNIT test (tests/unit/marketing/publisher.test.js's existing table-aware mock) drives attempt-1-denied -> chairman-approves -> attempt-2-succeeds and asserts the campaign_content upsert key equals the ORIGINAL propose-time correlation_id returned by checkPublishAuthorization's 'already accepted' branch -- NOT an integration test against a real DB: describeDb (tests/helpers/db-target.js) skips unconditionally in this repo (DESIGNATED_NON_PROD_REFS is frozen empty), and the chairman-gated outbound-gate trigger's is_demo=false/status=active/stage>=24/launch_mode=live requirement is structurally incompatible with FR-8's mock-only design anyway. An optional tests/integration/publish-outcome-observer.test.js MAY be written for a future designated non-prod DB target, but is never the sole or load-bearing proof.";

// C) FR-4: add write-outcome counters distinct from classification counters, and require
// classifying a 23514 check-violation explicitly (Blocker created by the correction itself).
byId(fr, 'FR-4').description += " NEW GAP CLOSED (found by re-verification): widening the JS allowlist (FR-6) to accept 'unmeasurable' opens a pre-migration-apply window that did NOT exist before -- previously the JS allowlist threw first and nothing reached the database; now recordPublishOutcome('unmeasurable') reaches the DB before the chairman-gated SQL migration lands, violates the CHECK constraint (Postgres error code 23514), and autonomy-gate.js:480-482 RETURNS {success:false, error} rather than throwing -- so the write fails SILENTLY while FR-4's rows_unmeasurable counter (a CLASSIFICATION count) still increments as if it succeeded. The scheduled step must classify a 23514 response from recordPublishOutcome explicitly as 'expected-pre-migration' (mirroring database/migrations/20260828_solomon_ledger_outcome_unmeasurable.sql's own documented precedent for the sibling ledger, which warns against this exact ordering hazard) and report it separately from a genuine failure.";
byId(fr, 'FR-4').acceptance_criteria.push("main()'s summary additionally reports rows_written and rows_write_failed, DISTINCT from rows_unmeasurable (a classification count) -- a 23514 check-violation on an unmeasurable write is classified 'expected-pre-migration' in rows_write_failed, never silently absorbed into an apparently-successful rows_unmeasurable count");
byId(fr, 'FR-4').acceptance_criteria.push('The SQL migration (FR-6) is applied before or atomically with the JS allowlist widen in deployment ordering -- documented as a sequencing requirement, not left to chance');

// D) FR-5: drop the tautological recordPublishOutcome execution_mode-predicate requirement.
// Re-verified: venture_channel_publish_ledger.correlation_id is UNIQUE (20260710 migration
// line 65) -- an UPDATE keyed by .eq('correlation_id', X) can only ever touch the ONE row
// with that id, so adding an execution_mode predicate to that UPDATE adds no real safety
// (there is no "wrong-mode row" it could otherwise hit). The genuinely load-bearing half is
// the READ side: evaluateGraduation's candidate SELECT must filter by execution_mode so a
// channel's streak calculation never mixes mock-mode and live-mode rows.
byId(fr, 'FR-5').description = "evaluateGraduation (autonomy-gate.js:497) is only partially mode-aware: its candidate-row SELECT (:512, and the 42703-fallback branch at :523) currently has no execution_mode filter at all, and the loop instead BREAKS the streak when it happens to encounter a mock-mode row -- fail-safe, but not the explicit mode isolation this SD needs. This SD adds an execution_mode filter to evaluateGraduation's candidate SELECT (both the primary and 42703-fallback query forms) so a mock-mode call only ever considers mock-mode rows and a live-mode call only ever considers live-mode rows, replacing the current streak-break-on-mismatch behavior. NOTE (re-verification correction): recordPublishOutcome's UPDATE does NOT need its own execution_mode predicate -- correlation_id already carries a UNIQUE constraint (20260710 migration), so a correlation_id-keyed update can only ever touch the one row it identifies; there is no cross-mode row it could mistakenly hit. That earlier AC is removed as non-discriminating/redundant.";
byId(fr, 'FR-5').acceptance_criteria = [
  "evaluateGraduation's candidate SELECT (both the primary and 42703-fallback forms) filters by execution_mode matching the call's own mode parameter, replacing the current streak-break-on-mismatch loop behavior",
  "A mock-mode evaluateGraduation call never returns rows belonging to a live-mode decision, and vice versa, verified by asserting the query builder was called with the mode filter (TS-9) -- not merely by asserting final streak values through a mock that would pass either way"
];

// E) FR-6: add sequencing note + require extending the existing mock harness with .not()
// BEFORE switching the implementation (Blocker 3's test currently can't discriminate AND
// would crash 5+ existing tests once the code changes, because the mock has no .not method).
byId(fr, 'FR-6').description += " TEST-HARNESS PREREQUISITE (found by re-verification): tests/unit/marketing/autonomy-gate.test.js's existing ledgerChain mock has `neq: vi.fn(() => ledgerChain)` (a pass-through -- it does not actually filter, so a test asserting only on final streak VALUES cannot tell pre-fix code from post-fix code) and has NO `.not()` method at all. Switching evaluateGraduation's real query to `.not('outcome', 'in', '(unknown,unmeasurable)')` without first adding `not: vi.fn(() => ledgerChain)` to that mock would return `undefined` from every existing evaluateGraduation test's mock chain, TypeErroring on the subsequent `.order()` call across 5+ pre-existing tests. Add the `.not()` method to the shared mock FIRST, in the same change as the implementation swap, and write TS-9 to assert the QUERY BUILDER was invoked with the correct filter arguments (query shape), not merely to assert on end-state streak values through a non-discriminating mock.";

// technical_requirements: add the sequencing/classification TR
prd.technical_requirements.push({
  id: 'TR-8',
  title: 'Migration-before-code deployment ordering for the outcome-enum widen',
  description: "FR-6's SQL migration (adding 'unmeasurable' to the CHECK constraint) must be applied before, or atomically with, the JS allowlist widen -- never JS-first. If the JS side ships first, every 'unmeasurable' write fails with 23514 until the migration lands; FR-4's expected-pre-migration classification (TR-9) makes that window observable and non-silent, but the correct operational sequencing is migration-first."
});
prd.technical_requirements.push({
  id: 'TR-9',
  title: "Classify 23514 (check_violation) as expected-pre-migration, never a generic failure",
  description: "Mirrors database/migrations/20260828_solomon_ledger_outcome_unmeasurable.sql's own documented precedent for the sibling solomon_advice_outcome_ledger table: an 'unmeasurable' write attempted before its enabling migration applies is EXPECTED to fail with 23514, and must be classified as such (rows_write_failed, reason='expected-pre-migration'), never conflated with rows_unmeasurable (a classification-only count) or a genuine, unexplained failure."
});

// test_scenarios: retype the 4 tests that rely on the inert describeDb path, fix TS-9,
// remove TS-6 (non-discriminating/redundant), add TS-12 (the new HIGH gap).
const ts = prd.test_scenarios;
const tsById = (id) => ts.find(x => x.id === id);

tsById('TS-1').type = 'unit';
tsById('TS-1').scenario = 'Real two-attempt approval-gated publish yields a joinable post (Blocker 1) -- UNIT test, not integration';
tsById('TS-1').expected = "Using the existing table-aware mock in tests/unit/marketing/publisher.test.js (already models venture_channel_publish_ledger), drive attempt 1 (denied, writes a pending ledger row) then attempt 2 (chairman-approved, succeeds) and assert the campaign_content upsert's idempotency_key equals the ORIGINAL propose-time correlation_id returned by checkPublishAuthorization's accepted branch -- proving the join fires on the real fail-closed-default path. NOT an integration test: describeDb skips unconditionally in this repo (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS is frozen empty), so an integration-only proof of this CRITICAL fix would report green while never executing.";

tsById('TS-2').type = 'unit';
tsById('TS-2').expected = "Via the repo's main(argv, deps) convention with fakes (exemplar tests/unit/cron/payment-attribution-sweep.test.js): running main() twice against the same seeded fake ledger rows, the second run's row SELECTION (filtered on outcome='unknown') returns zero rows and main()'s summary reports 0 processed on the second run. Not gated behind describeDb.";

tsById('TS-3').type = 'unit';
tsById('TS-3').expected = "Via a faked supabase client (not describeDb -- unconditionally skipped in this repo): a mock-mode outcome updates only the mock-mode row; evaluateGraduation's mode-filtered SELECT (FR-5) never returns that row for a live-mode call, so the live row's clean_streak and evaluateGraduation result are unaffected.";

tsById('TS-7').type = 'unit';
tsById('TS-7').expected = "Via faked/injected dependencies (never describeDb, which is unconditionally inert here): running the scheduled step end-to-end against a self-created mock-mode fixture (in-memory/faked rows, not a real DB write gated behind the chairman outbound trigger) causes evaluateGraduation to run successfully from a recorded mock outcome; no real AltifyAI post or real DB row is touched.";

// TS-9: assert query shape, not just end-state values through a non-discriminating mock
tsById('TS-9').expected = "The mock harness (tests/unit/marketing/autonomy-gate.test.js's ledgerChain) gains a `not: vi.fn(() => ledgerChain)` method BEFORE the implementation switches to `.not('outcome','in','(unknown,unmeasurable)')` -- without this, 5+ existing evaluateGraduation tests TypeError on the subsequent .order() call. TS-9 itself asserts the QUERY BUILDER was invoked with the correct filter (e.g. `expect(ledgerChain.not).toHaveBeenCalledWith('outcome', 'in', '(unknown,unmeasurable)')`), not merely that final clean_streak/autonomy_state values are unchanged -- the existing `neq` mock is a pass-through, so an end-value-only assertion cannot distinguish pre-fix from post-fix code.";

// Remove TS-6 (recordPublishOutcome execution_mode predicate) -- non-discriminating and
// unnecessary: correlation_id is UNIQUE, so a correlation_id-keyed update can never touch a
// cross-mode row. Replace it in place with the new TS-12 (real gap, not a phantom one).
const ts6Index = ts.findIndex(x => x.id === 'TS-6');
if (ts6Index !== -1) {
  ts[ts6Index] = {
    id: 'TS-12',
    scenario: 'Pre-migration write failure is classified, not silently absorbed (new HIGH gap from the correction itself)',
    type: 'unit',
    expected: "A recordPublishOutcome('unmeasurable', ...) call whose faked supabase client returns a 23514 (check_violation) error is classified rows_write_failed with reason='expected-pre-migration', and is NEVER counted in rows_unmeasurable (a classification-only count) as if it had succeeded. Distinguishes 'the row was classified unmeasurable' from 'the write actually landed.'"
  };
}
// Note: TS-6 removed as non-discriminating (recordPublishOutcome's UPDATE is already
// uniquely scoped by correlation_id's UNIQUE constraint -- no execution_mode predicate
// needed on the write side; see FR-5's correction above).

// acceptance_criteria: reflect the corrected proof strategy and the new gap closure
const ac = prd.acceptance_criteria;
ac.push("The load-bearing proof of FR-1's fix is a unit test against an existing mock harness, not an integration test -- describeDb is unconditionally inert in this repo (DESIGNATED_NON_PROD_REFS frozen empty) and the chairman-gated outbound trigger is structurally incompatible with FR-8's mock-only design");
ac.push("A pre-migration 'unmeasurable' write (23514) is classified expected-pre-migration and counted in rows_write_failed, never silently counted as a successful classification (TS-12)");
ac.push("evaluateGraduation's mode filter is verified by asserting the query builder's call arguments (query shape), not only by asserting end-state streak values through a mock that cannot distinguish pre-fix from post-fix behavior (TS-9)");

// risks: add the new HIGH risk this correction round found, plus the testability risk
const risks = prd.risks;
risks.push({
  risk: "Widening the JS allowlist to accept 'unmeasurable' before its SQL migration applies opens a silent-failure window: the write reaches the DB, gets rejected with 23514, and recordPublishOutcome RETURNS {success:false} rather than throwing -- so a classification-only counter (rows_unmeasurable) can look healthy while every write is actually failing",
  severity: 'high',
  mitigation: 'Explicit 23514 classification as expected-pre-migration with its own rows_write_failed counter (FR-4, TR-9, TS-12); migration-before-code deployment ordering documented (TR-8)'
});
risks.push({
  risk: 'describeDb (tests/helpers/db-target.js) is unconditionally inert in this repo -- DESIGNATED_NON_PROD_REFS is frozen to [] -- so any test relying on it silently skips instead of failing, including in CI, which would have made the original TS-1/TS-2/TS-3/TS-7 integration-style tests worthless proof of a CRITICAL fix',
  severity: 'medium',
  mitigation: 'All four retyped to unit tests against existing mock harnesses (publisher.test.js, cron main(argv,deps) fakes) as the load-bearing proof; an integration-style test remains optional, never required, for a future designated non-prod DB target'
});

// integration_operationalization: document the describeDb inertness + trigger incompatibility
const io = prd.integration_operationalization;
io.dependencies.push('describeDb (tests/helpers/db-target.js) is unconditionally inert in this repo/CI (DESIGNATED_NON_PROD_REFS frozen to []) -- any test gated behind it silently skips rather than fails; do not rely on it as load-bearing proof for this SD');
io.dependencies.push("The chairman-gated outbound-gate trigger on venture_channel_publish_ledger rejects any INSERT unless the venture is is_demo=false AND status=active AND stage>=24 AND launch_mode=live -- structurally incompatible with a real-DB integration test under FR-8's mock-only mandate; a second, independent reason the load-bearing tests are unit-level, not integration-level");

// metadata: round-3 revision note + corrected activation_test_id target (the integration
// file is inert here; point activation proof at the wiring test instead, which will
// actually execute).
const metadata = {
  ...prd.metadata,
  plan_revision_note_3: {
    at: new Date().toISOString(),
    reason: "Third correction round from an independent TESTING re-verification (evidence 1a24f0c5-8c38-488e-9504-1a9b6260ef4b, CONDITIONAL_PASS, supersedes 26462519): confirmed all 4 original blockers' DESIGN fixes are sound, but found (a) TS-1/TS-2/TS-3/TS-7 relied on describeDb, which is unconditionally inert in this repo (DESIGNATED_NON_PROD_REFS frozen empty) and additionally structurally incompatible with FR-8's mock-only mandate via the chairman-gated outbound trigger -- retyped all four to unit tests against existing mock harnesses; (b) TS-9 (the graduation streak-window fix) could not discriminate pre-fix from post-fix code against the existing pass-through mock, and switching implementations without extending that mock would crash 5+ existing tests -- fixed to assert query shape and require the mock extension first; (c) the round-2 correction itself opened a new HIGH gap: widening the JS allowlist before its SQL migration applies creates a silent-failure window (23514 swallowed as a generic {success:false}) -- fixed with explicit expected-pre-migration classification and new rows_written/rows_write_failed counters (TS-12); (d) FR-5's recordPublishOutcome execution_mode predicate was found tautological (correlation_id is UNIQUE, so no cross-mode row could ever be hit) and removed as unnecessary; (e) struck a leftover false premise sentence at the top of FR-1 that had not been reconciled with the round-2 fix appended later in the same field.",
    source_evidence_row: '1a24f0c5-8c38-488e-9504-1a9b6260ef4b'
  },
  activation_test_id_note: 'Repointed from the (inert) tests/integration/ file to the wiring test, which actually executes in CI: tests/unit/cron/publish-outcome-observer-wiring.test.js'
};

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: fr,
    technical_requirements: prd.technical_requirements,
    test_scenarios: ts,
    acceptance_criteria: ac,
    risks,
    integration_operationalization: io,
    activation_test_id: 'tests/unit/cron/publish-outcome-observer-wiring.test.js',
    metadata
  })
  .eq('id', PRD_ID);
if (writeErr) throw writeErr;

console.log('PRD round-3 corrected. FR count:', fr.length, 'TS count:', ts.length, 'AC count:', ac.length, 'risks:', risks.length);
