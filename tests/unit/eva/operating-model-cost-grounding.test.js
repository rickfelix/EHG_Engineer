import { describe, it, expect } from 'vitest';
import {
  OPERATING_MODEL,
  PROVENANCE,
  getOperatingModelPromptBlock,
  groundCostBreakdown,
} from '../../../lib/eva/standards/operating-model.js';

// SD-LEO-INFRA-S16-OPERATING-MODEL-COST-GROUNDING-001 regression tests.

describe('OPERATING_MODEL SSOT', () => {
  it('encodes EHG operating-model assumptions (zero payroll, hosting-standard, organic GTM, $0 founder)', () => {
    expect(OPERATING_MODEL.ai_operations.monthly_usd_band[0]).toBeGreaterThanOrEqual(0);
    expect(OPERATING_MODEL.hosting.stack).toEqual(expect.arrayContaining(['Replit', 'Neon', 'Clerk', 'Gemini', 'Sentry']));
    expect(OPERATING_MODEL.hosting.monthly_usd_band).toEqual([25, 85]);
    expect(OPERATING_MODEL.marketing.monthly_usd_band[0]).toBe(0);
    expect(OPERATING_MODEL.founder_salary.monthly_usd).toBe(0);
    expect(OPERATING_MODEL.other.payment_processing_pct).toBeCloseTo(2.9);
  });

  it('flags the organic-only weak-acquisition caveat (does not assume traction)', () => {
    expect(OPERATING_MODEL.marketing.caveat.toLowerCase()).toMatch(/weak|do not assume|traction/);
  });
});

describe('getOperatingModelPromptBlock', () => {
  it('injects a block that names ai_operations and forbids a human personnel line', () => {
    const block = getOperatingModelPromptBlock();
    expect(block).toMatch(/EHG OPERATING MODEL/);
    expect(block).toMatch(/ai_operations/);
    expect(block).toMatch(/NOT human payroll/i);
    expect(block).toMatch(/founder_salary/);
  });
});

describe('groundCostBreakdown', () => {
  it('produces an EHG-grounded monthly breakdown with provenance tags (NO personnel/payroll)', () => {
    const { breakdown, provenance } = groundCostBreakdown({ month: 1, revenue: 0 });
    expect(breakdown).toHaveProperty('ai_operations');
    expect(breakdown).toHaveProperty('founder_salary', 0);
    expect(breakdown).not.toHaveProperty('personnel');
    expect(provenance.ai_operations).toBe(PROVENANCE.DERIVED);
    expect(provenance.infrastructure).toBe(PROVENANCE.DERIVED);
  });

  it('REGRESSION: early-stage monthly burn lands in the ~$150-900 band, not $11k+', () => {
    // Month 1, no revenue: low end of every band.
    const m1 = groundCostBreakdown({ month: 1, revenue: 0 });
    expect(m1.monthly_total).toBeLessThan(900);
    // Month 12, modest revenue: still far below the generic $11k+ SaaS burn.
    const m12 = groundCostBreakdown({ month: 12, revenue: 2000 });
    expect(m12.monthly_total).toBeLessThan(900);
    expect(m12.monthly_total).toBeGreaterThan(0);
  });

  it('scales from the low band early toward the high band later', () => {
    const early = groundCostBreakdown({ month: 1, revenue: 0 }).breakdown.infrastructure;
    const later = groundCostBreakdown({ month: 13, revenue: 0 }).breakdown.infrastructure;
    expect(later).toBeGreaterThanOrEqual(early);
    expect(early).toBe(OPERATING_MODEL.hosting.monthly_usd_band[0]);     // $25 floor early
    expect(later).toBe(OPERATING_MODEL.hosting.monthly_usd_band[1]);     // $85 ceiling later
  });

  it('includes payment processing (~2.9% of revenue) in other', () => {
    const noRev = groundCostBreakdown({ month: 1, revenue: 0 }).breakdown.other;
    const withRev = groundCostBreakdown({ month: 1, revenue: 1000 }).breakdown.other;
    expect(withRev).toBeGreaterThan(noRev); // ~$29 processing on $1000 revenue
  });
});
