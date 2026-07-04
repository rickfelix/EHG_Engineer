/**
 * Tests for the tri-party verify-step contract validator (SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001 FR-3).
 * Enforces: below-threshold-with-no-committed_actions => INVALID; skipped-verify => INVALID;
 * N consecutive below-threshold => ESCALATE; missing metrics => INCONCLUSIVE (never INVALID).
 */

import { describe, it, expect } from 'vitest';
import {
  parseScore,
  classifyDimensions,
  validateScoreContract,
  hasBlockingViolation,
  DEFAULT_ESCALATE_AFTER_N,
} from '../../lib/fleet/verify-score-contract.mjs';

const scoreRow = (dims, extra = {}) => ({
  description: JSON.stringify({ overall: 'x', session: 's', dimensions: dims, ...extra }),
});

describe('parseScore', () => {
  it('parses a feedback row whose description is a JSON score', () => {
    const s = parseScore(scoreRow({ a: 4, b: 2 }, { committed_actions: [{ gap: 'g' }] }));
    expect(s.dimensions).toEqual({ a: 4, b: 2 });
    expect(s.committed_actions).toHaveLength(1);
  });
  it('parses an already-parsed object', () => {
    expect(parseScore({ dimensions: { a: 3 } }).dimensions).toEqual({ a: 3 });
  });
  it('returns null for a capture row (raw signal text, not a score)', () => {
    expect(parseScore({ description: 'FLEET-RETRO: worker X says Y' })).toBeNull();
    expect(parseScore('not json')).toBeNull();
    expect(parseScore(null)).toBeNull();
  });
  it('returns null when dimensions is missing or not a numeric map', () => {
    expect(parseScore({ description: JSON.stringify({ overall: 'x' }) })).toBeNull();
    expect(parseScore({ description: JSON.stringify({ dimensions: [1, 2] }) })).toBeNull();
  });
});

describe('classifyDimensions', () => {
  it('partitions below-threshold (≤2) and inconclusive (non-numeric)', () => {
    const r = classifyDimensions({ good: 4, weak: 2, bad: 1, unknown: null, missing: 'n/a' });
    expect(r.below.sort()).toEqual(['bad', 'weak']);
    expect(r.inconclusive.sort()).toEqual(['missing', 'unknown']);
  });
});

describe('validateScoreContract — Rule 1 (below-threshold needs committed_actions)', () => {
  it('INVALID when a below-threshold dim has zero committed_actions', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 4, b: 2 }, { committed_actions: [] }) });
    expect(r.valid).toBe(false);
    expect(r.belowThreshold).toEqual(['b']);
    expect(r.violations.join(' ')).toMatch(/no committed_actions/);
  });
  it('VALID when below-threshold dims all carry committed_actions (first cycle, no prior)', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 4, b: 2 }, { committed_actions: [{ gap: 'b', action: 'fix' }] }) });
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });
  it('VALID when nothing is below-threshold (no actions required)', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 4, b: 5 }, { committed_actions: [] }) });
    expect(r.valid).toBe(true);
  });
});

describe('validateScoreContract — Rule 2 (verify the prior cycle)', () => {
  const prior = scoreRow({ a: 2 }, { committed_actions: [{ gap: 'a', action: 'do x' }] });
  it('INVALID when the prior cycle committed actions but this score has empty prior_action_outcomes', () => {
    const r = validateScoreContract({
      current: scoreRow({ a: 4 }, { committed_actions: [] }),
      prior,
    });
    expect(r.valid).toBe(false);
    expect(r.violations.join(' ')).toMatch(/verify the prior cycle|verify step was skipped/i);
  });
  it('VALID when the prior cycle is verified (prior_action_outcomes populated)', () => {
    const r = validateScoreContract({
      current: scoreRow({ a: 4 }, { committed_actions: [], prior_action_outcomes: [{ action: 'do x', landed: true, moved: true }] }),
      prior,
    });
    expect(r.valid).toBe(true);
  });
  it('no Rule-2 violation on the first cycle (prior is null)', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 4 }, { committed_actions: [] }), prior: null });
    expect(r.valid).toBe(true);
  });
});

describe('validateScoreContract — Rule 3 (escalation) + INCONCLUSIVE', () => {
  it('ESCALATES after N consecutive below-threshold cycles despite committed actions', () => {
    const r = validateScoreContract({
      current: scoreRow({ a: 2 }, { committed_actions: [{ gap: 'a', action: 'x' }], prior_action_outcomes: [{ landed: true }] }),
      prior: scoreRow({ a: 2 }, { committed_actions: [{ gap: 'a' }] }),
      priorStreak: DEFAULT_ESCALATE_AFTER_N - 1,
    });
    expect(r.escalation.triggered).toBe(true);
    expect(r.escalation.streak).toBe(DEFAULT_ESCALATE_AFTER_N);
    expect(r.valid).toBe(false);
    expect(r.violations.join(' ')).toMatch(/ESCALATE/);
  });
  it('resets the streak to 0 when nothing is below-threshold', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 5 }, { committed_actions: [] }), priorStreak: 5 });
    expect(r.escalation.streak).toBe(0);
    expect(r.escalation.triggered).toBe(false);
  });
  it('INCONCLUSIVE (valid=null) when the current score row cannot be parsed', () => {
    const r = validateScoreContract({ current: { description: 'just a comment, no dimensions' } });
    expect(r.valid).toBeNull();
    expect(r.inconclusive).toBe(true);
    expect(r.violations.join(' ')).toMatch(/INCONCLUSIVE/);
  });
  it('treats a non-numeric dimension as inconclusive, NOT below-threshold (no false INVALID)', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 5, b: 'n/a' }, { committed_actions: [] }) });
    expect(r.belowThreshold).toEqual([]);
    expect(r.inconclusiveDims).toEqual(['b']);
    expect(r.valid).toBe(true);
  });
});

describe('hasBlockingViolation — scoped write-time refusal (SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-5, TS-6/7/8)', () => {
  it('TS-6: blocks on a Rule-1 INVALID (below-threshold + empty committed_actions)', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 4, b: 2 }, { committed_actions: [] }) });
    expect(hasBlockingViolation(r.violations)).toBe(true);
  });
  it('TS-7: does NOT block an escalation-eligible cycle that carries committed_actions (ESCALATE-only)', () => {
    const r = validateScoreContract({
      current: scoreRow({ a: 2 }, { committed_actions: [{ gap: 'a', action: 'x' }], prior_action_outcomes: [{ landed: true }] }),
      prior: scoreRow({ a: 2 }, { committed_actions: [{ gap: 'a' }] }),
      priorStreak: DEFAULT_ESCALATE_AFTER_N - 1,
    });
    expect(r.escalation.triggered).toBe(true);
    expect(r.valid).toBe(false); // conflated boolean — proves callers must NOT gate on `valid`
    expect(hasBlockingViolation(r.violations)).toBe(false); // but the scoped helper correctly lets it through
  });
  it('TS-8: does NOT block an all-inconclusive cycle (no signals available)', () => {
    const r = validateScoreContract({ current: scoreRow({}, { committed_actions: [] }) });
    expect(r.belowThreshold).toEqual([]);
    expect(hasBlockingViolation(r.violations)).toBe(false);
  });
  it('does not block a clean VALID row', () => {
    const r = validateScoreContract({ current: scoreRow({ a: 4, b: 5 }, { committed_actions: [] }) });
    expect(hasBlockingViolation(r.violations)).toBe(false);
  });
  it('is defensive against a non-array input', () => {
    expect(hasBlockingViolation(undefined)).toBe(false);
    expect(hasBlockingViolation(null)).toBe(false);
  });
});
