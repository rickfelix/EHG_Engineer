import { describe, it, expect } from 'vitest';
import { assertParity, summarizeReplayResults, ParityViolation } from './parity-asserter.mjs';

describe('assertParity', () => {
  it('passes when v1.passed === v2.passed (both true)', () => {
    const r = assertParity({
      v1Result: { passed: true },
      v2Result: { passed: true },
      fixturePath: 'fix-001.json',
    });
    expect(r.ok).toBe(true);
  });

  it('passes when v1.passed === v2.passed (both false)', () => {
    const r = assertParity({
      v1Result: { passed: false },
      v2Result: { passed: false },
      fixturePath: 'fix-002.json',
    });
    expect(r.ok).toBe(true);
  });

  it('throws ParityViolation when v1 passed and v2 failed', () => {
    expect(() => assertParity({
      v1Result: { passed: true },
      v2Result: { passed: false },
      fixturePath: 'fix-003.json',
    })).toThrow(ParityViolation);
  });

  it('attaches failure details on the thrown error', () => {
    try {
      assertParity({
        v1Result: { passed: false },
        v2Result: { passed: true },
        fixturePath: 'fix-004.json',
      });
    } catch (err) {
      expect(err.details.fixturePath).toBe('fix-004.json');
      expect(err.details.v1Result.passed).toBe(false);
      expect(err.details.v2Result.passed).toBe(true);
    }
  });
});

describe('summarizeReplayResults', () => {
  it('reports parity_holds=true when all results are ok', () => {
    const s = summarizeReplayResults([
      { ok: true, fixturePath: 'a' },
      { ok: true, fixturePath: 'b' },
    ]);
    expect(s).toEqual({ total: 2, passed: 2, failed: 0, parity_holds: true, failures: [] });
  });

  it('lists failing fixture paths when parity is broken', () => {
    const s = summarizeReplayResults([
      { ok: true, fixturePath: 'a' },
      { ok: false, fixturePath: 'b' },
      { ok: false, fixturePath: 'c' },
    ]);
    expect(s.parity_holds).toBe(false);
    expect(s.failed).toBe(2);
    expect(s.failures).toEqual(['b', 'c']);
  });
});
