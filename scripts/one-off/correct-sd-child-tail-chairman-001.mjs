#!/usr/bin/env node
/**
 * LEAD-phase correction for SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001.
 *
 * The SD as authored claimed the SQL canonical (get_pending_chairman_items) and its JS mirror
 * (chairman-actionable.mjs FIXTURE_NAME_PATTERNS) had diverged on ZZZ_/UAT/epoch-tail fixture
 * names. Direct code read (Explore, sub_agent_execution_results id b6299fa0) and a live-DB
 * validation-agent pass (id 222a077c) both refute that: the two are byte-for-byte identical
 * (13/13 patterns), enforced by a currently-passing bidirectional parity test. The real gap is
 * that NEITHER of them has ZZZ_/UAT/epoch-tail coverage, which exists only in a third module
 * (lib/governance/fixture-exclusion.mjs) that is DELIBERATELY kept separate per that module's own
 * docblock and a prior LEAD ruling on sibling SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D.
 *
 * Signalled to the coordinator (436313d8 spec-conflict, dd31e33b feedback) before this write.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001';
const supabase = await getSupabaseClient();

const description = `CHILD-C TAIL, chairman-facing (coordinator route 90e78b63, Alpha-2 measured). CORRECTED 2026-08-15 at LEAD (see sub_agent_execution_results b6299fa0-ddd6-416a-b2d1-32e0e1900085 and 222a077c-6af1-46b1-8612-930c20e3d966): the SD as originally authored claimed the canonical get_pending_chairman_items SQL RPC and its JS mirror chairman-actionable.mjs (FIXTURE_NAME_PATTERNS) had diverged on ZZZ_/bare-UAT/epoch-tail fixture-venture names. Direct code read REFUTES that: the SQL (database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql:51-66) and JS (lib/chairman/chairman-actionable.mjs:41-55) predicates are byte-for-byte identical, 13/13 patterns, enforced by a currently-passing bidirectional parity test (tests/unit/chairman/fixture-pattern-parity.test.js). There is no SQL-vs-JS-mirror divergence to converge.

THE REAL GAP: neither the SQL RPC nor the JS mirror excludes ZZZ_-prefixed, UAT-prefixed, or epoch-tail-suffixed fixture venture names. A third, separate module (lib/governance/fixture-exclusion.mjs) does have this coverage (FIXTURE_VENTURE_NAME_RE, EPOCH_TAIL_RE), but that module's own docblock (lines 29-39) explicitly documents the gap as DELIBERATE ("DO NOT COLLAPSE"), independently corroborated by a prior LEAD agent's live 14-sample measurement on sibling SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D (.artifacts/bank-d-lead.mjs, bank-d-refute.mjs) that explicitly self-refuted unifying these predicates.

LIVE-DB MEASUREMENT (validation-agent, 2026-08-15, over the pooler): ZERO current harm. 0 ZZZ_-prefixed ventures, 0 UAT-named ventures, 71/72 epoch-tail-named ventures are already excluded via the existing is_demo=true leg (the 1 exception has zero decisions), and all 31 currently-pending chairman rows carry NO venture_id at all -- so get_pending_chairman_items' fixture-venture leg is structurally inert on the current live population. The SD's originally-cited specimen "ZZZ_scratch_venture" does not exist in the live database. This is preventive hardening against a real, evidenced predicate gap -- not a fix for an active chairman-email leak.

KNOWN LANDMINE: a cancelled QF (QF-20260807-014) already documents the OPPOSITE-direction defect on this exact pattern list -- unanchored substring patterns (e.g. a naive /uat/i) previously mis-classified REAL ventures as fixtures via substring collision (e.g. "situation", "evaluate", "graduate" all contain "uat"; "-realdb-"/"-noop-"/"citest" similarly false-positived unanchored). The fix MUST use the anchored forms already proven correct in lib/governance/fixture-exclusion.mjs (UAT[-_], EPOCH_TAIL_RE=/[-:]\\d{10,}$/) copied verbatim, not re-derived patterns. Copying the anchored forms is not collapsing onto that module -- the DO-NOT-COLLAPSE constraint is about NOT making chairman-actionable.mjs import from or delegate to fixture-exclusion.mjs; copying the literal regex text into the SQL+JS pair's own pattern lists is fine.

CORRECTED CONTRACT (supersedes the original SQL-first/JS-mirror ordering, which is moot since SQL and JS already agree): add the new ZZZ_/UAT[-_]/epoch-tail patterns to the SQL RPC and JS mirror TOGETHER in the same PR (they must land in lockstep since nothing currently distinguishes an order), re-pin fixture-pattern-parity.test.js's EXPECTED_PAIRS to handle the resulting asymmetric pairing (UAT[-_] maps to 2 SQL ILIKE clauses; EPOCH_TAIL_RE has no ILIKE form and needs a POSIX ~ operator, which the existing "count v.name I?LIKE clauses" cardinality check will not see), and fix tests/integration/get-pending-chairman-items.contract.test.js's stale-migration pin (it currently pins the superseded 20260710 migration file while the live database function body is the 20260717 extension -- the test recreates the stale body in-transaction and tests that, staying green while blind to what is actually live). Explicitly OUT of scope: lib/governance/fixture-exclusion.mjs (DO-NOT-COLLAPSE, untouched) and scripts/cron/chairman-decision-sla-sweep.mjs (imports isFixtureVenture directly from chairman-actionable.mjs, inherits the fix automatically, no direct edit).

FIVE production consumers of the predicate pair identified (validation-agent): scripts/adam-decision-email.mjs (the actual chairman emailer -- names the verification site), lib/chairman/record-pending-decision.mjs (write-side gate, refuses minting decisions for fixture ventures), scripts/backfill-fixture-venture-flags.mjs and scripts/backfill-fixture-venture-is-demo.mjs (mutate ventures.is_demo, dry-run by default -- PLAN must rule explicitly whether these also receive the new patterns), and the EHG frontend's useDecisionGateQueue.ts/DecisionGateDetailSheet.tsx/DecisionActions.tsx (read-only RPC callers, inherit the fix automatically).`;

const scope = 'Add ZZZ_/UAT[-_]/epoch-tail-anchored fixture-name exclusion to get_pending_chairman_items SQL RPC and chairman-actionable.mjs FIXTURE_NAME_PATTERNS together (verified already in lockstep with each other, not diverged); re-pin fixture-pattern-parity.test.js for the resulting asymmetric pairing; fix the integration contract test\'s stale-migration blind spot (pins 20260710, live is 20260717); explicit ruling on the 2 backfill scripts. OUT: lib/governance/fixture-exclusion.mjs (DO-NOT-COLLAPSE) and chairman-decision-sla-sweep.mjs (inherits automatically).';

const success_criteria = [
  { criterion: 'get_pending_chairman_items SQL RPC and chairman-actionable.mjs FIXTURE_NAME_PATTERNS both exclude ZZZ_-prefixed, UAT[-_]-anchored, and epoch-tail-anchored (/[-:]\\d{10,}$/) venture names, using the same anchored forms already proven correct in lib/governance/fixture-exclusion.mjs', measure: 'Direct diff of both pattern lists against fixture-exclusion.mjs\'s FIXTURE_VENTURE_NAME_RE / EPOCH_TAIL_RE; regex forms match verbatim' },
  { criterion: 'No false-positive re-introduction of the QF-20260807-014 class (unanchored substrings like "uat" matching real venture names such as situation/evaluate/graduate, or -realdb-/-noop-/citest unanchored)', measure: 'fixture-pattern-parity.test.js and a new negative-case test assert these specific real-looking names are NOT excluded' },
  { criterion: 'fixture-pattern-parity.test.js re-pinned so a future SQL-vs-JS divergence on the new patterns fails the test, correctly handling that UAT[-_] maps to 2 SQL clauses and EPOCH_TAIL_RE has no ILIKE form', measure: 'Updated EXPECTED_PAIRS + cardinality check passes and is proven to fail on an injected divergence' },
  { criterion: 'get-pending-chairman-items.contract.test.js tests the LIVE function body (20260717), not the superseded 20260710 migration', measure: 'Test file re-pinned to the current migration; confirmed failing before the fix and passing after, against a live prosrc read' },
  { criterion: 'lib/governance/fixture-exclusion.mjs and scripts/cron/chairman-decision-sla-sweep.mjs are untouched (DO-NOT-COLLAPSE respected)', measure: 'git diff shows zero changes to either file' },
  { criterion: 'Explicit, documented ruling recorded on whether backfill-fixture-venture-flags.mjs and backfill-fixture-venture-is-demo.mjs also receive the new patterns', measure: 'PRD FR text states the ruling and rationale, not silence' }
];

const key_changes = [
  { change: 'Add ZZZ_/UAT[-_]/epoch-tail-anchored patterns to get_pending_chairman_items SQL RPC (new migration extending 20260717) and chairman-actionable.mjs FIXTURE_NAME_PATTERNS, in the same PR', type: 'fix', impact: 'Closes the verified predicate gap without reproducing the QF-20260807-014 false-positive class' },
  { change: 'Re-pin fixture-pattern-parity.test.js EXPECTED_PAIRS + cardinality check for the asymmetric UAT[-_] (2 SQL clauses) and EPOCH_TAIL_RE (no ILIKE form, needs POSIX ~) pairing', type: 'test', impact: 'Prevents a future silent SQL-vs-JS divergence on the new patterns' },
  { change: 'Fix get-pending-chairman-items.contract.test.js to test the live 20260717 function body instead of the superseded 20260710 migration file', type: 'fix', impact: 'Removes a blind-but-green integration test that would otherwise mask this exact class of defect' },
  { change: 'Document explicit in/out ruling for backfill-fixture-venture-flags.mjs and backfill-fixture-venture-is-demo.mjs receiving the new patterns', type: 'docs', impact: 'Closes an unnamed blast-radius gap identified by validation-agent' }
];

const risks = [
  { risk: 'Re-introducing the QF-20260807-014 false-positive class (unanchored substring patterns misclassifying real ventures)', impact: 'medium', likelihood: 'medium', mitigation: 'Copy anchored regex forms verbatim from lib/governance/fixture-exclusion.mjs; add explicit negative-case tests for situation/evaluate/graduate-style real names' },
  { risk: 'Landing a third full CREATE OR REPLACE FUNCTION migration file causes merge-then-mutual-revert with 20260710/20260717 (full-object DDL in separate files pattern)', impact: 'medium', likelihood: 'low', mitigation: 'Deliberately choose the landing migration file at PLAN; do not let two full-body migrations for the same function merge independently' },
  { risk: 'DDL apply is chairman-gated (staged only, never inline) -- code lands but the live predicate does not change until the chairman ceremony runs', impact: 'low', likelihood: 'high', mitigation: 'Migration file carries blank/gated @approved-by per convention; EXEC builds and stages only, does not apply' }
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Query get_pending_chairman_items with a fixture venture row named ZZZ_scratch_venture (or UAT-thing, or job-1786000000000) having a blocking pending decision', expected_outcome: 'RPC excludes the row (fixture-venture leg now matches)' },
  { step_number: 2, instruction: 'Run chairman-actionable.mjs\'s isFixtureVenture against the same three names', expected_outcome: 'JS mirror agrees with the SQL RPC on all three (parity maintained)' },
  { step_number: 3, instruction: 'Run isFixtureVenture / the RPC against real-looking names situation-tracker, evaluate-q3-venture, graduate-program-app', expected_outcome: 'All three are NOT excluded (no QF-20260807-014 regression)' },
  { step_number: 4, instruction: 'Run tests/integration/get-pending-chairman-items.contract.test.js', expected_outcome: 'Test now exercises the live 20260717-derived function body, not the superseded 20260710 file' }
];

const strategic_objectives = [
  'Close the verified ZZZ_/UAT/epoch-tail fixture-name gap shared by get_pending_chairman_items and chairman-actionable.mjs, using proven-correct anchored patterns',
  'Preserve the documented DO-NOT-COLLAPSE boundary between this predicate pair and lib/governance/fixture-exclusion.mjs',
  'Avoid reproducing the QF-20260807-014 false-positive class while closing the gap',
  'Remove a blind-but-green integration test that currently tests a superseded migration file instead of the live function'
];

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    scope,
    success_criteria,
    key_changes,
    risks,
    smoke_test_steps,
    strategic_objectives,
    updated_at: new Date().toISOString(),
  })
  .eq('sd_key', SD_KEY)
  .select('sd_key, updated_at')
  .maybeSingle();

if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
if (!data) { console.error('UPDATE MATCHED ZERO ROWS -- sd_key mismatch?'); process.exit(1); }
console.log('Corrected:', JSON.stringify(data));
