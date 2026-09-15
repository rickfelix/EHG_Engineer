#!/usr/bin/env node
/**
 * PLAN-TO-LEAD REGRESSION sub-agent evidence write for
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001. One-off, run once.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '4003f694-8f38-4c3f-9f6e-c11655bfcfdc';
const SD_KEY = 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';

const results = {
  verdict: 'PASS',
  confidence_score: 95,
  summary: 'PLAN-TO-LEAD REGRESSION review confirms the backward-compatibility claim: all 51 files touched by this branch (git diff origin/main...HEAD --name-status) are status A (added) -- zero modifications, zero deletions of any existing file. The full unit tier (4253 test files, 52652 tests) passes with zero failures; the pre-existing tests/unit/org/ role-registry suite (18 files, 202 tests) is unaffected. This is pure addition with no live behavior change.',
  critical_issues: [],
  warnings: [
    {
      severity: 'LOW',
      issue: 'PR #9007 "Validate Documentation" CI check is red (RULE-PROHIB-002: lib/org/acceptance-suite/README.md -- "Library directory - documentation belongs in docs/"). Investigated fresh, not just re-cited from the prior VALIDATION pass: reproduced locally (node scripts/docmon-validate.js --changed-only --base-ref=origin/main -- 1 file, 1 violation, matches CI exactly). This is real but not this SD\'s defect to fix and not a regression: (1) the PRD itself hardcodes this exact path as a required deliverable in 5 places (scripts/one-off/org-acceptance-suite-prd-content.json FR-2/FR-3 requirement text, given/then/deliverables fields) -- moving the file would violate the PRD\'s own acceptance criteria; (2) tests/unit/org/acceptance-suite/readme.test.mjs hardcodes the identical path and currently passes -- moving the file breaks a passing test; (3) confirmed via `find lib -maxdepth 3 -iname README.md` this is a pre-existing, repo-wide, unenforced gap: 4 other lib/*/README.md files already on main (lib/eva, lib/genesis, lib/governance, lib/llm) violate the identical rule today, never caught because docmon\'s changed-only CI mode only flags files touched in a given PR\'s own diff; (4) verified via `gh api repos/.../branches/main/protection` that branch protection\'s ONLY required status check is "Run Unit Tier (quarantine-aware)" -- Validate Documentation does not gate merge. Confirmed CI-green otherwise: watched all checks to completion (gh run watch on both the required Run Unit Tier run and the coverage run, previously pending) -- final state is 100% pass except this one non-blocking, pre-existing, PRD-mandated finding.'
    }
  ],
  recommendations: [
    'No action needed for this SD. If the repo wants docmon\'s location rule enforced for lib/*/README.md going forward, that is a separate, pre-existing, repo-wide cleanup (5 files today, none introduced by this SD) -- out of this SD\'s scope.'
  ],
  findings: [],
  metadata: {
    review_scope: [
      'git diff origin/main...HEAD --stat / --name-status (51 files, all status A)',
      'npx vitest run --project unit (full unit tier: 4253 files, 52652 tests, 0 failures)',
      'npx vitest run --project unit tests/unit/org/ (pre-existing role-registry suite: 18 files, 202 tests, 0 failures)',
      'gh pr checks 9007 --repo rickfelix/EHG_Engineer (polled to completion via gh run watch on the 2 runs that were pending: Run Unit Tier (quarantine-aware) -> success; coverage -> success)',
      'scripts/one-off/org-acceptance-suite-insert-prd.mjs, org-acceptance-suite-lead-spine.mjs, store-org-acceptance-suite-security-review.mjs (the 3 files fixed for require-main-guard-in-one-off-lint in commit 887f8ebf285)',
      'lib/org/role-registry-resolver.mjs ROLE_FIELD_KEYS vs lib/org/acceptance-suite/fixtures/mock-venture.mjs',
      'strategic_directives_v2 dependencies field + dependency SD status (live DB query)'
    ],
    file_level_backward_compat: 'git diff origin/main...HEAD --name-status: 51/51 files are status A (added). Zero M (modified) or D (deleted) entries. No existing production file was touched -- confirms the SD description\'s claim exactly.',
    main_guard_verification: 'Read all 3 fixed files in full: each has `if (isMainModule(import.meta.url)) { main().catch(...) }` correctly WRAPPING the main() call (not just a guard token present elsewhere in the file -- checked the actual call site, not just grep presence). Repo-wide search (grep -rl on scripts/lib/tests) for any OTHER file importing/calling these 3 one-off scripts found none -- the only match was store-org-acceptance-suite-validation-review.mjs, which references the filenames only inside a descriptive prose string (its own recorded findings text), not an import statement. These are one-time evidence-writer scripts, already run once, now correctly guarded against re-execution of their (already-applied) side effects on a future import.',
    dependency_check: 'strategic_directives_v2 row for this SD (id=4003f694-8f38-4c3f-9f6e-c11655bfcfdc) has dependencies=[{"sd_id":"SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001"}]. Live-queried that dependency SD: status=completed. ROLE_FIELD_KEYS check: mock-venture.mjs does not hand-type or hardcode the registry\'s field shape at all -- it imports and calls the REAL templateToBaseRows()/resolveVentureRoles() from lib/org/role-registry-resolver.mjs directly against the real STANDARD_VENTURE_TEMPLATE (lib/agents/venture-ceo-factory.js), so there is no separate assumption that could drift from the live ROLE_FIELD_KEYS list -- the fixture IS the live resolver\'s output, by construction.',
    changelog_disclosure_check: 'No genuine live-behavior change to disclose. This SD adds a wholly new, currently-unwired library (lib/org/acceptance-suite/) with zero existing-file modifications and zero new imports FROM any existing production module INTO this SD\'s code paths (only read-only imports the other direction: this SD\'s fixtures/checks import role-registry-resolver.mjs, venture-ceo-factory.js, and supabase-connection.js, never the reverse) -- confirmed nothing outside lib/org/acceptance-suite/ and its own scripts/one-off/*, tests/* references this SD\'s new code. Unlike a prior SD this session where the same check surfaced a real undisclosed behavior change, this one is honestly pure addition.',
    branch: 'feat/SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001',
    pr: 9007,
    fixes_applied: false,
    fixes_committed: false,
    tests_run: 'npx vitest run --project unit: 4253 passed | 15 skipped test files; 52652 passed | 1 expected fail | 209 skipped | 2 todo tests, 0 failures. npx vitest run --project unit tests/unit/org/: 18 passed test files, 202 passed tests, 0 failures.'
  }
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: null,
    fallback: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
  });
  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults(
    'REGRESSION',
    SD_ID,
    { code: 'REGRESSION', name: 'Regression' },
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
    console.error('FAILED TO STORE REGRESSION RESULTS:', err);
    process.exit(1);
  });
}
