/**
 * Unit tests for ESLint rule `no-count-delta-gate-assertion`.
 *
 * SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 FR-4/FR-6.
 *
 * Covers: correct pattern (identity-set diff nearby — computeIdentityRegression/new Set/.has),
 * the anti-pattern (raw subtraction/relational comparison on a failure-count-lexicon name with
 * no nearby identity-set op), each failure-count-lexicon variable name, and the escape-hatch
 * pragma contract (mirrors no-realtime-teardown-in-subscribe-callback.js).
 *
 * @module tests/unit/eslint-rules/no-count-delta-gate-assertion.test.js
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-count-delta-gate-assertion.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const RULE_ID = 'rule-to-test/no-count-delta-gate-assertion';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-count-delta-gate-assertion', rule, {
  valid: [
    // TS-1: the converted compare-test-baseline.cjs pattern — computeIdentityRegression nearby.
    {
      code: `
        function compareTestCounts(baseline, current) {
          const idResult = computeIdentityRegression(current.failing_ids, baseline.failing_ids, {
            failed: current.failed,
            priorFailedCount: baseline.failed,
          });
          return idResult.regression;
        }
      `,
    },
    // TS-2: row-growth-snapshot.cjs-style table-scoped comparison — no failure-count lexicon name.
    {
      code: `
        function detectRowGrowthAnomalies(prevRaw, currRaw) {
          const delta = currRaw - prevRaw;
          return delta >= absSpike;
        }
      `,
    },
    // TS-3: an identity-set diff via new Set()/.has() elsewhere in the same function.
    {
      code: `
        function check(current_failed, baseline_failed, currentIds, priorIds) {
          const priorSet = new Set(priorIds);
          const newIds = currentIds.filter((id) => !priorSet.has(id));
          const rose = current_failed > baseline_failed;
          return newIds.length > 0;
        }
      `,
    },
    // TS-4: an ordinary, unrelated numeric threshold check (not a failure-count lexicon name).
    {
      code: `
        function checkPassRate(passRate, threshold) {
          return passRate < threshold;
        }
      `,
    },
    // TS-4b: an existence check (count > 0) — not a main-vs-PR delta, just "are there any".
    {
      code: `
        function report(failed) {
          if (failed > 0) { console.log('has failures'); }
        }
      `,
    },
    // TS-4c: an absolute-cap check against an ALL_CAPS constant, not a baseline/prior count.
    {
      code: `
        const MIN_FAILURES_FOR_PATTERN = 3;
        function shouldCreatePattern(failureCount) {
          return failureCount < MIN_FAILURES_FOR_PATTERN;
        }
      `,
    },
    // Pragma present with a non-empty reason.
    {
      code: `
        function absoluteCap(failed_count) {
          // eslint-disable-next-line ${RULE_ID} -- absolute hard cap, no main-vs-PR delta semantics
          return failed_count > 100;
        }
      `,
    },
    // TS-10: pragma above a WHILE statement whose comparison is nested deep inside the condition
    // (right operand of &&) — the pragma detector must walk up to the enclosing statement, not
    // just check the immediately-preceding token of the nested BinaryExpression itself.
    {
      code: `
        function parse(errorCount, results, match) {
          // eslint-disable-next-line ${RULE_ID} -- parsing-loop bound, not a regression gate
          while (match !== null && errorCount < results.failed) {
            errorCount++;
          }
        }
      `,
    },
  ],
  invalid: [
    // TS-5: the pre-conversion compare-test-baseline.cjs pattern — raw subtraction, no identity op.
    {
      code: `
        function compareTestCounts(baseline, current) {
          const new_failures = Math.max(0, current.current_failed - baseline.baseline_failed);
          return new_failures;
        }
      `,
      errors: [{ messageId: 'noCountDeltaGate' }],
    },
    // TS-6: relational comparison on numFailedTests.
    {
      code: `
        function decide(numFailedTests, priorFailedCount) {
          return numFailedTests > priorFailedCount;
        }
      `,
      errors: [{ messageId: 'noCountDeltaGate' }],
    },
    // TS-7: each failure-count-lexicon variable name, one violation each.
    {
      code: `function a(failed_count, x) { return failed_count > x; }`,
      errors: [{ messageId: 'noCountDeltaGate' }],
    },
    {
      code: `function b(x, new_failures) { return x >= new_failures; }`,
      errors: [{ messageId: 'noCountDeltaGate' }],
    },
    // TS-8: pragma present but missing the `--` REASON marker entirely (no marker at all is
    // treated the same as no pragma — the violation still reports, mirroring the sibling rule).
    {
      code: `
        function decide(failed_count, x) {
          // eslint-disable-next-line ${RULE_ID}
          return failed_count - x;
        }
      `,
      errors: [{ messageId: 'noCountDeltaGate' }],
    },
    // TS-9: pragma present with a whitespace-only (effectively empty) reason after `--`.
    {
      code: `
        function decide(failed_count, x) {
          // eslint-disable-next-line ${RULE_ID} --   \n          return failed_count - x;
        }
      `,
      errors: [{ messageId: 'pragmaMissingReason' }],
    },
  ],
});
