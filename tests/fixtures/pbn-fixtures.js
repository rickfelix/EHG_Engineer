/**
 * Shared PBN gate fixtures — SD-LEO-FEAT-PROVEN-BETTER-NEW-001 (US-008 AC #5).
 * Three named, two-sided-control fixtures, each documenting its expected verdict inline so an
 * unexpected flip is visible in a diff. Exported in both shapes consumers need:
 *   - *_BUCKETS: raw {proven, better, new} input to evaluatePbnVerdict/buildPbnVerdict (pbn-gate.test.js)
 *   - *_VERDICT: a full persisted pbn_verdict shape, for tests that stub runPbnGate's return
 *     value directly (chairman-review.test.js, pbn-gate-flow.test.js)
 * US-003, US-005, US-006, US-008 all reference these rather than defining private near-copies
 * that can drift from each other.
 */

// Expected verdict: PASS — proven bucket cites a real, resolvable market referent; exactly one wedge.
export const PROVEN_CLONE_BUCKETS = {
  proven: {
    mechanic: 'incumbent loop',
    citations: [{ source: 'Category leader X', measured: 'Public revenue disclosure, FY2025 10-K', reference: 'https://example.test/x-revenue' }],
    coverage: true,
  },
  better: { hypothesis: 'named friction + testable improvement', friction_point: 'onboarding drop-off', citations: [], coverage: false },
  new: { wedge: 'one novel wedge', wedge_count: 1, coverage: true },
};

// Expected verdict: REJECT — empty proven bucket, no incumbent-mechanics citation at all.
export const ALL_NEW_BUCKETS = {
  proven: { mechanic: null, citations: [], coverage: false },
  better: { hypothesis: null, friction_point: null, citations: [], coverage: false },
  new: { wedge: 'a genuinely novel wedge', wedge_count: 1, coverage: false },
};

// Expected verdict: TRIM — proven IS evidenced, but the NEW bucket carries 2 wedges (>1).
export const TWO_WEDGE_BUCKETS = {
  proven: {
    mechanic: 'incumbent loop',
    citations: [{ source: 'Category leader X', measured: 'Public revenue disclosure, FY2025 10-K', reference: 'https://example.test/x-revenue' }],
    coverage: true,
  },
  better: { hypothesis: 'named friction + testable improvement', friction_point: 'onboarding drop-off', citations: [], coverage: false },
  new: { wedge: 'two wedges named together', wedge_count: 2, coverage: true },
};

const MEASURED_AT = '2026-08-15T00:00:00.000Z';

export const PROVEN_CLONE_VERDICT = {
  ...PROVEN_CLONE_BUCKETS,
  verdict: 'PASS',
  measured_at: MEASURED_AT,
  rule_trace: [{ rule_id: 'NO_RESOLVABLE_REFERENT', fired: true, bucket: 'better', detail: 'better bucket coverage=false — no citation resolved (FR-3 coverage-not-completeness)' }],
};

export const ALL_NEW_VERDICT = {
  ...ALL_NEW_BUCKETS,
  verdict: 'REJECT',
  measured_at: MEASURED_AT,
  rule_trace: [{ rule_id: 'EMPTY_PROVEN', fired: true, detail: 'proven bucket has no resolvable citation — empty-proven auto-fails (FR-2 i)' }],
};

export const TWO_WEDGE_VERDICT = {
  ...TWO_WEDGE_BUCKETS,
  verdict: 'TRIM',
  measured_at: MEASURED_AT,
  rule_trace: [{ rule_id: 'NEW_MULTI_WEDGE', fired: true, detail: 'new bucket contains 2 novel wedges (>1) — trim-or-reject (FR-2 ii)' }],
};
