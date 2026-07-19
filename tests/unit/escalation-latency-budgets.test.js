import { describe, it, expect } from 'vitest';
import { ESCALATION_LATENCY_BUDGETS, budgetHours, isOverBudget } from '../../lib/org/escalation-latency-budgets.mjs';

// FW-3 Child F (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-G): value-neutral escalation-latency budgets SSOT.

describe('escalation-latency budgets (FW3 Child F)', () => {
  it('every stage has a finite positive hours budget + a note', () => {
    const stages = Object.keys(ESCALATION_LATENCY_BUDGETS);
    expect(stages.length).toBeGreaterThanOrEqual(4);
    for (const b of Object.values(ESCALATION_LATENCY_BUDGETS)) {
      expect(Number.isFinite(b.hours)).toBe(true);
      expect(b.hours).toBeGreaterThan(0);
      expect(typeof b.note).toBe('string');
    }
  });

  it('budgetHours returns the stage hours for known stages', () => {
    expect(budgetHours('framing_floor_attempt')).toBe(1);
    expect(budgetHours('self_escalation_to_fable')).toBe(4);
  });

  it('defaults mirror the sourcing SLA shape (72h CHAIRMAN_GATED / 168h OUTCOME_GATED)', () => {
    expect(budgetHours('chairman_escalation_delivery')).toBe(72);
    expect(budgetHours('outcome_gated')).toBe(168);
  });

  it('isOverBudget is false below and true above the budget', () => {
    const ceil = 72 * 3600 * 1000;
    expect(isOverBudget('chairman_escalation_delivery', ceil - 1)).toBe(false);
    expect(isOverBudget('chairman_escalation_delivery', ceil + 1)).toBe(true);
  });

  it('unknown stage / non-finite elapsed is graceful (null / false, never throws)', () => {
    expect(budgetHours('does_not_exist')).toBeNull();
    expect(isOverBudget('does_not_exist', 999999999999)).toBe(false);
    expect(isOverBudget('chairman_escalation_delivery', NaN)).toBe(false);
    expect(() => isOverBudget('x')).not.toThrow();
  });

  it('the config is frozen (immutable SSOT)', () => {
    expect(Object.isFrozen(ESCALATION_LATENCY_BUDGETS)).toBe(true);
    expect(Object.isFrozen(ESCALATION_LATENCY_BUDGETS.chairman_escalation_delivery)).toBe(true);
  });
});
