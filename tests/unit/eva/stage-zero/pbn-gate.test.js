/**
 * Unit tests: PBN hard gate rules (pure functions) — SD-LEO-FEAT-PROVEN-BETTER-NEW-001.
 * PRD test scenarios: TS-1, TS-2, TS-3a, TS-3b, TS-4.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCitation,
  resolveBucketCoverage,
  evaluatePbnVerdict,
  buildPbnVerdict,
  PBN_RULES,
} from '../../../../lib/eva/stage-zero/pbn-gate.js';

const realCitation = { source: 'Category leader X', measured: 'Public revenue disclosure', reference: 'https://example.test/x-revenue' };
const fabricatedCitation = { source: 'Something', measured: 'made up' }; // no reference field
const provenCloneBucket = { mechanic: 'incumbent loop', citations: [realCitation], coverage: true };
const emptyProvenBucket = { mechanic: null, citations: [], coverage: false };
const uncoverableProvenBucket = { mechanic: 'claimed mechanic', citations: [fabricatedCitation], coverage: true }; // LLM claims coverage but citation doesn't resolve

describe('resolveCitation (FR-5, hermetic check)', () => {
  it('resolves a well-formed citation with source + reference', () => {
    expect(resolveCitation(realCitation)).toBe(true);
  });
  it('does not resolve a citation missing the reference field', () => {
    expect(resolveCitation(fabricatedCitation)).toBe(false);
  });
  it('does not resolve null/undefined/non-object', () => {
    expect(resolveCitation(null)).toBe(false);
    expect(resolveCitation(undefined)).toBe(false);
    expect(resolveCitation('a string')).toBe(false);
  });
  it('does not resolve a citation with empty-string fields', () => {
    expect(resolveCitation({ source: '', reference: '' })).toBe(false);
    expect(resolveCitation({ source: '   ', reference: '   ' })).toBe(false);
  });
});

describe('resolveBucketCoverage (FR-3 deterministic backstop)', () => {
  it('true when LLM reports coverage AND a citation actually resolves', () => {
    expect(resolveBucketCoverage(provenCloneBucket)).toBe(true);
  });
  it('false when LLM reports coverage=false, regardless of citations present', () => {
    expect(resolveBucketCoverage({ coverage: false, citations: [realCitation] })).toBe(false);
  });
  it('false when LLM claims coverage=true but no citation actually resolves — the fabrication-resistance case', () => {
    // This is the exact scenario TS-4 (citation resolution catches a fabricated claim) exercises.
    expect(resolveBucketCoverage(uncoverableProvenBucket)).toBe(false);
  });
  it('false for an empty/absent bucket', () => {
    expect(resolveBucketCoverage(emptyProvenBucket)).toBe(false);
    expect(resolveBucketCoverage(undefined)).toBe(false);
  });
});

describe('evaluatePbnVerdict (FR-2 hard gate rules)', () => {
  // TS-1: proven-clone idea passes the gate
  it('PASS when proven is evidenced and wedge_count <= 1', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'one wedge', wedge_count: 1, coverage: true },
    });
    expect(result.verdict).toBe('PASS');
    expect(result.rule_trace).toEqual([]);
  });

  // TS-2: all-new idea is rejected on the empty-proven rule
  it('REJECT with EMPTY_PROVEN when proven bucket is not evidenced', () => {
    const result = evaluatePbnVerdict({
      proven: emptyProvenBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    expect(result.verdict).toBe('REJECT');
    expect(result.rule_trace.map((r) => r.rule_id)).toEqual([PBN_RULES.EMPTY_PROVEN]);
  });

  // TS-3a: two-wedge idea with an evidenced proven bucket TRIMS
  it('TRIM with NEW_MULTI_WEDGE when wedge_count > 1 but proven IS evidenced', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'two wedges named', wedge_count: 2, coverage: true },
    });
    expect(result.verdict).toBe('TRIM');
    expect(result.rule_trace.map((r) => r.rule_id)).toEqual([PBN_RULES.NEW_MULTI_WEDGE]);
    expect(result.resolved.proven_coverage).toBe(true);
  });

  // TS-3b: two-wedge idea with an UNevidenced proven bucket REJECTS (rules compound)
  it('REJECT with BOTH EMPTY_PROVEN and NEW_MULTI_WEDGE when both rules fire', () => {
    const result = evaluatePbnVerdict({
      proven: emptyProvenBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'two wedges', wedge_count: 2, coverage: true },
    });
    expect(result.verdict).toBe('REJECT');
    const ruleIds = result.rule_trace.map((r) => r.rule_id);
    expect(ruleIds).toContain(PBN_RULES.EMPTY_PROVEN);
    expect(ruleIds).toContain(PBN_RULES.NEW_MULTI_WEDGE);
    expect(ruleIds).toHaveLength(2);
  });

  it('wedge_count derives from a truthy wedge string when the LLM omits an explicit count', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { citations: [], coverage: false },
      new: { wedge: 'implied single wedge' }, // no wedge_count field
    });
    expect(result.resolved.wedge_count).toBe(1);
    expect(result.verdict).toBe('PASS');
  });

  it('wedge_count is 0 when there is no wedge at all', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { citations: [], coverage: false },
      new: {},
    });
    expect(result.resolved.wedge_count).toBe(0);
    expect(result.verdict).toBe('PASS');
  });
});

describe('buildPbnVerdict (persisted shape)', () => {
  it('produces the full shape matching the migration CHECK constraint (proven/better/new/verdict/measured_at/rule_trace)', () => {
    const verdict = buildPbnVerdict(
      {
        proven: provenCloneBucket,
        better: { hypothesis: 'h', friction_point: 'f', citations: [realCitation], coverage: true },
        new: { wedge: 'w', wedge_count: 1, coverage: true },
      },
      { now: '2026-08-15T12:00:00.000Z' }
    );
    expect(verdict.verdict).toBe('PASS');
    expect(verdict.measured_at).toBe('2026-08-15T12:00:00.000Z');
    expect(Array.isArray(verdict.rule_trace)).toBe(true);
    expect(verdict.proven.coverage).toBe(true);
    expect(verdict.better.coverage).toBe(true);
    expect(verdict.new.wedge_count).toBe(1);
  });

  it('the persisted proven.coverage reflects the RESOLVED value, not the LLM self-report, when they disagree', () => {
    // TS-4 exact scenario: LLM claims coverage=true but the citation is fabricated/unresolvable.
    const verdict = buildPbnVerdict({
      proven: uncoverableProvenBucket,
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
    });
    expect(verdict.proven.coverage).toBe(false); // resolved, not the LLM's claimed true
    expect(verdict.verdict).toBe('REJECT');
  });

  it('re-invocation with a later "now" produces a strictly newer measured_at (FR-2 v, unpark re-check)', () => {
    const first = buildPbnVerdict({ proven: provenCloneBucket, better: { citations: [], coverage: false }, new: { wedge_count: 1 } }, { now: '2026-08-15T12:00:00.000Z' });
    const second = buildPbnVerdict({ proven: provenCloneBucket, better: { citations: [], coverage: false }, new: { wedge_count: 1 } }, { now: '2026-08-16T12:00:00.000Z' });
    expect(Date.parse(second.measured_at)).toBeGreaterThan(Date.parse(first.measured_at));
  });
});
