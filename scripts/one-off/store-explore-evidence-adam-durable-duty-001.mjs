// SD-LEO-FIX-ADAM-DURABLE-DUTY-001 — Explore sub-agent evidence writer (LEAD phase).
// RETROACTIVE verification SD: the fix already shipped as PR #8674 (merged, commit
// ab483f2889b) before this SD existed, escalated because the diff touched a sensitive
// CI-workflow path (.github/workflows/unit-tier.yml) that complete-quick-fix.js's
// QF_ELIGIBILITY_PREFLIGHT refuses to self-close by design (no bypass flag). This Explore
// evidence independently re-derives, from the repo at HEAD, whether the three original
// defects (QF-20260903-433) are actually fixed -- not copied from the commit message.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-FIX-ADAM-DURABLE-DUTY-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'Independently re-derived (not inferred from the commit message) that all three original defects from QF-20260903-433 ' +
    'are fixed at HEAD (commit ab483f2889b, PR #8674, merged). (1) Regex asymmetry: scripts/adam-startup-check.mjs no longer ' +
    'defines its own parseDurableDutyMarkers -- it now imports parseDurableDutyMarkers/slugifyDuty from ' +
    './solomon-startup-check.mjs (line 37) and re-exports them (line 351); `git show ab483f2889b -- scripts/adam-startup-check.mjs` ' +
    'confirms the old bare-marker-only regex was deleted in full, not patched. solomon-startup-check.mjs:286\'s regex ' +
    '(`DUTY\\s*\\(\\s*durable\\b[^)]*\\)`) matches both the bare and qualifier-with-semicolon forms. (2) Dead verifier: ' +
    '`npx vitest run tests/unit/adam-startup-check.test.mjs` still reports "No test files found, exiting with code 1" (unchanged -- ' +
    'this file uses node:test, vitest cannot collect it by path), but `node --test tests/unit/adam-startup-check.test.mjs` now ' +
    'passes 25/25, and package.json:155 (`test:adam-startup-check`) plus .github/workflows/unit-tier.yml:106-114 wire it into every ' +
    'CI run via the same node --test precedent already used for test:session-tick and test:adam-github-assessment -- confirmed by ' +
    'reading both files directly, not assumed from the diff. (3) Coverage gap: two new tests in ' +
    'tests/unit/adam-startup-check.test.mjs (named "QF-20260903-433: parseDurableDutyMarkers recognizes the qualifier form..." at ' +
    'line 279 and "QF-20260903-433: renderContractParity reports CONTRACT DRIFT..." at line 295) independently verified to pass under ' +
    'node --test -- the first proves a qualifier-form duty parses and resolves through missingDurableDuties; the second proves a ' +
    'zero-marker fixture contract reports CONTRACT DRIFT rather than a vacuous CLEAN. Regression check: grepped the repo for any ' +
    'other importer of parseDurableDutyMarkers/missingDurableDuties from adam-startup-check.mjs -- only scripts/adam-quiet-tick.mjs ' +
    'imports from that file, and only { ADAM_LOOPS, parseArmedSet, loopStatus }, none of which were touched; the re-export at line ' +
    '351 means the test file\'s own import path (../../scripts/adam-startup-check.mjs) is unbroken, proven by its 25/25 pass. ' +
    'Ran the 7 other vitest suites that touch adam/solomon-startup-check.mjs (152 tests) -- all pass, no regressions.',
  findings: [
    { id: 'defect-1-regex-asymmetry-fixed', severity: 'info', note: 'Structural fix via shared import, not a re-patched regex, per the ticket\'s own explicit fix-shape instruction. Confirmed by reading the import/re-export lines and Solomon\'s qualifier-accepting regex directly.' },
    { id: 'defect-2-dead-verifier-fixed', severity: 'info', note: 'vitest still cannot collect this file by path (confirmed unchanged), but it is now executed in CI via a dedicated node --test step mirroring an existing precedent pattern used twice already in the same workflow file.' },
    { id: 'defect-3-coverage-gap-fixed', severity: 'info', note: 'Both missing regression tests (qualifier-form parse + zero-marker CONTRACT DRIFT) now exist and independently verified passing under node --test.' },
    { id: 'premise-correction-noted', severity: 'info', note: 'The original ticket framed the missing-duties assertion as "vacuous, satisfied by an empty contract" -- not accurate against the real, non-empty CLAUDE_ADAM.md (confirmed: it currently carries 2 bare-form durable duties, so the parity test was never actually vacuous in production). The real gap this SD closes is that nothing tested the qualifier-form case or the pre-existing zero-marker drift guard, which is a narrower but still real and now-closed gap.' },
    { id: 'no-regressions-found', severity: 'info', note: 'Only consumer of adam-startup-check.mjs exports (other than its own test file) is scripts/adam-quiet-tick.mjs, importing unrelated names. 152 tests in 7 other suites touching adam/solomon-startup-check.mjs pass unchanged.' },
  ],
  metadata: {
    shipped_pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8674',
    shipped_commit: 'ab483f2889b',
    source_qf: 'QF-20260903-433',
    escalation_reason: 'sensitive_path_ci_workflow',
    node_test_result: '25/25 passing (tests/unit/adam-startup-check.test.mjs)',
    vitest_collect_status: 'No test files found (expected -- node:test file, wired via node --test CI step instead)',
    regression_suite_result: '152/152 passing across 7 other vitest suites touching adam/solomon-startup-check.mjs',
  },
  execution_time_ms: 420000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
