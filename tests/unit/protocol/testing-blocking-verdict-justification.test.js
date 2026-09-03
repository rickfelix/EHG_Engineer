// A BLOCKING TESTING VERDICT MUST SAY WHY IT BLOCKS.
//
// Measured before this fix: of 140 TESTING BLOCKED rows, ZERO carried a justification and only 3
// carried a summary. Seven months of silence (since cb5cbe11b56c, 2026-01-23), invisible because a
// blocking verdict blocks either way — the gate outcome is identical whether or not the row
// explains itself, so nothing ever forced the question. It surfaced only when an empty-evidence
// guard started refusing content-free blocking verdicts and the runner died instead of writing one.
//
// TWO THINGS THESE TESTS DELIBERATELY PIN:
//  1. Each blocking branch states its OWN reason — not a generic string. A branch knows why it
//     blocked; the defect was never computing that, it was never recording it.
//  2. The invariant THROWS rather than synthesizing a placeholder. A generated "0/0 tests passed"
//     would satisfy every downstream text check while stating nothing — strictly worse than an
//     empty field, because it converts a visible gap into an invisible one and would silently
//     disable the guard that exposed this. That trap is asserted explicitly below.

import { describe, it, expect } from 'vitest';
import { generateVerdict, assertBlockingVerdictExplained } from '../../../lib/sub-agents/testing/phases/phase5-verdict.js';

const base = (findings = {}, over = {}) => ({
  critical_issues: [],
  warnings: [],
  findings: { phase3_execution: { tests_executed: 0, failed_tests: 0 }, ...findings },
  ...over,
});

describe('every blocking branch records its own reason', () => {
  it('critical issues: names the issues, not just their count', () => {
    const r = generateVerdict(base({}, { critical_issues: [{ issue: 'schema drift in migrations' }] }), 'prospective');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.justification).toMatch(/schema drift in migrations/);
  });

  it('sub-threshold pass rate: names the rate and the counts', () => {
    const r = generateVerdict(base({ phase3_execution: { tests_executed: 10, tests_passed: 4, failed_tests: 6 } }), 'prospective');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.justification).toMatch(/40\.0% is below the 95% threshold/);
    expect(r.justification).toMatch(/4\/10 passed, 6 failed/);
  });

  it('execution error: carries the underlying error text', () => {
    const r = generateVerdict(base({ phase3_execution: { tests_executed: 0, failed_tests: 0, error: 'playwright binary missing' } }), 'prospective');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.justification).toMatch(/playwright binary missing/);
  });

  it('prospective zero-run: says a real run is required', () => {
    const r = generateVerdict(base(), 'prospective');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.justification).toMatch(/tests_executed is 0/);
  });

  it('retrospective with no evidence at all: says there is nothing to validate against', () => {
    const r = generateVerdict(base({ phase3_execution: { tests_executed: 0, tests_passed: 0, failed_tests: 0 }, phase4_evidence: { test_files_found: 0 } }), 'retrospective');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.justification).toMatch(/no test evidence at all/);
  });

  it('each branch produces a DISTINCT justification — not one boilerplate string', () => {
    // A shared generic message would satisfy the invariant while telling a reader nothing about
    // which branch fired, which is the failure this whole fix exists to end.
    const js = [
      generateVerdict(base({}, { critical_issues: [{ issue: 'x' }] }), 'prospective').justification,
      generateVerdict(base({ phase3_execution: { tests_executed: 10, tests_passed: 4, failed_tests: 6 } }), 'prospective').justification,
      generateVerdict(base({ phase3_execution: { tests_executed: 0, failed_tests: 0, error: 'boom' } }), 'prospective').justification,
      generateVerdict(base(), 'prospective').justification,
    ];
    expect(new Set(js).size).toBe(js.length);
  });
});

describe('THE STRUCTURAL INVARIANT — this is the durable half', () => {
  // Driven against the exported invariant directly. Testing it only through generateVerdict would
  // exercise it solely via branches that already satisfy it — an invariant that can never be
  // observed failing, which is the same never-goes-red problem it exists to prevent.
  it.each([['BLOCKED'], ['FAIL'], ['FAILED']])('THROWS for %s with no justification', (verdict) => {
    expect(() => assertBlockingVerdictExplained(verdict, null)).toThrow(/no justification/);
  });

  it.each([[null], [undefined], [''], ['   '], ['\n\t ']])('treats %j as no justification', (j) => {
    expect(() => assertBlockingVerdictExplained('BLOCKED', j)).toThrow(/no justification/);
  });

  it('accepts a blocking verdict that states a real reason', () => {
    expect(() => assertBlockingVerdictExplained('BLOCKED', '3 of 10 tests failed on auth redirect')).not.toThrow();
  });

  it('a passing verdict is never required to justify itself', () => {
    for (const v of ['PASS', 'CONDITIONAL_PASS', 'WARNING']) {
      expect(() => assertBlockingVerdictExplained(v, null)).not.toThrow();
    }
  });

  it('is actually wired into generateVerdict, not merely exported', () => {
    // Without this, the invariant could be defined, tested, and never called — the dead-by-
    // construction shape. A blocking result whose branch sets a justification must still return
    // one, proving the call site is live.
    const r = generateVerdict(base(), 'prospective');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.justification).toBeTruthy();
  });

  it('does NOT synthesize a placeholder — the trap that would disable the guard', () => {
    // "0/0 tests passed" is what results.summary computes on the zero-run branch. If the fix had
    // assigned that to justification it would satisfy every text check while stating nothing.
    // Assert the real justification is not that string.
    const r = generateVerdict(base(), 'prospective');
    expect(r.justification).not.toBe('0/0 tests passed');
    expect(r.justification).not.toMatch(/^\d+\/\d+ tests passed$/);
  });

  it('summary remains available separately and is unchanged', () => {
    // The invariant governs justification only; summary keeps its existing meaning so nothing
    // downstream that reads it changes behaviour.
    const r = generateVerdict(base({ phase3_execution: { tests_executed: 3, tests_passed: 3, failed_tests: 0 } }), 'prospective');
    expect(r.summary).toBe('3/3 tests passed');
  });
});

describe('non-blocking verdicts are untouched', () => {
  it('e2e-not-applicable still PASSes with its own justification', () => {
    const r = generateVerdict(base({ phase3_execution: { tests_executed: 0, failed_tests: 0, e2e_not_applicable: true, reason: 'no playwright in target repo' } }), 'prospective');
    expect(r.verdict).toBe('PASS');
    expect(r.justification).toMatch(/no playwright in target repo/);
  });

  it('pre-implementation PRD-strategy branch is unaffected by the invariant', () => {
    const results = base();
    results.findings.prd_test_strategy = { pre_implementation: true, adequate: true, reason: 'ok', gaps: [] };
    const r = generateVerdict(results, 'prospective');
    expect(r.verdict).toBe('PASS');
  });

  it('high-pass-rate retrospective CONDITIONAL_PASS keeps its justification', () => {
    const r = generateVerdict(base({ phase3_execution: { tests_executed: 100, tests_passed: 96, failed_tests: 4 } }), 'retrospective');
    expect(r.verdict).toBe('CONDITIONAL_PASS');
    expect(r.justification).toMatch(/High pass rate/);
  });
});
