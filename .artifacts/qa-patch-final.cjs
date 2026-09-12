const fs = require('fs');
const SRC = '.artifacts/testing-exec-d-persist.mjs';
const DEST = '.artifacts/testing-exec-d-persist-final.mjs';
let s = fs.readFileSync(SRC, 'utf8');
const sub = (needle, repl) => {
  if (!s.includes(needle)) throw new Error('ANCHOR NOT FOUND: ' + needle.slice(0, 100));
  s = s.replace(needle, repl);
};

// 1. point shipped / lint / floor / smoke at the v3 artifacts (measured at a verified-stable HEAD).
//    fullPath stays unit-full.json: that run is fingerprinted to 68c2b948 by its 48793-test count
//    (the later runs carry +3 tests from PR #8391, which is NOT in 68c2b948).
sub("const shippedPath = R + 'michael-d-shipped.json';", "const shippedPath = R + 'michael-d-shipped-v3.json';");
sub("const floorPath = R + 'baseline-floor.json';", "const floorPath = R + 'baseline-floor-v3.json';");
sub("const lintPath = R + 'eslint-shipped.json';", "const lintPath = R + 'eslint-shipped-v3.json';");
sub("const smokePath = R + 'ts15-smoke.json';", "const smokePath = R + 'ts15-smoke-v3.json';");

// 2. environment-instability finding
sub(
  "  findings: [\n    { severity: 'medium', type: 'coverage_gap', title: 'TS-15 has no automated test",
  "  findings: [\n    { severity: 'medium', type: 'measurement_environment', title: 'The full unit tier is NOT reproducibly green on this host right now, for reasons unrelated to child D. Three full-tier runs at this commit and the adjacent --pr9 commit gave 0, 2 and 16 failures as machine load rose (224s, 249s, 401s wall clock). Of the 5 files that failed in the worst run, 4 pass in isolation; only tests/unit/eva/complexity-scorer.test.js stays red, on wall-clock budgets (its own \"should complete scan in under 30 seconds\" case measured 47996ms). Three of the five (post-merge-worktree-cleanup, post-merge-worktree-cleanup-claim-protect, source-tree-identity-realgit) shell out to real git against THIS worktree, which a concurrent agent branch-switched mid-run. No michael or child-D file failed in any run.' },\n    { severity: 'medium', type: 'coverage_gap', title: 'TS-15 has no automated test"
);

// 3. full-tier metadata: keep run 1 as primary, attach the full flake dossier
sub(
  "      note: 'The JSON reporter counts the one expected-fail as passed (48582) while the console reporter lists it separately (48581 + 1 expected fail). Both readings recorded; numFailedTests is 0 either way.',",
  "      note: 'The JSON reporter counts the one expected-fail as passed (48582) while the console reporter lists it separately (48581 + 1 expected fail). Both readings recorded; numFailedTests is 0 either way.',\n      commit_fingerprint: 'This run totals 48793 tests. The two later full-tier runs total 48796 because PR #8391 (merge 14204250668, on the --pr9 branch only) adds 3 tests. The 48793 count therefore pins this artifact to 68c2b9481c8, the commit under evaluation.',\n      exit_code: 0,\n      reproducibility: {\n        summary: 'Three full-tier runs were taken this session. Only the first is clean. The degradation tracks machine load and concurrent git mutation of this worktree, not the code under evaluation.',\n        runs: [\n          { run: 1, commit: '68c2b9481c8', artifact: '.artifacts/qa-results/unit-full.json', tests: 48793, failed: 0, duration_s: 224.47, note: 'clean' },\n          { run: 2, commit: '9be8d42c396 (--pr9)', artifact: '.artifacts/qa-results/unit-full-v2.json', tests: 48796, failed: 2, duration_s: 248.75, note: 'both failures are 60s timeouts in tests/unit/eva/complexity-scorer.test.js; that file then passed 7/7 in 11.67s in isolation' },\n          { run: 3, commit: '68c2b9481c8', artifact: '.artifacts/qa-results/unit-full-v3.json', tests: 48793, failed: 16, duration_s: 401.39, note: '5 files; 6 test timeouts, 3 hook timeouts and a 47996ms-vs-30000ms duration assertion' },\n        ],\n        isolation_rerun: {\n          command: 'npx vitest run --project unit <the 5 files that failed in run 3>',\n          artifact: '.artifacts/qa-results/flaky-isolated.json',\n          result: '4 of 5 files pass (51 of 53 tests). Only tests/unit/eva/complexity-scorer.test.js stays red, 2 of 7, on wall-clock budgets.',\n          passed_in_isolation: [\n            'scripts/modules/shipping/__tests__/post-merge-worktree-cleanup.test.js',\n            'scripts/modules/shipping/__tests__/post-merge-worktree-cleanup-claim-protect.test.js',\n            'scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.test.js',\n            'tests/unit/fleet/source-tree-identity-realgit.test.js',\n          ],\n        },\n        verbatim_failure_messages: [\n          'Error: Test timed out in 60000ms.\\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with \"testTimeout\". (x6)',\n          'Error: Hook timed out in 10000ms. (x3)',\n          'AssertionError: expected 47996 to be less than 30000 (tests/unit/eva/complexity-scorer.test.js > should complete scan in under 30 seconds)',\n        ],\n        child_d_files_among_failures: 0,\n        attribution: 'child D ships nothing under lib/eva, scripts/eva, scripts/modules/shipping or scripts/modules/handoff. Its own 14 test files were green in all three full-tier runs and in three separate targeted runs.',\n      },"
);

// 4. supersedes + the HEAD-movement history
sub(
  "    provenance: {\n      ratification: '6c263823',",
  "    supersedes: {\n      rows: [\n        { row_id: '18aa590a-671b-4223-9056-120c0eee886e', measured_at_commit: '68c2b9481c8', stamped_column: '9be8d42c396', defect: 'correct measurements, wrong stamp' },\n        { row_id: '3295c710-6f27-4077-ae75-95cce94e8874', measured_at_commit: '9be8d42c396', stamped_column: '68c2b9481c8', defect: 'measurements taken on the --pr9 branch, stamped with the main child branch' },\n      ],\n      cause: 'A concurrent agent branch-switched this shared worktree twice mid-session: out to feat/...-002-D--pr9 (where it committed 9be8d42c396, changing scripts/michael/classify-apply.mjs and its test) and back to feat/...-002-D at 68c2b9481c8. The evidence writer stamps evaluated_commit_sha from a live git rev-parse HEAD at WRITE time, so each earlier row certified a commit whose code it had not measured.',\n      resolution: 'Every shipped-file number in THIS row was re-measured with HEAD verified identical immediately before and after each run, and HEAD re-verified again at write time. The shipped suite was green at BOTH commits (250/250 in three independent runs), so the child verdict is unaffected by which of the two was current.',\n      head_verified_at_write: '68c2b9481c8e784b462a401ab3c8f29543c95641',\n    },\n    provenance: {\n      ratification: '6c263823',"
);

fs.writeFileSync(DEST, s);
console.log('wrote', DEST, s.length, 'bytes');
