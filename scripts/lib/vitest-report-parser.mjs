/**
 * vitest-report-parser.mjs
 *
 * Normalizes a parsed vitest --reporter=json report into flat failure
 * records, regardless of vitest's major-version reporter shape. Extracted
 * from audit-test-failures.mjs (SD-LEO-FIX-COVERAGE-BASELINE-REGRESSION-001)
 * so scripts/lib/baseline-regression-check.mjs can reuse it without an
 * audit-test-failures.mjs <-> baseline-regression-check.mjs import cycle.
 */

/**
 * Normalize a vitest JSON report (1.x testResults[] OR 3.x+ files[]) into a
 * flat list of { file, test, error } failure records.
 */
export function extractFailures(json) {
  const failures = [];

  // Vitest 1.x reporter shape: testResults[] with assertionResults[]
  for (const tr of json.testResults ?? []) {
    const filePath = tr.name ?? tr.testFilePath ?? 'unknown';
    for (const ar of tr.assertionResults ?? []) {
      if (ar.status === 'failed') {
        failures.push({
          file: filePath,
          test: ar.fullName ?? ar.title ?? 'unknown',
          error: (ar.failureMessages ?? []).join('\n'),
        });
      }
    }
  }

  // Vitest 3.x+ reporter shape: files[] with tasks[] (recursive describe)
  for (const f of json.files ?? []) {
    const filePath = f.filepath ?? f.name ?? 'unknown';
    const visit = (tasks) => {
      for (const t of tasks ?? []) {
        if (t.type === 'test' && t.result?.state === 'fail') {
          const errs = (t.result.errors ?? [])
            .map((e) => e.stack ?? e.message ?? '')
            .join('\n');
          failures.push({
            file: filePath,
            test: t.name ?? 'unknown',
            error: errs,
          });
        }
        if (t.tasks) visit(t.tasks);
      }
    };
    visit(f.tasks);
  }

  return failures;
}
