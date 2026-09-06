const fs = require('fs');
const d = JSON.parse(fs.readFileSync('.artifacts/prd-current.json', 'utf8'));

const byId = Object.fromEntries(d.functional_requirements.map((fr, i) => [fr.id, i]));

// FR-2: clarify only 2/3 sites use buildIdentityMessage; sender_session pinned at insert level.
d.functional_requirements[byId['FR-2']].description +=
  " TESTING (PLAN, evidence 3e0331d8-68ac-4027-a43f-8c795de07d1c) confirmed only 2 of the 3 raw insert sites route through buildIdentityMessage() — the third (~line 713 area, the initial-assignment SET_IDENTITY send) constructs its payload inline and is NOT reachable from the builder. sender_session must therefore be added directly at EACH of the three insert call sites (not solely inside buildIdentityMessage), reading the already-in-scope coordinator session id local to main()/its callers.";
d.functional_requirements[byId['FR-2']].acceptance_criteria.push(
  "tests/unit/assign-fleet-identities-rename-legibility.test.js's exact toEqual() assertion on the constructed message is relaxed to toMatchObject() (or an explicit payload.kind assertion is added) before this FR's payload.kind addition lands, so the added field does not fail an over-exact pre-existing assertion."
);

// FR-3: DRAIN_SETS four-way registration decision + seed migration + breaking tests.
d.functional_requirements[byId['FR-3']].description +=
  " OPEN DECISION FOR EXEC (surfaced by TESTING, evidence 3e0331d8-68ac-4027-a43f-8c795de07d1c): worker-signal.cjs accepts --to, so a /signal can be sent to a worker, Adam, Solomon, or Michael target, not only the coordinator. Registering 'worker_signal' in DRAIN_SETS.coordinator alone leaves the other three role drain sets unaware of the kind, which could trip a confident-mismatch warn in the addressee-role-match warn path for a non-coordinator-targeted signal. EXEC must register 'worker_signal' in ALL FOUR role drain sets (coordinator, solomon, michael, adam) and their role_drain_sets DB seed rows UNLESS a live check first confirms the warn path is never reached for this write pattern — this is a decision to make and document at EXEC time, not a silent single-set registration.";
d.functional_requirements[byId['FR-3']].acceptance_criteria.push(
  "The role_drain_sets DB seed migration adds a ('coordinator','worker_signal') row (and the other three roles per the OPEN DECISION above) so tests/unit/*drain-set-registry*.test.js's seed-parity loop passes without manual exception.",
  "tests/unit/*drain-sets-adam-reconciliation*.test.js's DRAIN_SETS.coordinator.length pinned count is bumped by exactly the number of sets 'worker_signal' is added to."
);

// FR-5: emitPersistentUnverifiedSignal has no existing test.
d.functional_requirements[byId['FR-5']].description +=
  " TESTING (PLAN, evidence 3e0331d8-68ac-4027-a43f-8c795de07d1c) found emitPersistentUnverifiedSignal has NO existing test coverage anywhere in the suite (only emitOverdueSignal is tested) — a new test must be authored for the UNVERIFIED path, not merely an extension of the existing OVERDUE test, or half of this FR ships unpinned.";
d.functional_requirements[byId['FR-5']].acceptance_criteria.push(
  "A new test (sibling to tests/unit/periodic-liveness/watcher-emit-overdue-signal.test.js) covers emitPersistentUnverifiedSignal's sender_session and body directly — this path currently has zero test coverage."
);

// FR-7: RED control requirement + AST static-guard recommendation.
d.functional_requirements[byId['FR-7']].description +=
  " TESTING (PLAN, evidence 3e0331d8-68ac-4027-a43f-8c795de07d1c) specifies two corrections: (i) FR-7(b)'s fixture MUST include a RED control (the same six/eight rows with their stamps stripped) asserting a non-zero violation count — an all-zero assertion with no red control would pass identically before and after the fix and prove nothing; the control must also correctly treat lib/npm-install-lock.cjs's row as sender_type='system' (already exempt), so stripping only its kind should show up as untyped_row, never empty_sender_row. (ii) FR-7(a)'s writer-census test is best implemented as a table-driven static guard (e.g. tests/static-guards/session-coordination-writer-census.test.js) pinning a manifest of the 8 writer sites and their expected occurrence count/shape, rather than per-file runtime mocks — most of these are inline inserts in large CLI-main files where a runtime harness costs far more than the 1-2 assertions it buys; a manifest-count approach also catches a newly ADDED unstamped writer, not only a regression on an existing one.";
d.functional_requirements[byId['FR-7']].acceptance_criteria.push(
  "The FR-7(b) fixture includes a RED control (stamps stripped) asserting a non-zero, correctly-classified violation count, not only a green all-zero assertion.",
  "FR-7(a) is implemented as a table-driven static guard over a pinned writer manifest (file:line + expected stamp presence), not per-file runtime mocks."
);

// FR-8: orphan-writers-registry pinned total collision.
d.functional_requirements[byId['FR-8']].acceptance_criteria.push(
  "tests/unit/*orphan-writers-registry*.test.js's PINNED_TOTAL_ENTRIES constant is bumped by exactly 1 and re-read live at merge time (not assumed) to account for QF-20260904-116 landing first if it has."
);

// Add a TR noting the pre-implementation baseline.
d.technical_requirements.push({
  id: 'TR-4',
  title: 'Pre-implementation test baseline established',
  description: 'TESTING ran the 10 affected suites pre-implementation (PLAN phase, evidence 3e0331d8-68ac-4027-a43f-8c795de07d1c): 123/123 green. EXEC re-runs the same suites post-implementation as the regression baseline comparison, not a fresh unscoped run.'
});

// Metadata trace.
d.metadata = d.metadata || {};
d.metadata.plan_testing_refinements = {
  evidence_id: '3e0331d8-68ac-4027-a43f-8c795de07d1c',
  baseline: '123/123 green pre-implementation across 10 affected suites',
  breaking_tests_identified: [
    'tests/unit/assign-fleet-identities-rename-legibility.test.js (exact toEqual -> relax to toMatchObject)',
    'tests/unit/*drain-sets-adam-reconciliation*.test.js (DRAIN_SETS.coordinator.length pinned count)',
    'tests/unit/*drain-set-registry*.test.js (role_drain_sets seed-parity count)',
    'tests/unit/*orphan-writers-registry*.test.js (PINNED_TOTAL_ENTRIES)'
  ]
};

fs.writeFileSync('.artifacts/prd-patched.json', JSON.stringify(d, null, 2));
console.log('patched FR count:', d.functional_requirements.length, 'TR count:', d.technical_requirements.length);
