/**
 * vision-fidelity policy + bypass-rubric tests.
 * Covers FR-3 (severity tiering) and FR-4 (VISION_DELIBERATE_DEVIATION bypass).
 *
 * These tests are pure-functional — no LLM, no DB. They guard the policy seam
 * shared between the sub-agent (PR-2) and the PLAN-TO-LEAD gate (PR-3).
 */
import { describe, it, expect } from 'vitest';
import { classifyOutcome, computeCoveragePct, getPolicyForSdType } from '../severity-policy.js';
import { validateBypassReason, LEGITIMATE_REASONS } from '../../../../scripts/modules/handoff/bypass-rubric.js';

describe('severity-tier policy (FR-3)', () => {
  it('feature with critical_missing>2 → FAIL', () => {
    const o = classifyOutcome({ sdType: 'feature', criticalMissing: 3, nonCriticalMissing: 0 });
    expect(o.verdict).toBe('FAIL');
    expect(o.passed).toBe(false);
    expect(o.mode).toBe('block');
  });

  it('feature with mixed (critical=2, non_critical=6) → FAIL via mixed threshold', () => {
    const o = classifyOutcome({ sdType: 'feature', criticalMissing: 2, nonCriticalMissing: 6 });
    expect(o.verdict).toBe('FAIL');
    expect(o.passed).toBe(false);
  });

  it('feature with critical_missing=2, non_critical=0 → CONDITIONAL_PASS (under threshold)', () => {
    const o = classifyOutcome({ sdType: 'feature', criticalMissing: 2, nonCriticalMissing: 0 });
    expect(o.verdict).toBe('CONDITIONAL_PASS');
    expect(o.passed).toBe(true);
  });

  it('feature with no missing → PASS', () => {
    const o = classifyOutcome({ sdType: 'feature', criticalMissing: 0, nonCriticalMissing: 0 });
    expect(o.verdict).toBe('PASS');
    expect(o.passed).toBe(true);
  });

  it('database with critical_missing=2 → FAIL (stricter threshold of 1)', () => {
    const o = classifyOutcome({ sdType: 'database', criticalMissing: 2, nonCriticalMissing: 0 });
    expect(o.verdict).toBe('FAIL');
  });

  it('security with critical_missing=2 → FAIL (stricter threshold of 1)', () => {
    const o = classifyOutcome({ sdType: 'security', criticalMissing: 2, nonCriticalMissing: 0 });
    expect(o.verdict).toBe('FAIL');
  });

  it('infrastructure with high counts → never blocks (warn-only)', () => {
    const o = classifyOutcome({ sdType: 'infrastructure', criticalMissing: 99, nonCriticalMissing: 99 });
    expect(o.passed).toBe(true);
    expect(o.verdict).toBe('WARNING');
    expect(o.mode).toBe('warn');
  });

  it('infrastructure with no missing → PASS', () => {
    const o = classifyOutcome({ sdType: 'infrastructure', criticalMissing: 0, nonCriticalMissing: 0 });
    expect(o.verdict).toBe('PASS');
    expect(o.passed).toBe(true);
  });

  it('documentation → skipped with reason', () => {
    const o = classifyOutcome({ sdType: 'documentation' });
    expect(o.skipped).toBe(true);
    expect(o.passed).toBe(true);
    expect(o.reason).toMatch(/does not produce UI/);
  });

  it('refactor → skipped', () => {
    const o = classifyOutcome({ sdType: 'refactor' });
    expect(o.skipped).toBe(true);
    expect(o.passed).toBe(true);
  });

  it('unknown sd_type → DEFAULT_POLICY (block, threshold=2)', () => {
    expect(getPolicyForSdType('unknown_kind').mode).toBe('block');
    const o = classifyOutcome({ sdType: 'unknown_kind', criticalMissing: 3 });
    expect(o.verdict).toBe('FAIL');
  });

  it('coverage_pct rounds to 3 decimals; null on zero total', () => {
    expect(computeCoveragePct(1, 3)).toBe(0.333);
    expect(computeCoveragePct(9, 9)).toBe(1);
    expect(computeCoveragePct(0, 0)).toBe(null);
    expect(computeCoveragePct(1, null)).toBe(null);
  });
});

describe('bypass-rubric VISION_DELIBERATE_DEVIATION (FR-4)', () => {
  it('rule is registered in LEGITIMATE_REASONS', () => {
    const rule = LEGITIMATE_REASONS.find(r => r.id === 'VISION_DELIBERATE_DEVIATION');
    expect(rule).toBeTruthy();
    expect(rule.description).toMatch(/wireframe|deviation/i);
  });

  it('matches the canonical chairman-deviation reason', () => {
    const r = validateBypassReason('Wireframe shows post-backend state but this PR is pre-backend; backend lands in SD-FOLLOWUP-001');
    expect(r.allowed).toBe(true);
    expect(r.matchedRule).toBe('VISION_DELIBERATE_DEVIATION');
  });

  it('matches "differs by design" phrasing', () => {
    const r = validateBypassReason('Wireframe differs by design from this PR — see SD-VISION-FOLLOWUP-001');
    expect(r.allowed).toBe(true);
    expect(r.matchedRule).toBe('VISION_DELIBERATE_DEVIATION');
  });

  it('matches "intentional deviation" phrasing', () => {
    const r = validateBypassReason('Vision intentional deviation: this PR ships a follow-up SD with the rest');
    expect(r.allowed).toBe(true);
    expect(r.matchedRule).toBe('VISION_DELIBERATE_DEVIATION');
  });

  it('still rejects illegitimate reasons (precedence preserved)', () => {
    const r = validateBypassReason('Skip vision check, gate too strict, taking too long');
    expect(r.allowed).toBe(false);
    expect(r.category).toBe('ILLEGITIMATE');
  });
});
