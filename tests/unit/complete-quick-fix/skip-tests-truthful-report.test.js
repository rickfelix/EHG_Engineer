/**
 * QF-20260911-021 — Check 3 must not report a test verdict it did not take.
 *
 * Under --skip-tests, testsPass is a trusted default/override, not a measured result.
 * Before this fix, Check 3 fell through to "Tests confirmed passing — Both unit and
 * E2E smoke tests verified" regardless. It must now report the skip truthfully.
 */

import { describe, it, expect } from 'vitest';
import { verifyTestCoverage } from '../../../lib/quickfix-self-verifier.js';

describe('verifyTestCoverage (Check 3) — testsSkipped', () => {
  it('reports "skipped — trusted CI", never "confirmed passing", when testsSkipped is true', async () => {
    const result = await verifyTestCoverage({}, {
      testsPass: true,
      testsSkipped: true,
      testsVerifiedRecently: true,
    });

    expect(result.passed).toBe(true);
    expect(result.message).not.toMatch(/confirmed passing/i);
    expect(result.message).toMatch(/skipped/i);
    expect(result.details).toMatch(/no unit or E2E suite executed/i);
  });

  it('still reports "confirmed passing" when tests were NOT skipped (no regression)', async () => {
    const result = await verifyTestCoverage({}, {
      testsPass: true,
      testsSkipped: false,
      testsVerifiedRecently: true,
    });

    expect(result.passed).toBe(true);
    expect(result.message).toBe('Tests confirmed passing');
  });
});
