/**
 * SD-LEO-INFRA-S16-REVENUE-GROUNDING-001 (FR-3) — the evidence-gate now checks REVENUE grounding
 * specifically. Previously a grounded COST + fabricated REVENUE produced facts>0 and silently
 * auto-passed. assessRevenueGrounding + the AND-combination in assessFinancialGrounding close that.
 */
import { describe, it, expect } from 'vitest';
import {
  assessFinancialGrounding,
  assessRevenueGrounding,
  evaluatePromotionGate,
} from '../../../lib/eva/stage-templates/stage-16.js';
import { PROVENANCE } from '../../../lib/eva/standards/operating-model.js';

const DERIVED_PROJ = { month: 1, revenue: 49, revenue_provenance: { price: PROVENANCE.DERIVED, volume: PROVENANCE.ESTIMATE } };
const ESTIMATE_PROJ = { month: 1, revenue: 999999, revenue_provenance: { price: PROVENANCE.ESTIMATE, volume: PROVENANCE.ESTIMATE } };

describe('assessRevenueGrounding (FR-3)', () => {
  it('grounded when a projection has an S7-DERIVED price', () => {
    expect(assessRevenueGrounding({ revenue_projections: [DERIVED_PROJ] }).grounded).toBe(true);
  });
  it('NOT grounded when projections exist but all prices are LLM-estimated (fabricated revenue)', () => {
    expect(assessRevenueGrounding({ revenue_projections: [ESTIMATE_PROJ, ESTIMATE_PROJ] }).grounded).toBe(false);
  });
  it('defers (grounded:true) when no projections present (absence handled by the facts gate)', () => {
    expect(assessRevenueGrounding({}).grounded).toBe(true);
    expect(assessRevenueGrounding({ revenue_projections: [] }).grounded).toBe(true);
  });
});

describe('assessFinancialGrounding — revenue AND-combined with facts (FR-3)', () => {
  it('fabricated revenue + grounded cost (facts>0) NO LONGER silently passes — routes to review', () => {
    const stage16 = { fourBuckets: { summary: { facts: 3 } }, financials_valid: true, revenue_projections: [ESTIMATE_PROJ] };
    const g = assessFinancialGrounding(stage16);
    expect(g.grounded).toBe(false);
    expect(g.status).toBe('ungrounded');
    expect(g.review_required).toBe(true);
    expect(g.reason).toMatch(/revenue ungrounded/);
  });

  it('facts>0 + DERIVED-price revenue stays grounded (no false block)', () => {
    const stage16 = { fourBuckets: { summary: { facts: 3 } }, financials_valid: true, revenue_projections: [DERIVED_PROJ] };
    const g = assessFinancialGrounding(stage16);
    expect(g.grounded).toBe(true);
    expect(g.status).toBe('grounded');
    expect(g.review_required).toBe(false);
  });

  it('REGRESSION: facts>0 with no revenue array still grounded (existing groundedValid fixture)', () => {
    const g = assessFinancialGrounding({ fourBuckets: { summary: { facts: 3 } }, financials_valid: true });
    expect(g.status).toBe('grounded');
  });

  it('financials_valid=false still short-circuits to invalid (unchanged)', () => {
    const g = assessFinancialGrounding({ fourBuckets: { summary: { facts: 3 } }, financials_valid: false, revenue_projections: [DERIVED_PROJ] });
    expect(g.status).toBe('invalid');
  });
});

describe('evaluatePromotionGate — fabricated revenue is flagged ungrounded (FR-3)', () => {
  it('attaches grounding_status=ungrounded for fabricated (ESTIMATE-price) revenue', () => {
    const r = evaluatePromotionGate({
      stage13: {}, stage14: {}, stage15: {},
      stage16: { fourBuckets: { summary: { facts: 3 } }, financials_valid: true, revenue_projections: [ESTIMATE_PROJ] },
    });
    // applyEvidenceGate always attaches the grounding status; fabricated revenue => ungrounded.
    expect(r.grounding_status).toBe('ungrounded');
  });

  it('attaches grounding_status=grounded for S7-DERIVED-price revenue', () => {
    const r = evaluatePromotionGate({
      stage13: {}, stage14: {}, stage15: {},
      stage16: { fourBuckets: { summary: { facts: 3 } }, financials_valid: true, revenue_projections: [DERIVED_PROJ] },
    });
    expect(r.grounding_status).toBe('grounded');
  });
});
