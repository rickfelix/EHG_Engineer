#!/usr/bin/env node
/**
 * PLAN-TO-LEAD VALIDATION sub-agent evidence write for
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001. One-off, run once.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '4003f694-8f38-4c3f-9f6e-c11655bfcfdc';
const SD_KEY = 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';

const results = {
  verdict: 'PASS',
  confidence_score: 90,
  summary: 'Adversarial PLAN-TO-LEAD VALIDATION review of the CI-runnable Organization Acceptance Suite (post-TESTING, post-SECURITY review). Verified real CI status, re-traced the isTestEnvironment() guard against the live production path with real DB execution, ran real mutation tests against 4 of the 11 not-yet-reviewed MAST checks (found and fixed 2 real gaps), re-derived all 5 SD success_criteria against current code with real execution evidence, and found/fixed 2 real (non-blocking) CI hygiene defects this PR introduced. No scope drift found in the TESTING/SECURITY review commits.',
  critical_issues: [],
  warnings: [
    {
      severity: 'LOW',
      issue: '2 of 4 single-entity MAST checks scrutinized (FM-1.1, FM-3.2 -- neither in PRD FR-2 AC-4\'s cross-entity scope) had a real mutation-testing gap distinct from the FM-3.3 single-candidate class already fixed twice this session: FM-1.1\'s `!(f in output)` missing-field check was behaviorally indistinguishable, under the existing fixtures, from the plausible-but-wrong mutation `!output[f]` (truthy check instead of key-presence check) -- both pass the same clean-baseline/broken-fixture pair because no required field ever has a present-but-falsy value in the current fixtures. FM-3.2\'s per-item `!covered.has(c)` coverage check was likewise indistinguishable from `covered.size < required.length` (count comparison instead of per-item comparison) -- the broken fixture only ever drops the count, never swaps in a same-count wrong item. Verified via real mutation testing: backed up each check file, applied the mutation, ran the corresponding test (not caught), restored from backup, confirmed byte-identical via git diff. FM-1.5 and FM-3.1 (the other 2 scrutinized) were checked by inspection and not found to have an analogous gap in the mutations attempted.',
      recommendation: 'FIXED: added 2 targeted discrimination tests to mast-checks.test.mjs (new describe block) proving FM-1.1 treats a present-but-zero required field as NOT missing, and FM-3.2 flags a same-count-but-wrong-item coverage list as still incomplete. Re-applied both mutations and confirmed the new tests now catch them; restored both check files to byte-identical originals. The underlying check code was already correct in both cases -- only test coverage was insufficient to prove it or catch a future regression. 57/57 unit tests pass (was 55).'
    },
    {
      severity: 'LOW',
      issue: 'PR #9007 had 2 real (non-blocking) CI failures introduced by this SD\'s own new files: require-main-guard-in-one-off-lint flagged 3 scripts/one-off/*.mjs entrypoints (org-acceptance-suite-insert-prd.mjs, org-acceptance-suite-lead-spine.mjs, store-org-acceptance-suite-security-review.mjs) that called main() unconditionally with no isMainModule() guard; manifest-drift-check failed because the one-off-mutate-key-manifest\'s "dangerous file" count was stale (47 currently vs. 45 committed) as a direct consequence of the same 3 unguarded files. Neither check is the repo\'s required merge gate (only "Run Unit Tier (quarantine-aware)" is, per branch protection) but both are genuine defects this SD introduced.',
      recommendation: 'FIXED: added the isMainModule(import.meta.url) guard (lib/utils/is-main-module.js) to all 3 files, matching the pattern already used elsewhere in scripts/one-off/. This also self-resolved the manifest drift (the generator\'s "dangerous" count is guard-aware) -- confirmed `node scripts/lint/generate-one-off-mutate-key-manifest.mjs --check` now reports "up to date" with no regeneration needed. Both lints verified green locally after the fix; commit 887f8ebf285 pushed to the PR branch.'
    },
    {
      severity: 'INFO',
      issue: 'PR #9007\'s "Validate Documentation" CI check fails on RULE-PROHIB-002 (lib/org/acceptance-suite/README.md -- "Library directory - documentation belongs in docs/"). This is real but NOT this SD\'s defect to fix: the PRD\'s own FR-2/FR-3 acceptance criteria, scripts/one-off/org-acceptance-suite-prd-content.json (3 separate places), and tests/unit/org/acceptance-suite/readme.test.mjs all hardcode this exact literal path as an approved deliverable -- moving the file to docs/ would violate the PRD\'s own acceptance criteria and break an existing passing test. Confirmed this is a repo-wide, pre-existing gap, not specific to this SD: 4 other lib/*/README.md files already on main (lib/eva/README.md, lib/genesis/README.md, lib/governance/README.md, lib/llm/README.md) violate the identical rule today and are simply never re-flagged because docmon\'s "Validate Documentation" check only runs in --changed-only mode against files touched in a given PR\'s diff, not a full-repo scan. Not this SD\'s required check either (only "Run Unit Tier (quarantine-aware)" gates merge per branch protection).',
      recommendation: 'DOCUMENTED, not fixed -- this is a repo-wide docmon location-policy gap pre-dating this SD (4 unaddressed precedents already on main) and fixing it here would require either changing this SD\'s own PRD-approved acceptance criteria (out of scope for a VALIDATION reviewer to unilaterally decide) or adding a docmon location exception for lib-level README.md files repo-wide (a harness-level fix, not this SD\'s defect). Logged as harness backlog candidate per this session\'s standing mode-declaration rule rather than filed as a new SD/QF (non-critical: does not break a venture stage, lose data, stop the fleet, or pose a security risk).'
    }
  ],
  recommendations: [],
  findings: [],
  metadata: {
    review_scope: [
      'lib/org/acceptance-suite/ (all checks, fixtures, run-suite.mjs, README.md)',
      'tests/unit/org/acceptance-suite/ (all 5 test files)',
      'tests/database/org-acceptance-suite-integrity.db.test.js',
      'scripts/one-off/org-acceptance-suite-*.mjs, store-org-acceptance-suite-*.mjs',
      '.github/workflows/unit-tier.yml (DB-tier CI wiring), tests/helpers/db-tier-gate.js',
      '.docmon/rules.json, scripts/validate-doc-location.js',
      'strategic_directives_v2.success_criteria (queried live)'
    ],
    ci_status_verified: {
      pr: 9007,
      required_merge_gate: 'Run Unit Tier (quarantine-aware) -- confirmed via gh api repos/.../branches/main/protection/required_status_checks (only context listed)',
      failures_found_and_fixed: ['manifest-drift-check', 'require-main-guard-in-one-off-lint'],
      failure_found_and_documented_not_fixed: 'Validate Documentation (RULE-PROHIB-002 on lib/org/acceptance-suite/README.md -- PRD-mandated path, 4 unaddressed repo-wide precedents, not this SD\'s defect)',
      db_tier_wrong_assumption_check: 'CONFIRMED --project db DOES run on every PR via unit-tier.yml\'s "DB-tier CI visibility" step (continue-on-error:true, informational only). tests/database/org-acceptance-suite-integrity.db.test.js IS collected there; local run of `npx vitest run --project db tests/database/org-acceptance-suite-integrity.db.test.js` shows "2 skipped (2)" via tests/setup.db.js\'s global installDbTierGate() beforeEach(ctx.skip()) hook (no VITEST_DB_ALLOW_REF set) -- collected-and-skipped, not silently absent from CI. Matches this SD\'s own PRD characterization; no wrong assumption found this time.'
    },
    isTestEnvironment_guard_reverified: 'Ran both integrity checks (base-immutable.mjs, norms-unwritable.mjs) via `node --input-type=module -e` OUTSIDE any vitest process (process.env.VITEST and NODE_ENV both undefined, confirmed printed) with real .env credentials loaded -- isTestEnvironment() correctly returned false, the fallback branch built a real supabase-js service-role client, and both checks returned {"passed":true} against the live database. Confirms the guard does not break the real (non-test) production path.',
    success_criteria_reverified: 'Queried strategic_directives_v2.success_criteria directly (5 criteria) and re-derived each against current post-security-review code with real execution: (1) runSuite({organization, checks: MAST_CHECKS}) against the clean baseline returns suite_version:"1.0.0", a real run_id UUID, and a populated content_hash -- confirmed live; (2)+(3) all 14 MAST checks pass the clean baseline and fail their own broken fixture, asserted in TS-2 (57/57 passing); (4) both A2 integrity checks confirmed passed:true against the live DB (see isTestEnvironment_guard_reverified); (5) README.md\'s "E6 is a future commissioning-time predicate, not this SD\'s completion criterion" section confirmed present and correctly scoped.',
    scope_drift_check: 'Read fd3795224c7 (SECURITY) and 013c218c978 (evidence writer) in full: both stayed within FR-1 (run-suite.mjs reliability: circular-object crash fix) and FR-4 (integrity-check hardening: deps-injection guard, fail-closed accuracy fix). No new tables, no new chairman-reserved decisions, no scope beyond the PRD\'s own functional requirements. 7cffc2b7d82 (TESTING/FM-3.3) likewise stayed within FR-2 AC-4\'s own explicit text. No drift found.',
    branch: 'feat/SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001',
    pr: 9007,
    fixes_applied: true,
    fixes_committed: true,
    fix_commit_sha: '887f8ebf285',
    tests_run: 'npx vitest run tests/unit/org/acceptance-suite/ -- 57/57 passed (was 55; 2 new mutation-testing hardening tests added for FM-1.1 and FM-3.2). eslint clean. Both fixed CI lints (require-main-guard-in-one-off-lint, one-off-mutate-key-manifest) verified green locally post-fix.'
  }
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: null,
    fallback: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { code: 'VALIDATION', name: 'Validation' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' }
  );

  console.log('STORED ROW ID:', stored?.id ?? stored);
  console.log('VERDICT:', stored?.verdict);
  console.log('REPO RESOLUTION:', JSON.stringify(resolution));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED TO STORE VALIDATION RESULTS:', err);
    process.exit(1);
  });
}
