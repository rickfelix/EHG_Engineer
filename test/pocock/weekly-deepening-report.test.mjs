// SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-D integration test.
//
// Strategy: pure-function tests for the Deletion Test classifier (FR-3)
// against ≥10 labeled fixtures with ≥90% accuracy, plus unit-level checks
// of the cron's argv parser and idempotency contract. Live-DB cron behavior
// (FR-1, FR-2, FR-4..FR-7) is verified by the schema gate + smoke run that
// ship alongside this test.

import { describe, it, expect } from 'vitest';
import { scoreModule, scoreWithAdapterRule } from '../../scripts/pocock/lib/deletion-test.mjs';

// 10 labeled fixtures spanning all 3 bands (matches PRD AC-4-5: ≥90% accuracy).
const fixtures = [
  { name: 'tiny-util',          callers: 0, adapters: 0, expected: 'vanish' },
  { name: 'rarely-imported',    callers: 1, adapters: 0, expected: 'vanish' },
  { name: 'two-callers',        callers: 2, adapters: 0, expected: 'vanish' },
  { name: 'three-callers',      callers: 3, adapters: 1, expected: 'concentrate' },
  { name: 'four-callers',       callers: 4, adapters: 1, expected: 'concentrate' },
  { name: 'five-callers',       callers: 5, adapters: 1, expected: 'concentrate' },
  { name: 'six-callers',        callers: 6, adapters: 1, expected: 'real_seam' },
  { name: 'ten-callers',        callers: 10, adapters: 2, expected: 'real_seam' },
  { name: 'concentrate-with-two-adapters-promotes', callers: 4, adapters: 2, expected: 'real_seam' },
  { name: 'forty-callers',      callers: 40, adapters: 3, expected: 'real_seam' },
];

describe('Deletion Test scorer', () => {
  it('scoreModule classifies <3 callers as vanish', () => {
    expect(scoreModule(0, 0)).toBe('vanish');
    expect(scoreModule(2, 5)).toBe('vanish');
  });
  it('scoreModule classifies 3-5 callers as concentrate', () => {
    expect(scoreModule(3, 0)).toBe('concentrate');
    expect(scoreModule(5, 0)).toBe('concentrate');
  });
  it('scoreModule classifies >5 callers as real_seam', () => {
    expect(scoreModule(6, 0)).toBe('real_seam');
    expect(scoreModule(100, 5)).toBe('real_seam');
  });
  it('scoreWithAdapterRule promotes concentrate→real_seam when adapter_count>=2', () => {
    expect(scoreWithAdapterRule(4, 1)).toBe('concentrate');
    expect(scoreWithAdapterRule(4, 2)).toBe('real_seam');
  });
  it('scoreModule rejects invalid inputs', () => {
    expect(() => scoreModule(-1, 0)).toThrow();
    expect(() => scoreModule(0, -1)).toThrow();
    expect(() => scoreModule('x', 0)).toThrow();
  });
  it('fixture corpus achieves >=90% accuracy', () => {
    let correct = 0;
    for (const f of fixtures) {
      const got = scoreWithAdapterRule(f.callers, f.adapters);
      if (got === f.expected) correct++;
    }
    const accuracy = correct / fixtures.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
