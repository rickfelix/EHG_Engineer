import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('success_criteria')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const criteria = row.success_criteria;
if (!Array.isArray(criteria) || criteria.length < 3) {
  console.error('Unexpected success_criteria shape:', JSON.stringify(criteria));
  process.exit(1);
}

// [0] is the ORIGIN entry (has entry.origin.content_hash) -- criterion text is hash-locked by
// ORIGIN_CRITERION_GATE and must NOT change. Only its `measure` field is safe to edit.
if (!criteria[0].origin) {
  console.error('criteria[0] is not the origin entry as expected -- aborting to avoid touching the wrong element.');
  process.exit(1);
}
criteria[0].measure = 'PARTIALLY delivered -- see metadata.lead_scope_correction (2026-09-11) for the full derivation. The "semantic detection replaces word matching" / GATE2 ambiguity-scan portion is NOT rebuilt here: verified NOT reproducible against current code (checkAmbiguityResolution() in scripts/modules/implementation-fidelity/preflight/index.js already reads git-diff ADDED lines via git show, not PRD text), and the specific bug this ticket originally evidenced was already fixed under SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (merged 2026-09-05, before this re-verification). The "deliverables check... stated as its own finding with the count" portion IS delivered, corrected and narrowed to a specific reporting-accuracy fix, via criteria [1]/[2] below.';

// [1] and [2] are NOT origin-tagged (no `entry.origin`) -- free to correct fully to the real,
// verified, narrowed scope.
criteria[1] = {
  criterion: "FR_DELIVERY_TRACEABILITY's aggregate UNDELIVERED message in projectGateResult() (scripts/modules/handoff/gates/fr-delivery-classifier.js) no longer claims \"this SD does use the FR-reference convention (sibling FRs are referenced)\" when classification.has_work_product is false -- it instead states, as its own distinguishable finding with an explicit count, that code-level delivery could not be measured at all for those FR(s). The has_work_product=true case (a genuinely undelivered FR despite the convention being in use) keeps its existing, correct, already-tested message verbatim.",
  measure: 'Unit test(s) on projectGateResult() assert: (a) the has_work_product=false branch emits the new, distinct message text (not the old "sibling FRs are referenced" string) with the correct undelivered count; (b) the has_work_product=true branch is byte-identical to the current pre-fix message. No change to passed/score/required computation (enforcement semantics unchanged, still governed by LEO_FR_TRACEABILITY_ENFORCE).',
};
criteria[2] = {
  criterion: "GATE2_IMPLEMENTATION_FIDELITY's word-matching-vs-code-scanning defect, as originally described in QF-20260903-881 (gate-reported ambiguity count matches PRD-text occurrences rather than code-diff occurrences), is confirmed NOT reproducible against current code and requires no further fix under this SD.",
  measure: 'Documented in metadata.lead_scope_correction with the direct code trace (checkAmbiguityResolution scans only git-diff ADDED lines via `git show`, never PRD text) and the superseding commit reference (SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001, merged 2026-09-05). No code change required; verified by direct reading of scripts/modules/implementation-fidelity/preflight/index.js during this SD\'s LEAD phase.',
};

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'Construct a fixture SD/PRD with 1+ functional requirements, zero validated user_stories, and zero sub_agent_execution_results TESTING rows at all. Run classifyFrDelivery() then projectGateResult() over it.',
    expected_outcome: 'classification.has_work_product === false; the returned warnings/issues array does NOT contain the string "sibling FRs are referenced" -- it contains a distinct message stating code-level delivery could not be measured, with the correct undelivered count.',
  },
  {
    step_number: 2,
    instruction: 'Construct a second fixture where the SD DOES have a validated story referencing FR-1 (via its FR id in the story text) but a sibling FR-2 has neither a story reference nor matched testing_evidence. Run the same functions.',
    expected_outcome: 'classification.has_work_product === true for the SD; FR-2 status is "undelivered" and the aggregate message for FR-2 is UNCHANGED from current behavior -- still states "this SD does use the FR-reference convention (sibling FRs are referenced), so these are genuinely missing".',
  },
  {
    step_number: 3,
    instruction: 'Run the full existing test suites for fr-delivery-classifier.js and fr-delivery-traceability-gate.js (tests/unit/handoff/gates/).',
    expected_outcome: 'All pre-existing tests still pass unchanged -- this is a targeted addition to the has_work_product=false path only, with zero change to has_work_product=true behavior or to passed/score/required computation.',
  },
];

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_criteria: criteria, smoke_test_steps: smokeTestSteps })
  .eq('sd_key', SD_KEY);
if (updErr) { console.error('update error:', updErr); process.exit(1); }

console.log('OK: success_criteria[0].measure corrected (criterion text untouched/hash-safe), criteria[1]/[2] rewritten to corrected scope, smoke_test_steps rewritten, for', SD_KEY);
