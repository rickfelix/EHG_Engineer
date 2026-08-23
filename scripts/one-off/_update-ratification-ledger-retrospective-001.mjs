#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RETRO_ID = '7ce20aaa-0314-4ffa-bfc0-59cf0b292092';

// Replaces the auto-generated (PRD-risk-restated) content with genuine SD-specific insights
// from the actual adversarial multi-round sub-agent review (TESTING/SECURITY/VALIDATION/
// REGRESSION) that ran during EXEC. RETROSPECTIVE_EXISTS gate assessed the auto-generated
// version at 57% -- "success criteria restated as learnings, not unique insights" -- this
// content is written to name the concrete defect, file:line, and fix for each finding.
const what_went_well = [
  'Adversarial sub-agent review caught 4 real, non-cosmetic defects before merge: a swallowed guard-failure assertion in the migration verify block, a replica-mode trigger bypass, an unguarded DOWN-migration data-loss path, and a regression detector with zero production call sites -- all four would have shipped invisible if EXEC had stopped at "tests pass".',
  'FR-3 (staleness gauge) required three structurally different integration shapes for the same predicate across Adam (prose-allowlist NO-OP gate), coordinator (COMPOSED_CORES architecture reusing an existing QUIET_TICK_PING token), and Solomon (no aggregator at all -- an always-loud call inside the existing inbox command) -- reading each target file first, instead of assuming one wiring pattern fits all three, avoided writing dead code against the wrong architecture twice.',
  'The FR-5 backfill script correctly refused to run rather than fabricating quote text or an approximated timestamp -- two independent, testable refusal guards (table-existence probe using a non-head read, and a RATIFIED_AT_CONFIRMED flag) instead of a script that "looks done" but would have permanently corrupted an append-only table on first real run.',
  'CI caught two real bugs invisible to local unit tests: 5 unbounded .select() reads (count-truncation-diff-lint) and a print-loop insertion that broke an unrelated durable invariant test (tests/unit/sms-count-render-invariant.test.js) by landing inside its source-text slice window -- both required reading the actual failing assertion, not just re-running until green.',
];

const what_needs_improvement = [
  'lib/chairman/ratification-regression-detector.mjs (FR-4) was fully built, unit-tested, and committed with zero production call sites -- "imported only by its own test file" -- for one full EXEC pass before VALIDATION caught it. The PRD explicitly said the detector must feed the same QUIET_TICK_RATIFICATION_STALE line as FR-3; that requirement was read but not checked off against an actual grep for callers before considering FR-4 "done".',
  'The migration verify-block bug (database/chairman-gated/20260823_chairman_ratifications.sql:223,231,239 -- a bare RAISE EXCEPTION defaulting to the same SQLSTATE its own sibling handler caught) reproduced a trap this migration\'s own header already named and had correctly avoided for ONE exception (the P0100 cleanup code) but reintroduced for three others. Naming a trap once in a comment did not prevent repeating it three lines later in the same file.',
  'A print-loop insertion (scripts/adam-quiet-tick.mjs) was placed by proximity ("this is where the related SMS-parked code lives") rather than by checking what existing tests source-pin that exact file region -- it landed inside tests/unit/sms-count-render-invariant.test.js\'s slice window and broke an unrelated invariant, only caught by CI, not local unit runs against the modified files alone.',
];

const action_items = [
  'Once the chairman approves and applies database/chairman-gated/20260823_chairman_ratifications.sql, run scripts/one-off/chairman-ratification-ledger-operator-contract-waiver-001.mjs\'s underlying intent as a real follow-up: confirm whether the operator-contract triple (armed_cadence/reaper) genuinely needs a dedicated cadence or whether the existing quiet-tick registration is sufficient -- the waiver expires 2026-11-23 and is not meant to be silently renewed.',
  'Before running scripts/one-off/backfill-chairman-ratifications-20260823.mjs, resolve the 7-vs-9 specimen count against source packet 783ac23f7f5 with a human reviewer (Adam/Solomon/chairman) rather than relying solely on this session\'s own reading of the packet prose -- the packet\'s own headline text ("7+ specimens") already undercounts its own enumeration once, so a second independent read is warranted before 10 rows land in an append-only table.',
  'Add a repo-wide grep step to the standard EXEC checklist for any file that prints or emits tokens near existing QUIET_TICK_/similar structural invariant tests -- before inserting new logic into an established aggregator script, run `grep -rl "for (const .* of .*)" tests/` (or equivalent) against the target file to find any test that source-pins a specific code region by text-slicing, not just run the full suite after the fact.',
];

const key_learnings = [
  'A structural property test that slices source text between two textual anchors (e.g. two for-loop signatures) is fragile to ANY insertion between those anchors, not just insertions that touch the property\'s own logic -- an unrelated feature\'s print statement landing in that gap silently becomes part of what the test measures. Generalizes beyond this SD: any future insertion into scripts/adam-quiet-tick.mjs (or any file with a similar slice-based test) should grep for slice anchors in tests/ before choosing where to insert, not after CI fails.',
  'A verify-block assertion that shares its own sibling EXCEPTION handler\'s SQLSTATE class (a bare RAISE EXCEPTION defaults to P0001/raise_exception, the same class a WHEN raise_exception THEN NULL handler catches) is invisible to a green test suite AND to a first read-through -- it only becomes visible when someone deliberately asks "what happens if this specific guard is broken, does the verify block actually notice?" Generalizes to any future append-only-table verify block using the nested-BEGIN-with-custom-SQLSTATE cleanup pattern: each GUARD DID NOT FIRE assertion needs its OWN distinct ERRCODE, not just the cleanup exit.',
  'A `head:true` Supabase count query on a missing table returns {error:null, count:null} -- no error at all -- so table-existence CANNOT be tested that way; only a plain non-head read (.select().limit(1)) surfaces 42P01/PGRST205 reliably. This bit the FR-5 backfill script\'s own existence guard on first write and was caught only because it happened to match a previously-recorded gotcha in this session\'s own memory index, not because it was independently re-derived.',
  'The activation-invariant gate\'s structured-type lane treats key_changes[*].type==="feature" as a UI/surface signal unconditionally -- a backend-only SD (writer helper, staleness gauge, regression detector, none of which render anything) that tags its own key_changes entries "feature" in the LEAD-phase sense of "new capability" false-triggers the schema+UI+worker activation-invariant requirement. The type vocabulary used at LEAD-phase SD authoring has downstream gate consequences that are not obvious at authoring time.',
];

async function main() {
  const { data, error } = await supabase
    .from('retrospectives')
    .update({ what_went_well, what_needs_improvement, action_items, key_learnings, improvement_areas: what_needs_improvement })
    .eq('id', RETRO_ID)
    .select();
  if (error) { console.error('UPDATE FAILED', error.message); process.exit(1); }
  console.log('Updated retrospective', data[0]?.id);
}

if (isMainModule(import.meta.url)) {
  main();
}
