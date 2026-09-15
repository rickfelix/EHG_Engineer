// PLAN-TO-LEAD VALIDATION sub-agent review for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001.
// Final verification pass before LEAD sign-off (PR #9013). This SD had already had 2 rigorous
// adversarial reviews (PLAN-TO-EXEC TESTING found/fixed 3 real gaps; EXEC-TO-PLAN TESTING and
// SECURITY both ran clean) -- this pass's job was final verification, not manufacturing findings.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '0667ff2f-c224-4359-92a7-d156a0a414b1';
const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

const detailedAnalysis = `PLAN-TO-LEAD VERIFY-phase VALIDATION for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001
(PR #9013, branch feat/SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001).

1. CI STATUS: gh pr checks 9013 --repo rickfelix/EHG_Engineer initially showed 2 required checks
   RED: manifest-drift-check ("48 dangerous file(s) currently, committed had 45") and
   require-main-guard-in-one-off-lint (5 violations: 4 .mjs + 1 .cjs scripts/one-off/ evidence
   scripts this SD itself added, each with an unconditional top-level main() call, the exact shape
   that caused the 2026-08-21 backfill-solomon-ledger-decision-by.mjs incident). Root cause: this
   SD's own EXEC/PLAN-phase evidence-writer scripts (instantiate-venture-refuses-insert-prd.mjs,
   instantiate-venture-refuses-lead-spine.mjs, store-testing-exec-to-plan-*.mjs,
   store-testing-plan-to-exec-review.mjs, update-prd-testing-review.cjs) were authored without a
   main-guard. FIX: added isMainModule(import.meta.url) (4 .mjs files, from lib/utils/is-main-module.js)
   and require.main === module (1 .cjs file) around each file's main() call; both lints then passed
   locally (0 violations, manifest up to date at 45 dangerous files) and both checks went green on
   CI after push (commit c4d234ae936). Re-polled gh pr checks 9013 to a final, non-pending state
   after the push: all required checks pass, including manifest-drift-check,
   require-main-guard-in-one-off-lint, and Run Unit Tier (quarantine-aware).

2. FULL REGRESSION: npx vitest run --project unit (whole unit tier) -- 4254 test files, 52671 tests
   passed, 1 expected fail, 209 skipped, 2 todo, 0 unexpected failures (all pre-existing states, not
   introduced by this branch). Targeted re-run: npx vitest run tests/unit/venture-ceo-factory.test.js
   tests/unit/agents/ -- 217/217 passed across 11 test files (matches the count independently
   verified by EXEC-TO-PLAN TESTING).

3. FILE-LEVEL SCOPE: git diff origin/main...HEAD --name-status shows exactly lib/agents/venture-ceo-factory.js
   (M), tests/unit/venture-ceo-factory.test.js (M), and this SD's own scripts/one-off/*.{mjs,cjs,json}
   evidence files (all A, new) -- including the 5 files fixed for the main-guard lint and 1 new file
   (this SD's genuine retrospective-insert script). No unrelated file touched.

4. SUCCESS CRITERIA RE-DERIVATION: read strategic_directives_v2.success_criteria directly from the
   DB (not the PRD's own restated claim). Two criteria: (a) "instantiateVenture() refuses a venture
   id that has no ventures row, throwing a named error and writing zero rows" -- confirmed live in
   lib/agents/venture-ceo-factory.js: the guard '!ventureId || !(await ventureExistsFn(this.supabase,
   ventureId))' throws VentureNotFoundError BEFORE the 2 console.log calls and any of the 4+ table
   writes (agent/identity/relationship/tool-grant), and tests/unit/venture-ceo-factory.test.js has a
   dedicated test asserting .rejects.toBeInstanceOf(VentureNotFoundError) with zero downstream
   create-call assertions passing. (b) "Both existing legitimate call sites are unaffected" --
   confirmed both eva-coo-integration.js:356 and spine-verify-first-run.mjs:128 already pass a real,
   freshly-fetched venture.id, so the guard is additive for them; EXEC-TO-PLAN TESTING additionally
   found and verified 2 more real (non-mocked) e2e call sites are safe by the same reasoning. Both
   criteria genuinely satisfied by the current code, not merely asserted.

5. DEPENDENCY/PRECEDENT CHECK: git diff origin/main...HEAD --name-status -- lib/creative/creative-brief.js
   returns empty -- confirmed read-only reference throughout, never modified. venture-ceo-factory.js's
   own comments cite it 4 times (VentureNotFoundError shape, defaultVentureExists pattern including
   its 22P02 handling, and the caller-side short-circuit) as the precedent mirrored, not imported --
   genuine scope discipline, not merely a stated intent.

6. RETROSPECTIVE: 2 retrospectives already existed for this SD before this pass, both PUBLISHED --
   a LEAD_TO_PLAN handoff row (6b9c4e72, quality_score 70) and a generic RETRO-sub-agent
   auto-generated row (054b8c4d, quality_score 80, WHY-WHY-WHY template content, action_items citing
   missing sd_phase_handoffs rows and N/A metric actuals). Neither captured the actual session
   narrative. Inserted a new row (9039c66a, PUBLISHED, quality_score 100) rather than attempting any
   UPDATE against either PUBLISHED row, respecting the zzz_retrospectives_published_guard trigger --
   capturing the LEAD-phase Explore direct live-DB premise measurement (18,340 orphan
   org_agent_identities rows confirmed exactly, 655/660 distinct venture_ids orphaned), the deliberate
   creative-brief.js precedent reuse, and the 3 real PLAN-TO-EXEC TESTING gaps found and fixed in the
   PRD before code was written (missing export requirement blocking TS-3/TS-4, missing falsy-ventureId
   short-circuit, FR-2 ordering ambiguity against the 2 pre-existing console.log calls).

VERDICT: All 6 checks pass. 2 real CI failures were found and fixed (main-guard lint + its downstream
manifest-drift consequence, both in this SD's own evidence scripts, never in the 2 core files). Full
regression clean. Scope discipline confirmed on both the file-diff boundary and the creative-brief.js
precedent. Success criteria independently re-derived from the DB, not trusted from the PRD. A genuine
retrospective now exists alongside the 2 pre-existing generic ones. Ready for LEAD sign-off.`;

const results = {
  verdict: 'PASS',
  confidence: 94,
  summary:
    'PLAN-TO-LEAD VERIFY VALIDATION for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 (PR #9013). Found and fixed 2 real CI failures on first check (manifest-drift-check, require-main-guard-in-one-off-lint) -- both traced to this SD\'s own 5 scripts/one-off/ evidence-writer scripts missing a main-guard, never the 2 core files. Fixed, pushed (commit c4d234ae936), re-polled CI to a final green state. Full unit tier (52671 tests) and the targeted venture-ceo-factory/agents suites (217 tests) both clean, 0 new failures. File-diff scope confirmed limited to the 2 core files plus this SD\'s own evidence scripts. Both DB success_criteria independently re-derived and confirmed genuinely satisfied. lib/creative/creative-brief.js confirmed untouched (read-only precedent). Inserted a genuine retrospective (9039c66a) alongside 2 pre-existing generic PUBLISHED rows, respecting the published-guard trigger via INSERT not UPDATE.',
  detailed_analysis: detailedAnalysis,
  warnings: [
    '2 PUBLISHED retrospective rows already existed for this SD before this pass (a generic RETRO-sub-agent auto-row and a LEAD_TO_PLAN handoff row); a 3rd, genuine row was added rather than replacing either.',
  ],
  metadata: {
    measured: true,
    pr_number: 9013,
    ci_failures_found_and_fixed: 2,
    ci_failure_checks: ['manifest-drift-check', 'require-main-guard-in-one-off-lint'],
    fix_commit: 'c4d234ae936',
    full_unit_tier_tests: 52671,
    full_unit_tier_failures: 0,
    targeted_tests: 217,
    targeted_test_failures: 0,
    creative_brief_untouched: true,
    retrospective_inserted_id: '9039c66a-6116-43c2-b932-199d591e48f7',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('VALIDATION', SD_ID, { code: 'VALIDATION', name: 'Validation' }, results, {
    sdKey: SD_KEY,
    phase: 'PLAN-TO-LEAD',
  });

  console.log('Stored VALIDATION sub-agent results:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict }, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED to store VALIDATION results:', err);
    process.exit(1);
  });
}
