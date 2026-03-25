import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCollector, removeCollector, clearCollectors, getCollectorNames,
  trackVentureCosts, DEFAULT_BUDGET,
} from '../bridge/cost-tracker.js';

beforeEach(() => {
  clearCollectors();
});

describe('collector registry', () => {
  it('registers and lists collectors', () => {
    registerCollector('test', async () => ({ cost: 0, currency: 'USD', source: 'test' }));
    expect(getCollectorNames()).toEqual(['test']);
  });

  it('removes a collector', () => {
    registerCollector('a', async () => ({ cost: 0, currency: 'USD', source: 'a' }));
    registerCollector('b', async () => ({ cost: 0, currency: 'USD', source: 'b' }));
    removeCollector('a');
    expect(getCollectorNames()).toEqual(['b']);
  });

  it('clearCollectors empties registry', () => {
    registerCollector('x', async () => ({ cost: 0, currency: 'USD', source: 'x' }));
    clearCollectors();
    expect(getCollectorNames()).toHaveLength(0);
  });
});

describe('trackVentureCosts', () => {
  it('returns zero cost with no collectors', async () => {
    const result = await trackVentureCosts('venture-1');
    expect(result.totalCost).toBe(0);
    expect(result.overBudget).toBe(false);
    expect(result.breakdown).toEqual({});
    expect(result.warnings).toHaveLength(0);
  });

  it('aggregates costs from multiple collectors', async () => {
    registerCollector('infra', async () => ({ cost: 100, currency: 'USD', source: 'infra' }));
    registerCollector('compute', async () => ({ cost: 50.50, currency: 'USD', source: 'compute' }));
    registerCollector('tokens', async () => ({ cost: 25.25, currency: 'USD', source: 'tokens' }));

    const result = await trackVentureCosts('venture-2');
    expect(result.totalCost).toBe(175.75);
    expect(result.breakdown.infra.cost).toBe(100);
    expect(result.breakdown.compute.cost).toBe(50.50);
    expect(result.breakdown.tokens.cost).toBe(25.25);
  });

  it('detects over-budget condition', async () => {
    registerCollector('expensive', async () => ({ cost: 600, currency: 'USD', source: 'expensive' }));

    const result = await trackVentureCosts('venture-3', { budget: 500 });
    expect(result.overBudget).toBe(true);
    expect(result.amountOver).toBe(100);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toContain('600');
    expect(result.alerts[0]).toContain('500');
  });

  it('uses DEFAULT_BUDGET when not specified', async () => {
    registerCollector('cheap', async () => ({ cost: 10, currency: 'USD', source: 'cheap' }));
    const result = await trackVentureCosts('venture-4');
    expect(result.overBudget).toBe(false);
    expect(DEFAULT_BUDGET).toBe(500);
  });

  it('handles collector errors gracefully', async () => {
    registerCollector('good', async () => ({ cost: 50, currency: 'USD', source: 'good' }));
    registerCollector('broken', async () => { throw new Error('API down'); });

    const result = await trackVentureCosts('venture-5');
    expect(result.totalCost).toBe(50);
    expect(result.breakdown.good.cost).toBe(50);
    expect(result.breakdown.broken.error).toBe('API down');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('broken');
  });

  it('includes period in output', async () => {
    const result = await trackVentureCosts('venture-6', { period: '2026-03' });
    expect(result.period).toBe('2026-03');
  });

  it('auto-generates period when not specified', async () => {
    const result = await trackVentureCosts('venture-7');
    expect(result.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('rounds totalCost to 2 decimal places', async () => {
    registerCollector('a', async () => ({ cost: 10.111, currency: 'USD', source: 'a' }));
    registerCollector('b', async () => ({ cost: 20.222, currency: 'USD', source: 'b' }));
    const result = await trackVentureCosts('venture-8');
    expect(result.totalCost).toBe(30.33);
  });

  it('not over budget when exactly at budget', async () => {
    registerCollector('exact', async () => ({ cost: 500, currency: 'USD', source: 'exact' }));
    const result = await trackVentureCosts('venture-9', { budget: 500 });
    expect(result.overBudget).toBe(false);
    expect(result.amountOver).toBe(0);
  });
});

describe('stub collectors', () => {
  it('default stubs return valid structure', async () => {
    // Re-register default stubs (cleared in beforeEach)
    const { default: mod } = await import('../bridge/cost-tracker.js');
    // Module-level registrations already happened, but clearCollectors removed them
    // Register manually for test
    registerCollector('supabase_compute', async () => ({ cost: 0, currency: 'USD', source: 'supabase_compute' }));
    registerCollector('vercel_bandwidth', async () => ({ cost: 0, currency: 'USD', source: 'vercel_bandwidth' }));
    registerCollector('llm_tokens', async () => ({ cost: 0, currency: 'USD', source: 'llm_tokens' }));

    const result = await trackVentureCosts('venture-stub');
    expect(result.totalCost).toBe(0);
    expect(Object.keys(result.breakdown)).toHaveLength(3);
    for (const [name, entry] of Object.entries(result.breakdown)) {
      expect(entry.cost).toBe(0);
      expect(entry.currency).toBe('USD');
    }
  });
});
