/**
 * Unit tests for lib/eva/lifecycle/thesis-kill-evaluator.
 *
 * SD-LEO-INFRA-KILL-GATE-TIER-001
 *
 * Covers:
 *   - fired kill (below-threshold observed value at stage_by)
 *   - NO-DATA hold (no resolvable gauge)
 *   - clear-pass (on-survive-side observed value)
 *   - no-criteria control (empty/null kill_criteria)
 *   - not-yet-due (stage_by ahead of toStage) — not evaluated at all
 *   - gauge-coercion landmine: null/''/[]/undefined/unknown-metric all HOLD, never FIRED/CLEAR
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateThesisKillCriteria,
  classifyVerdict,
  toStrictObservedValue,
  defaultResolveObservedValue,
  VERDICT,
} from '../../../../lib/eva/lifecycle/thesis-kill-evaluator.js';

const criterion = (overrides = {}) => ({
  id: 'kill-demand-signals',
  metric: 'demand_test_qualified_signups',
  comparator: 'lt',
  threshold: 10,
  stage_by: 12,
  description: 'test criterion',
  ...overrides,
});

describe('toStrictObservedValue (gauge-coercion landmine)', () => {
  it('passes through a genuine finite number, including literal 0', () => {
    expect(toStrictObservedValue(0)).toBe(0);
    expect(toStrictObservedValue(8)).toBe(8);
    expect(toStrictObservedValue(-3.5)).toBe(-3.5);
  });

  it('coerces null, empty string, empty array, undefined, and NaN to undefined (never to 0)', () => {
    expect(toStrictObservedValue(null)).toBeUndefined();
    expect(toStrictObservedValue('')).toBeUndefined();
    expect(toStrictObservedValue([])).toBeUndefined();
    expect(toStrictObservedValue(undefined)).toBeUndefined();
    expect(toStrictObservedValue(NaN)).toBeUndefined();
  });

  it('coerces a non-numeric object to undefined', () => {
    expect(toStrictObservedValue({})).toBeUndefined();
    expect(toStrictObservedValue('not-a-number')).toBeUndefined();
  });
});

describe('classifyVerdict', () => {
  it('maps unobservable:true to HOLD', () => {
    const raw = { killed: true, unobservable: true, criterionId: 'k1', observed: NaN, threshold: 10, comparator: 'lt' };
    const v = classifyVerdict(raw, criterion());
    expect(v.verdict).toBe(VERDICT.HOLD);
  });

  it('maps killed:true (unobservable absent) to FIRED, naming the criterion', () => {
    const raw = { killed: true, criterionId: 'kill-demand-signals', observed: 8, threshold: 10, comparator: 'lt' };
    const v = classifyVerdict(raw, criterion());
    expect(v.verdict).toBe(VERDICT.FIRED);
    expect(v.criterionId).toBe('kill-demand-signals');
    expect(v.metric).toBe('demand_test_qualified_signups');
  });

  it('maps killed:false to CLEAR', () => {
    const raw = { killed: false, criterionId: 'k1', observed: 15, threshold: 10, comparator: 'lt' };
    const v = classifyVerdict(raw, criterion());
    expect(v.verdict).toBe(VERDICT.CLEAR);
  });
});

describe('defaultResolveObservedValue', () => {
  it('always returns undefined (no gauge source registered for any metric yet)', () => {
    expect(defaultResolveObservedValue('demand_test_qualified_signups')).toBeUndefined();
    expect(defaultResolveObservedValue('anything')).toBeUndefined();
  });
});

describe('evaluateThesisKillCriteria', () => {
  it('FIRED: below-threshold observed value at stage_by', async () => {
    const result = await evaluateThesisKillCriteria({
      killCriteria: [criterion({ stage_by: 12 })],
      toStage: 12,
      resolveObservedValue: () => 8,
    });
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].criterionId).toBe('kill-demand-signals');
    expect(result.held).toHaveLength(0);
  });

  it('HOLD: gauge resolver returns undefined (no data)', async () => {
    const result = await evaluateThesisKillCriteria({
      killCriteria: [criterion({ stage_by: 12 })],
      toStage: 12,
      resolveObservedValue: () => undefined,
    });
    expect(result.held).toHaveLength(1);
    expect(result.fired).toHaveLength(0);
  });

  it('CLEAR: on-survive-side observed value', async () => {
    const result = await evaluateThesisKillCriteria({
      killCriteria: [criterion({ stage_by: 12, comparator: 'lt', threshold: 10 })],
      toStage: 12,
      resolveObservedValue: () => 25,
    });
    expect(result.clear).toHaveLength(1);
    expect(result.fired).toHaveLength(0);
    expect(result.held).toHaveLength(0);
  });

  it('no-criteria control: null kill_criteria evaluates nothing', async () => {
    const result = await evaluateThesisKillCriteria({ killCriteria: null, toStage: 12 });
    expect(result.evaluatedCount).toBe(0);
    expect(result.fired).toHaveLength(0);
  });

  it('no-criteria control: empty array evaluates nothing', async () => {
    const result = await evaluateThesisKillCriteria({ killCriteria: [], toStage: 12 });
    expect(result.evaluatedCount).toBe(0);
  });

  it('not-yet-due: a criterion whose stage_by is ahead of toStage is not evaluated at all', async () => {
    const result = await evaluateThesisKillCriteria({
      killCriteria: [criterion({ stage_by: 20 })],
      toStage: 12,
      resolveObservedValue: () => 8, // would FIRE if evaluated — must not be evaluated
    });
    expect(result.evaluatedCount).toBe(0);
    expect(result.fired).toHaveLength(0);
    expect(result.held).toHaveLength(0);
  });

  it('evaluates only the criteria whose stage_by <= toStage among multiple', async () => {
    const criteria = [
      criterion({ id: 'a', stage_by: 8 }),
      criterion({ id: 'b', stage_by: 12 }),
      criterion({ id: 'c', stage_by: 20 }),
    ];
    const result = await evaluateThesisKillCriteria({ killCriteria: criteria, toStage: 12, resolveObservedValue: () => 25 });
    expect(result.evaluatedCount).toBe(2);
    expect(result.verdicts.map((v) => v.criterionId).sort()).toEqual(['a', 'b']);
  });

  it('gauge-coercion landmine: null/empty-string/empty-array/undefined/unknown-metric all HOLD, never FIRED or CLEAR', async () => {
    const rawValues = [null, '', [], undefined, 'unknown-metric-string'];
    for (const rawValue of rawValues) {
      const result = await evaluateThesisKillCriteria({
        killCriteria: [criterion({ stage_by: 12, comparator: 'lt', threshold: 10 })],
        toStage: 12,
        resolveObservedValue: () => rawValue,
      });
      expect(result.held, `rawValue=${JSON.stringify(rawValue)} should HOLD`).toHaveLength(1);
      expect(result.fired, `rawValue=${JSON.stringify(rawValue)} should not FIRE`).toHaveLength(0);
      expect(result.clear, `rawValue=${JSON.stringify(rawValue)} should not CLEAR`).toHaveLength(0);
    }
  });

  it('a literal 0 observed value is a real observation, not treated as no-data', async () => {
    const result = await evaluateThesisKillCriteria({
      killCriteria: [criterion({ stage_by: 12, comparator: 'lt', threshold: 10 })],
      toStage: 12,
      resolveObservedValue: () => 0,
    });
    expect(result.fired).toHaveLength(1); // 0 < 10 -> FIRED
    expect(result.held).toHaveLength(0);
  });
});
