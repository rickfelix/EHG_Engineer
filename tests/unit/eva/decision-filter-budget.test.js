/**
 * Decision Filter Engine - Budget Exceeded Trigger Tests
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-C
 *
 * Tests the budget_exceeded trigger type added to the DFE.
 */

import { describe, it, expect } from 'vitest';
import { evaluateDecision, TRIGGER_TYPES } from '../../../lib/eva/decision-filter-engine.js';

describe('Decision Filter Engine - budget_exceeded trigger', () => {
  it('should include budget_exceeded in TRIGGER_TYPES', () => {
    expect(TRIGGER_TYPES).toContain('budget_exceeded');
    // Should come after cost_threshold and before new_tech_vendor
    const costIdx = TRIGGER_TYPES.indexOf('cost_threshold');
    const budgetIdx = TRIGGER_TYPES.indexOf('budget_exceeded');
    const techIdx = TRIGGER_TYPES.indexOf('new_tech_vendor');
    expect(budgetIdx).toBeGreaterThan(costIdx);
    expect(budgetIdx).toBeLessThan(techIdx);
  });

  it('should fire HIGH trigger when over budget', () => {
    const result = evaluateDecision({
      budgetStatus: {
        is_over_budget: true,
        usage_percentage: 115,
        tokens_used: 575000,
        budget_limit: 500000,
      },
    });

    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(budgetTrigger).toBeTruthy();
    expect(budgetTrigger.severity).toBe('HIGH');
    expect(budgetTrigger.details.tokensUsed).toBe(575000);
    expect(budgetTrigger.details.budgetLimit).toBe(500000);
    expect(result.auto_proceed).toBe(false);
    expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
  });

  it('should fire MEDIUM trigger at 80% usage', () => {
    const result = evaluateDecision({
      budgetStatus: {
        is_over_budget: false,
        usage_percentage: 85,
        tokens_used: 425000,
        budget_limit: 500000,
      },
    });

    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(budgetTrigger).toBeTruthy();
    expect(budgetTrigger.severity).toBe('MEDIUM');
    expect(budgetTrigger.message).toContain('85%');
  });

  it('should not fire trigger when under 80%', () => {
    const result = evaluateDecision({
      budgetStatus: {
        is_over_budget: false,
        usage_percentage: 50,
        tokens_used: 250000,
        budget_limit: 500000,
      },
    });

    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(budgetTrigger).toBeUndefined();
    expect(result.auto_proceed).toBe(true);
  });

  it('should not fire trigger when budgetStatus is null', () => {
    const result = evaluateDecision({
      budgetStatus: null,
    });

    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(budgetTrigger).toBeUndefined();
  });

  it('should not fire trigger when budgetStatus is absent', () => {
    const result = evaluateDecision({});

    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(budgetTrigger).toBeUndefined();
  });

  it('should fire at exactly 80% boundary', () => {
    const result = evaluateDecision({
      budgetStatus: {
        is_over_budget: false,
        usage_percentage: 80,
        tokens_used: 400000,
        budget_limit: 500000,
      },
    });

    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(budgetTrigger).toBeTruthy();
    expect(budgetTrigger.severity).toBe('MEDIUM');
  });

  it('should coexist with cost_threshold trigger', () => {
    const result = evaluateDecision({
      cost: 50000,
      budgetStatus: {
        is_over_budget: true,
        usage_percentage: 110,
        tokens_used: 550000,
        budget_limit: 500000,
      },
    }, {
      preferences: { 'filter.cost_max_usd': 10000 },
    });

    const costTrigger = result.triggers.find(t => t.type === 'cost_threshold');
    const budgetTrigger = result.triggers.find(t => t.type === 'budget_exceeded');
    expect(costTrigger).toBeTruthy();
    expect(budgetTrigger).toBeTruthy();
    // budget_exceeded should come after cost_threshold in trigger order
    const costIdx = result.triggers.indexOf(costTrigger);
    const budgetIdx = result.triggers.indexOf(budgetTrigger);
    expect(budgetIdx).toBeGreaterThan(costIdx);
  });
});
