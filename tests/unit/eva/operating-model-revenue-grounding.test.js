/**
 * SD-LEO-INFRA-S16-REVENUE-GROUNDING-001 — groundRevenue derives S16 revenue from S7 unit-economics:
 * the PRICE is the ratified S7 arpa (DERIVED), the customer VOLUME is a transparent adoption ramp
 * (ESTIMATE). Mirrors the cost-grounding test style (operating-model-cost-grounding.test.js).
 */
import { describe, it, expect } from 'vitest';
import { groundRevenue, groundCostBreakdown, PROVENANCE } from '../../../lib/eva/standards/operating-model.js';

describe('groundRevenue (FR-1)', () => {
  it('derives revenue = S7 arpa * customers with price=DERIVED, volume=ESTIMATE', () => {
    const r = groundRevenue({ s7economics: { arpa: 49 }, month: 1, priorCustomers: 0 });
    expect(r).not.toBeNull();
    expect(r.revenue).toBe(49 * r.customers);
    expect(r.provenance.price).toBe(PROVENANCE.DERIVED);
    expect(r.provenance.volume).toBe(PROVENANCE.ESTIMATE);
  });

  it('returns null when S7 has no usable arpa (caller keeps the LLM revenue tagged ESTIMATE)', () => {
    expect(groundRevenue({ s7economics: {}, month: 1 })).toBeNull();
    expect(groundRevenue({ s7economics: { arpa: 0 }, month: 1 })).toBeNull();
    expect(groundRevenue({ s7economics: { arpa: NaN }, month: 1 })).toBeNull();
    expect(groundRevenue({ s7economics: { arpa: -5 }, month: 1 })).toBeNull();
  });

  it('customer ramp is monotonic non-decreasing when carried forward (never stalls on rounding)', () => {
    let prior = 0;
    const counts = [];
    for (let m = 1; m <= 12; m++) {
      const r = groundRevenue({ s7economics: { arpa: 20 }, month: m, priorCustomers: prior });
      counts.push(r.customers);
      expect(r.customers).toBeGreaterThanOrEqual(prior); // non-decreasing
      prior = r.customers;
    }
    // month 1 seeds small; the ramp grows over the year.
    expect(counts[0]).toBe(1);
    expect(counts[11]).toBeGreaterThan(counts[0]);
  });

  it('volume is bounded by an S7 funnel/SAM ceiling', () => {
    // A tiny ceiling caps customers regardless of the ramp.
    let prior = 100;
    const r = groundRevenue({ s7economics: { arpa: 10, sam_customers: 50 }, month: 8, priorCustomers: prior });
    expect(r.customers).toBeLessThanOrEqual(50);
    expect(r.revenue).toBe(10 * r.customers);
  });

  it('does not touch the cost-grounding pattern (groundCostBreakdown still works, no personnel)', () => {
    const { breakdown, provenance } = groundCostBreakdown({ month: 1, revenue: 0 });
    expect(breakdown).not.toHaveProperty('personnel');
    expect(breakdown).toHaveProperty('founder_salary', 0);
    expect(provenance.ai_operations).toBe(PROVENANCE.DERIVED);
  });
});
