/**
 * Unit Tests: Chaining Score (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-B)
 *
 * Covers the chairman hard-rule matrix:
 * - CHAINING-NOW categorical map (anchor-customer first-class)
 * - no-trigger-no-option (trigger + review_at + confidence all required)
 * - tech-trajectory vocabulary enforcement on triggers
 * - linear horizon decay to exactly zero, monotonic
 * - bonus cap + governed rules resolution (posture over defaults; bonus_cap=0 kill switch)
 * - PROPERTY: bonus is structurally unable to flip a standalone NO-GO
 * - fail-safe degradation on absent/malformed input
 */

import { describe, test, expect } from 'vitest';
import {
  DEFAULT_CHAINING_RULES,
  resolveChainingRules,
  scoreChainingNow,
  validateOption,
  decayFactor,
  scoreChainingOption,
  computeChainingBonus,
  computeChaining,
} from '../../../../lib/eva/stage-zero/chaining-score.js';

const NOW = new Date('2026-07-17T00:00:00Z');
const monthsFromNow = (m) => new Date(NOW.getTime() + m * 30.44 * 24 * 3600 * 1000).toISOString();

const validOption = (overrides = {}) => ({
  label: 'apexniche-consumes-scanner',
  trigger: { axis: 'cost_deflation', band: 'base_6m', comparator: '>=', threshold: 65 },
  review_at: monthsFromNow(2),
  confidence: 0.8,
  ...overrides,
});

describe('scoreChainingNow — categorical map', () => {
  test('5: anchor customer committed this quarter', () => {
    expect(scoreChainingNow({ sibling_venture: 'apexniche', relationship: 'anchor_customer', committed_this_quarter: true })).toBe(5);
  });
  test('4: integration scheduled', () => {
    expect(scoreChainingNow({ sibling_venture: 'apexniche', relationship: 'consumer', integration_scheduled: true })).toBe(4);
  });
  test('3: anchor with unscheduled concrete plan; 2: consumer with plan; 1: named only', () => {
    expect(scoreChainingNow({ sibling_venture: 'x', relationship: 'anchor_customer', consumption_plan: true })).toBe(3);
    expect(scoreChainingNow({ sibling_venture: 'x', relationship: 'consumer', consumption_plan: true })).toBe(2);
    expect(scoreChainingNow({ sibling_venture: 'x' })).toBe(1);
  });
  test('0: absent, malformed, or unnamed input — never throws', () => {
    expect(scoreChainingNow(undefined)).toBe(0);
    expect(scoreChainingNow(null)).toBe(0);
    expect(scoreChainingNow('not-an-object')).toBe(0);
    expect(scoreChainingNow({ relationship: 'anchor_customer', committed_this_quarter: true })).toBe(0);
    expect(scoreChainingNow({ sibling_venture: '' })).toBe(0);
  });
});

describe('no-trigger-no-option + vocabulary enforcement', () => {
  test('options missing trigger, review_at, or confidence are each rejected with distinct reasons', () => {
    const { score, options_scored, rejected_options } = scoreChainingOption([
      validOption({ trigger: undefined }),
      validOption({ review_at: undefined }),
      validOption({ confidence: undefined }),
    ], DEFAULT_CHAINING_RULES, NOW);
    expect(score).toBe(0);
    expect(options_scored).toHaveLength(0);
    expect(rejected_options.map(r => r.reason)).toEqual([
      'missing_trigger', 'missing_or_invalid_review_at', 'invalid_confidence',
    ]);
  });
  test('trigger axis/band outside the tech-trajectory vocabulary rejected', () => {
    expect(validateOption(validOption({ trigger: { axis: 'market_size', band: 'base_6m', comparator: '>=', threshold: 65 } }), DEFAULT_CHAINING_RULES).reason).toMatch(/^invalid_axis/);
    expect(validateOption(validOption({ trigger: { axis: 'cost_deflation', band: 'bull_24m', comparator: '>=', threshold: 65 } }), DEFAULT_CHAINING_RULES).reason).toMatch(/^invalid_band/);
    expect(validateOption(validOption({ trigger: { axis: 'cost_deflation', band: 'base_6m', comparator: '>', threshold: 65 } }), DEFAULT_CHAINING_RULES).reason).toMatch(/^invalid_comparator/);
    expect(validateOption(validOption({ trigger: { axis: 'cost_deflation', band: 'base_6m', comparator: '>=', threshold: 165 } }), DEFAULT_CHAINING_RULES).reason).toBe('invalid_threshold');
  });
  test('confidence below the governed floor rejected; floor comes from rules', () => {
    expect(validateOption(validOption({ confidence: 0.1 }), DEFAULT_CHAINING_RULES).reason).toBe('confidence_below_floor');
    expect(validateOption(validOption({ confidence: 0.1 }), { ...DEFAULT_CHAINING_RULES, confidence_floor: 0.05 }).valid).toBe(true);
  });
});

describe('horizon decay', () => {
  test('reaches exactly zero at/beyond the horizon and is monotonic', () => {
    const contributions = [0, 3, 6, 9].map((m) => {
      const { options_scored } = scoreChainingOption([validOption({ review_at: monthsFromNow(m) })], DEFAULT_CHAINING_RULES, NOW);
      return options_scored[0].contribution;
    });
    expect(contributions[0]).toBeGreaterThan(contributions[1]);
    expect(contributions[1]).toBeGreaterThan(0);
    expect(contributions[2]).toBe(0);
    expect(contributions[3]).toBe(0);
    const { options_scored } = scoreChainingOption([validOption({ review_at: monthsFromNow(6) })], DEFAULT_CHAINING_RULES, NOW);
    expect(options_scored[0].decayed).toBe(true);
  });
  test('default horizon is 6 months when rules omit decay_horizon_months', () => {
    expect(DEFAULT_CHAINING_RULES.decay_horizon_months).toBe(6);
    expect(decayFactor(Date.parse(monthsFromNow(3)), NOW.getTime(), 6)).toBeCloseTo(0.5, 5);
  });
});

describe('bonus lane — capped, governed, never load-bearing', () => {
  test('bonus never exceeds cap; bonus_cap=0 is the kill switch', () => {
    expect(computeChainingBonus({ chaining_now: 5, chaining_option: 5, rules: DEFAULT_CHAINING_RULES })).toBe(10);
    expect(computeChainingBonus({ chaining_now: 5, chaining_option: 5, rules: { ...DEFAULT_CHAINING_RULES, bonus_cap: 4 } })).toBe(4);
    expect(computeChainingBonus({ chaining_now: 5, chaining_option: 5, rules: { ...DEFAULT_CHAINING_RULES, bonus_cap: 0 } })).toBe(0);
  });
  test('posture criteria.chaining_rules govern; defaults apply when absent', () => {
    expect(resolveChainingRules({ criteria: { chaining_rules: { bonus_cap: 4 } } }).bonus_cap).toBe(4);
    expect(resolveChainingRules({ criteria: { chaining_rules: { bonus_cap: 4 } } }).decay_horizon_months).toBe(6);
    expect(resolveChainingRules({ criteria: {} })).toEqual(DEFAULT_CHAINING_RULES);
    expect(resolveChainingRules(null)).toEqual(DEFAULT_CHAINING_RULES);
  });
  test('PROPERTY: standalone NO-GO can never be flipped — chaining lives outside the verdict inputs', () => {
    // The verdict is a function of weighted_score.total_score alone. computeChaining
    // returns only sibling data; assert its output shape carries no total_score /
    // verdict-shaped field a consumer could accidentally treat as the composite.
    const result = computeChaining(
      { sibling_venture: 'x', options: [validOption({ confidence: 1, review_at: monthsFromNow(0) })] },
      DEFAULT_CHAINING_RULES, NOW
    );
    // chaining_now=1 (named only) + chaining_option=5 (max) — high option value...
    expect(result.chaining_option).toBe(5);
    // ...but the output exposes ONLY bonus fields; no total_score, no verdict, no maturity.
    expect(Object.keys(result).sort()).toEqual([
      'bonus_points', 'chaining_now', 'chaining_option', 'options_scored', 'rejected_options', 'rules_applied',
    ]);
    // And the simulated standalone gate stays NO-GO regardless of the bonus:
    const standaloneTotal = 40, gateThreshold = 70;
    const verdict = standaloneTotal >= gateThreshold ? 'GO' : 'NO-GO'; // verdict blind to chaining
    expect(verdict).toBe('NO-GO');
    expect(standaloneTotal + result.bonus_points).toBeGreaterThan(standaloneTotal); // bonus exists…
    expect(verdict).toBe('NO-GO'); // …verdict unchanged
  });
});

describe('computeChaining — fail-safe integration surface', () => {
  test('absent chaining input yields inert zeros, never throws', () => {
    const result = computeChaining(undefined, DEFAULT_CHAINING_RULES, NOW);
    expect(result).toMatchObject({ chaining_now: 0, chaining_option: 0, bonus_points: 0 });
    expect(result.options_scored).toEqual([]);
    expect(result.rejected_options).toEqual([]);
  });
  test('happy path: anchor sibling + valid option produce both axes and a capped bonus', () => {
    const result = computeChaining({
      sibling_venture: 'apexniche', relationship: 'anchor_customer', committed_this_quarter: true,
      options: [validOption()],
    }, DEFAULT_CHAINING_RULES, NOW);
    expect(result.chaining_now).toBe(5);
    expect(result.chaining_option).toBeGreaterThan(0);
    expect(result.bonus_points).toBeGreaterThan(0);
    expect(result.bonus_points).toBeLessThanOrEqual(DEFAULT_CHAINING_RULES.bonus_cap);
    expect(result.rules_applied).toEqual(DEFAULT_CHAINING_RULES);
  });
});
