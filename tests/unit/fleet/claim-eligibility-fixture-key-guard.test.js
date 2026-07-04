/**
 * Regression test for QF-20260703-773: TEST_FIXTURE_KEY_RE required an SD- prefix
 * (/^SD-(DEMO|TEST)\b/), so a bare TEST- or DEMO- prefixed key (e.g. TEST-F3-RACE-* rows
 * inserted directly by tests/integration/migrations/trigger-audit-f3-race-fix.db.test.js)
 * passed classifyDispatchIneligibility as eligible and got dispatched to real fleet workers
 * when that test's afterEach cleanup was interrupted. The SD- prefix must be optional.
 */
import { describe, it, expect } from 'vitest';

const { classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');

describe('QF-20260703-773: bare TEST-/DEMO- fixture keys are ineligible', () => {
  it('rejects a bare TEST- prefixed key (the leaked TEST-F3-RACE-* specimen)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'TEST-F3-RACE-1783127205641-bl0', status: 'draft' }))
      .toBe('test_fixture_key');
  });

  it('rejects a bare DEMO- prefixed key', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'DEMO-RACE-CONDITION-XYZ', status: 'draft' }))
      .toBe('test_fixture_key');
  });

  it('still rejects the original SD-DEMO-/SD-TEST- prefixed form', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-TEST-001', status: 'draft' })).toBe('test_fixture_key');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-DEMO-RACE-001', status: 'draft' })).toBe('test_fixture_key');
  });

  it('does not false-positive on a real SD that merely starts with those letters', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-TESTABLE-REAL-001', status: 'draft' })).toBeNull();
    expect(classifyDispatchIneligibility({ sd_key: 'SD-DEMONSTRATE-VALUE-001', status: 'draft' })).toBeNull();
  });

  it('does not false-positive on a real SD-LEO-*/SD-FDBK-* key', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-INFRA-009-LEAF-IMPROVEMENT-001', status: 'draft' })).toBeNull();
  });
});
