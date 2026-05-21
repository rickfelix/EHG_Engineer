/**
 * QF-20260521-729 (feedback ca443489): issue-knowledge-base.js consumers
 * (getSolution .sort, recordOccurrence .find, calculateSuccessRate .reduce)
 * crashed when proven_solutions JSONB was a non-array — a JSON-encoded string
 * (double-encoded array) or a foreign-shaped object. The `!x || x.length===0`
 * guard let both through (object .length undefined; string .length nonzero).
 *
 * These tests pin the normalizer (toSolutionArray) and assert calculateSuccessRate
 * no longer throws on the live non-array shapes, plus a static guard that the
 * three consumer sites route through the normalizer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toSolutionArray, IssueKnowledgeBase } from '../../lib/learning/issue-knowledge-base.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');

describe('toSolutionArray — proven_solutions normalization', () => {
  it('passes a real array through unchanged (identity)', () => {
    const arr = [{ solution: 'x', times_applied: 2, times_successful: 1 }];
    expect(toSolutionArray(arr)).toBe(arr);
  });

  it('parses a double-encoded JSON-string array (15 live string rows)', () => {
    const raw = JSON.stringify([{ solution: 'do the thing', times_applied: 50, times_successful: 40 }]);
    const out = toSolutionArray(raw);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0].times_applied).toBe(50);
  });

  it('parses a double-encoded JSON array-of-strings', () => {
    const raw = JSON.stringify(['Add auto-generation step', 'Update gate messages']);
    expect(toSolutionArray(raw)).toEqual(['Add auto-generation step', 'Update gate messages']);
  });

  it('returns [] for a foreign-shaped object (5 live object rows, e.g. {steps:[...]})', () => {
    expect(toSolutionArray({ steps: ['a', 'b'] })).toEqual([]);
    expect(toSolutionArray({ solutions: ['x'] })).toEqual([]);
  });

  it('returns [] for a non-JSON plain string, null, undefined, and number', () => {
    expect(toSolutionArray('needs investigation')).toEqual([]);
    expect(toSolutionArray(null)).toEqual([]);
    expect(toSolutionArray(undefined)).toEqual([]);
    expect(toSolutionArray(42)).toEqual([]);
  });

  it('returns [] for a JSON-string that decodes to a non-array', () => {
    expect(toSolutionArray('{"a":1}')).toEqual([]);
    expect(toSolutionArray('"just a string"')).toEqual([]);
  });
});

describe('calculateSuccessRate — no crash on non-array proven_solutions (the reported bug)', () => {
  const kb = new IssueKnowledgeBase();

  it('object proven_solutions returns 0 instead of throwing "reduce is not a function"', () => {
    expect(() => kb.calculateSuccessRate({ proven_solutions: { steps: ['a'] } })).not.toThrow();
    expect(kb.calculateSuccessRate({ proven_solutions: { steps: ['a'] } })).toBe(0);
  });

  it('plain-string proven_solutions returns 0 instead of throwing', () => {
    expect(() => kb.calculateSuccessRate({ proven_solutions: 'investigate' })).not.toThrow();
    expect(kb.calculateSuccessRate({ proven_solutions: 'investigate' })).toBe(0);
  });

  it('null / undefined / missing proven_solutions returns 0', () => {
    expect(kb.calculateSuccessRate({ proven_solutions: null })).toBe(0);
    expect(kb.calculateSuccessRate({})).toBe(0);
  });

  it('double-encoded JSON-string array is parsed and rate computed', () => {
    const raw = JSON.stringify([
      { solution: 'a', times_applied: 4, times_successful: 3 },
      { solution: 'b', times_applied: 6, times_successful: 3 }
    ]);
    // (3+3) successful / (4+6) applied = 0.6
    expect(kb.calculateSuccessRate({ proven_solutions: raw })).toBeCloseTo(0.6, 5);
  });

  it('real array still computes correctly (no regression)', () => {
    const arr = [{ solution: 'a', times_applied: 10, times_successful: 5 }];
    expect(kb.calculateSuccessRate({ proven_solutions: arr })).toBeCloseTo(0.5, 5);
  });

  it('array-of-strings (recovered) does not crash and yields 0 applied', () => {
    expect(() => kb.calculateSuccessRate({ proven_solutions: ['x', 'y'] })).not.toThrow();
    expect(kb.calculateSuccessRate({ proven_solutions: ['x', 'y'] })).toBe(0);
  });
});

describe('static guard — the three consumer sites route through toSolutionArray', () => {
  const src = readFileSync(
    resolve(REPO_ROOT, 'lib/learning/issue-knowledge-base.js'),
    'utf-8'
  );

  it('exports the toSolutionArray normalizer', () => {
    expect(src).toMatch(/export function toSolutionArray\(/);
  });

  it('getSolution, recordOccurrence and calculateSuccessRate all call toSolutionArray', () => {
    const calls = src.match(/toSolutionArray\(/g) || [];
    // 1 definition + 3 consumer call sites = 4 occurrences minimum
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it('no consumer still calls .reduce/.sort/.find directly on pattern.proven_solutions', () => {
    expect(src).not.toMatch(/pattern\.proven_solutions\.(reduce|sort|find)\(/);
  });
});
