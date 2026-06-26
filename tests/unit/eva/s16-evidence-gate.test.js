/**
 * SD-LEO-INFRA-S16-FINANCIAL-GROUNDING-EVIDENCE-GATE-001 — the S16 financial evidence-gate.
 *
 * Implements the chairman-RATIFIED policy (route-to-review, autonomy-aware, NOT hard-block, never
 * silently auto-pass) on the signals the financial-rigor SD already emits: ungrounded financials
 * (fourBuckets.summary.facts===0 / all-simulation) or invalid financials (financials_valid===false)
 * make the S16 promotion gate ROUTE_TO_REVIEW instead of a silent PROMOTE.
 */
import { describe, it, expect } from 'vitest';
import { evaluatePromotionGate, assessFinancialGrounding } from '../../../lib/eva/stage-templates/stage-16.js';

const PASS_SCORE = 90; // comfortably above the promotion threshold so the base decision is PROMOTE
const groundedValid = { fourBuckets: { summary: { facts: 3 } }, financials_valid: true };
const ungrounded = { fourBuckets: { summary: { facts: 0 } }, financials_valid: true };
const invalid = { fourBuckets: { summary: { facts: 3 } }, financials_valid: false };
const noBuckets = { financials_valid: true }; // no four-buckets evidence at all

function gate(stage16, opts = { readinessScore: PASS_SCORE }) {
  return evaluatePromotionGate({ stage13: {}, stage14: {}, stage15: {}, stage16 }, opts);
}

describe('assessFinancialGrounding (FR-1)', () => {
  it('grounded: facts>0 and valid -> grounded, no review_required', () => {
    const g = assessFinancialGrounding(groundedValid);
    expect(g.status).toBe('grounded');
    expect(g.review_required).toBe(false);
  });
  it('ungrounded: 0 facts -> ungrounded, review_required', () => {
    const g = assessFinancialGrounding(ungrounded);
    expect(g.status).toBe('ungrounded');
    expect(g.review_required).toBe(true);
  });
  it('ungrounded: no four-buckets evidence -> ungrounded, review_required (fail toward review)', () => {
    const g = assessFinancialGrounding(noBuckets);
    expect(g.status).toBe('ungrounded');
    expect(g.review_required).toBe(true);
  });
  it('invalid: financials_valid=false -> invalid, review_required (even with facts)', () => {
    const g = assessFinancialGrounding(invalid);
    expect(g.status).toBe('invalid');
    expect(g.review_required).toBe(true);
  });
});

describe('evaluatePromotionGate evidence-gate wiring (FR-2)', () => {
  it('ungrounded financials -> ROUTE_TO_REVIEW (never a silent PROMOTE)', () => {
    const r = gate(ungrounded);
    expect(r.decision).toBe('ROUTE_TO_REVIEW');
    expect(r.review_required).toBe(true);
    expect(r.grounding_status).toBe('ungrounded');
  });

  it('invalid financials -> ROUTE_TO_REVIEW', () => {
    const r = gate(invalid);
    expect(r.decision).toBe('ROUTE_TO_REVIEW');
    expect(r.review_required).toBe(true);
    expect(r.grounding_status).toBe('invalid');
  });

  it('grounded+valid financials -> normal PROMOTE, no review_required (route-to-review, NOT hard-block)', () => {
    const r = gate(groundedValid);
    expect(r.decision).toBe('PROMOTE');
    expect(r.review_required).toBe(false);
    expect(r.grounding_status).toBe('grounded');
  });

  it('does NOT hard-block: an ungrounded route-to-review is not flipped to REJECT', () => {
    const r = gate(ungrounded);
    expect(r.decision).not.toBe('REJECT');
    expect(r.decision).toBe('ROUTE_TO_REVIEW');
  });

  it('an already-failing gate (low score -> REVISE/REJECT) is left as-is even if ungrounded', () => {
    const r = gate(ungrounded, { readinessScore: 20 });
    expect(['REVISE', 'REJECT']).toContain(r.decision); // not converted to ROUTE_TO_REVIEW
    expect(r.review_required).toBe(false);
  });

  it('a chairman OVERRIDE is unaffected by the evidence-gate', () => {
    const r = gate(ungrounded, { chairmanOverride: { approved: true, justification: 'ratified exception' } });
    expect(r.decision).toBe('OVERRIDE');
  });
});
