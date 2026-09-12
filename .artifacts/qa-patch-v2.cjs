const fs = require('fs');
const P = '.artifacts/testing-exec-d-persist-v2.mjs';
let s = fs.readFileSync(P, 'utf8');
const before = s.length;
const sub = (needle, repl) => {
  if (!s.includes(needle)) throw new Error('ANCHOR NOT FOUND: ' + needle.slice(0, 90));
  s = s.replace(needle, repl);
};

// 1. summary: the full tier is no longer exit 0
sub(
  "`Full unit tier regression: ${full.numTotalTests} tests, ${full.numPassedTests} passed, ${full.numFailedTests} failed, ${full.numPendingTests} skipped, ${full.numTodoTests} todo across ${full.testResults.length} files, exit 0. ` +",
  "`Full unit tier regression: ${full.numTotalTests} tests, ${full.numPassedTests} passed, ${full.numFailedTests} failed, ${full.numPendingTests} skipped, ${full.numTodoTests} todo across ${full.testResults.length} files, exit 1. The 2 failures are BOTH 60s timeouts in tests/unit/eva/complexity-scorer.test.js, a file unrelated to this child; it passes 7 of 7 in 11.67s when run in isolation at this same commit, so they are load-induced flakes under full-tier parallelism, not a regression. ` +"
);

// 2. justification: correct the full-tier claim
sub(
  'and the whole unit tier is green at 48,582 passed / 0 failed, so nothing this child shipped regressed anything else.',
  'The full unit tier ran 48,796 tests with 48,583 passed and 2 failed; both failures are 60-second timeouts in tests/unit/eva/complexity-scorer.test.js, which touches nothing this child ships and passes 7 of 7 in 11.67 seconds in isolation at this same commit, so no shipped change regressed anything.'
);

// 3. add the flake finding at the head of findings
sub(
  "  findings: [\n    { severity: 'medium', type: 'coverage_gap', title: 'TS-15 has no automated test",
  "  findings: [\n    { severity: 'medium', type: 'unrelated_flake', title: 'Full unit tier exits 1 at this commit: tests/unit/eva/complexity-scorer.test.js fails 2 of 7 with \"Error: Test timed out in 60000ms\" at lines 38 and 79. Both call scan(process.cwd()), which walks the whole repo. The file passes 7 of 7 in 11.67s in isolation at the same commit, and the same file passed inside the earlier full-tier run at 68c2b9481c8. Load-induced timeout under full-tier parallelism, unrelated to child D, which ships nothing in lib/eva or scripts/eva.' },\n    { severity: 'medium', type: 'coverage_gap', title: 'TS-15 has no automated test"
);

// 4. full-tier metadata: record the failures verbatim + the isolation re-run
sub(
  "      console_line: 'Test Files 3952 passed | 15 skipped (3967) / Tests 48581 passed | 1 expected fail | 209 skipped | 2 todo (48793) / Duration 224.47s',\n      note: 'The JSON reporter counts the one expected-fail as passed (48582) while the console reporter lists it separately (48581 + 1 expected fail). Both readings recorded; numFailedTests is 0 either way.',",
  "      console_line: 'Test Files 1 failed | 3951 passed | 15 skipped (3967) / Tests 2 failed | 48582 passed | 1 expected fail | 209 skipped | 2 todo (48796) / Duration 248.75s',\n      exit_code: 1,\n      note: 'The JSON reporter counts the one expected-fail as passed (48583) while the console reporter lists it separately (48582 + 1 expected fail). Both readings recorded.',\n      failures: [\n        { file: 'tests/unit/eva/complexity-scorer.test.js', test: 'Complexity Scorer > should detect high cyclomatic complexity files', line: 38, message: 'Error: Test timed out in 60000ms.\\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with \"testTimeout\".' },\n        { file: 'tests/unit/eva/complexity-scorer.test.js', test: 'Complexity Scorer > should report finding_count matching findings array length', line: 79, message: 'Error: Test timed out in 60000ms.\\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with \"testTimeout\".' },\n      ],\n      failures_triage: {\n        related_to_child_d: false,\n        reason: 'child D ships nothing under lib/eva or scripts/eva; the scorer walks the repo with scan(process.cwd()) and both failing cases are wall-clock timeouts, not assertion failures',\n        isolation_rerun: { command: 'npx vitest run --project unit tests/unit/eva/complexity-scorer.test.js', result: '1 file passed, 7 of 7 tests passed', duration: '11.67s', artifact_path: '.artifacts/qa-results/complexity-scorer-isolated.json' },\n        earlier_full_run: 'The same file passed inside the first full-tier run at 68c2b9481c8 (artifact .artifacts/qa-results/unit-full.json, 0 failures).',\n        conclusion: 'Load-induced timeout flake under full-tier parallelism on a machine also running four concurrent adversarial-review agents. Not a regression and not a child-D defect.',\n      },"
);

// 5. supersession + HEAD-movement note
sub(
  "    provenance: {\n      ratification: '6c263823',",
  "    supersedes: {\n      row_id: '18aa590a-671b-4223-9056-120c0eee886e',\n      reason: 'That row was measured at 68c2b9481c8 but the worktree HEAD advanced to 9be8d42c mid-run (commit 9be8d42c396 at 2026-09-06T20:09:00-04:00 changed scripts/michael/classify-apply.mjs and its test; merge 14204250668 of PR #8391 also landed), so the writer stamped it with a commit whose code had not been measured. Every number in THIS row was re-measured at 9be8d42c with HEAD verified identical before and after the run.',\n      head_before: '9be8d42c39668a0e42c42d56a456279872a759e2',\n      head_after: '9be8d42c39668a0e42c42d56a456279872a759e2',\n    },\n    provenance: {\n      ratification: '6c263823',"
);

fs.writeFileSync(P, s);
console.log('patched ok. bytes', before, '->', s.length);
