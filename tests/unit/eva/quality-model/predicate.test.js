/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B.
 * TS-2 (limb 1 fixture failure), TS-3 (limb 2 fixture advisory), TS-8 (waiver
 * round-trip + expiry -- the shape written for a waiver is the shape the limb-2
 * reader consumes; an expired/undated waiver must not suppress).
 */
import { describe, it, expect } from 'vitest';
import {
  checkCategoryDimensionMapping, checkProducerReaderOrWaiver, isWaiverActive, evaluateQualityModelPredicate,
} from '../../../../lib/eva/quality-model/predicate.js';

describe('TS-2: limb 1 (blocking) — category->dimension mapping', () => {
  it('fails when a fixture registry is missing a dimension for an emitted category', () => {
    const dimensions = [{ id: 'a' }, { id: 'b' }];
    const result = checkCategoryDimensionMapping(['a', 'b', 'orphan'], dimensions);
    expect(result.pass).toBe(false);
    expect(result.orphanCategories).toEqual(['orphan']);
  });

  it('passes when every emitted category has a dimension', () => {
    const dimensions = [{ id: 'a' }, { id: 'b' }];
    const result = checkCategoryDimensionMapping(['a', 'b'], dimensions);
    expect(result.pass).toBe(true);
    expect(result.orphanCategories).toEqual([]);
  });
});

describe('TS-3: limb 2 (advisory) — producer+reader-or-waiver', () => {
  it('reports a dimension with a producer but no reader as missing:"reader" (never mislabeled "producer")', () => {
    const dimensions = [{ id: 'x', producer: 'a.js#fn', reader_or_gate: null, waiver: null }];
    expect(checkProducerReaderOrWaiver(dimensions).findings).toEqual([{ id: 'x', missing: 'reader' }]);
  });

  it('reports a dimension with a reader but no producer as missing:"producer" (never mislabeled "reader") -- adversarial review finding (PR #8931, MEDIUM): the missing:producer branch was previously unasserted by value', () => {
    const dimensions = [{ id: 'x', producer: null, reader_or_gate: 'b.js#gate', waiver: null }];
    expect(checkProducerReaderOrWaiver(dimensions).findings).toEqual([{ id: 'x', missing: 'producer' }]);
  });

  it('a fully-wired dimension produces no finding', () => {
    const dimensions = [{ id: 'x', producer: 'a.js#fn', reader_or_gate: 'b.js#gate', waiver: null }];
    expect(checkProducerReaderOrWaiver(dimensions).findings).toEqual([]);
  });

  it('missing both producer and reader is reported as "both"', () => {
    const dimensions = [{ id: 'x', producer: null, reader_or_gate: null, waiver: null }];
    expect(checkProducerReaderOrWaiver(dimensions).findings).toEqual([{ id: 'x', missing: 'both' }]);
  });
});

describe('TS-8: waiver round-trip — the shape a waiver is written with is the shape the reader consumes', () => {
  const now = new Date('2026-09-13T00:00:00Z');

  it('a dated, un-expired waiver suppresses the limb-2 finding', () => {
    const dimensions = [{
      id: 'x', producer: null, reader_or_gate: null,
      waiver: { reason: 'stub', dated_at: '2026-09-01', review_by: '2026-12-01' },
    }];
    expect(checkProducerReaderOrWaiver(dimensions, now).findings).toEqual([]);
    expect(isWaiverActive(dimensions[0].waiver, now)).toBe(true);
  });

  it('an EXPIRED waiver (review_by in the past) does NOT suppress the finding', () => {
    const dimensions = [{
      id: 'x', producer: null, reader_or_gate: null,
      waiver: { reason: 'stub', dated_at: '2026-01-01', review_by: '2026-06-01' },
    }];
    expect(isWaiverActive(dimensions[0].waiver, now)).toBe(false);
    expect(checkProducerReaderOrWaiver(dimensions, now).findings).toEqual([{ id: 'x', missing: 'both' }]);
  });

  it('an UNDATED waiver (no dated_at) does NOT suppress the finding -- "dated" is enforced, not decorative', () => {
    const dimensions = [{ id: 'x', producer: null, reader_or_gate: null, waiver: { reason: 'stub' } }];
    expect(isWaiverActive(dimensions[0].waiver, now)).toBe(false);
    expect(checkProducerReaderOrWaiver(dimensions, now).findings).toEqual([{ id: 'x', missing: 'both' }]);
  });

  it('a waiver with review_by:null does NOT suppress the finding -- ADVERSARIAL REVIEW FIX (PR #8931, HIGH): an absent review_by must not become an open-ended, permanently-silent waiver', () => {
    const dimensions = [{
      id: 'x', producer: null, reader_or_gate: null,
      waiver: { reason: 'stub', dated_at: '2026-09-01', review_by: null },
    }];
    expect(isWaiverActive(dimensions[0].waiver, now)).toBe(false);
    expect(checkProducerReaderOrWaiver(dimensions, now).findings).toEqual([{ id: 'x', missing: 'both' }]);
  });

  it('a malformed review_by (unparseable date) does NOT suppress the finding -- fails closed to visibility, not open', () => {
    const dimensions = [{
      id: 'x', producer: null, reader_or_gate: null,
      waiver: { reason: 'stub', dated_at: '2026-09-01', review_by: 'not-a-date' },
    }];
    expect(isWaiverActive(dimensions[0].waiver, now)).toBe(false);
    expect(checkProducerReaderOrWaiver(dimensions, now).findings).toEqual([{ id: 'x', missing: 'both' }]);
  });
});

describe('evaluateQualityModelPredicate — combined result', () => {
  it('blocking failure fails the overall predicate even if advisory is clean', () => {
    const result = evaluateQualityModelPredicate({
      generatedCategoryIds: ['orphan'],
      dimensions: [{ id: 'a', producer: 'p', reader_or_gate: 'r', waiver: null }],
    });
    expect(result.pass).toBe(false);
  });

  it('advisory findings never fail the overall predicate', () => {
    const result = evaluateQualityModelPredicate({
      generatedCategoryIds: ['a'],
      dimensions: [{ id: 'a', producer: null, reader_or_gate: null, waiver: null }],
    });
    expect(result.advisory.findings.length).toBe(1);
    expect(result.pass).toBe(true);
  });
});
