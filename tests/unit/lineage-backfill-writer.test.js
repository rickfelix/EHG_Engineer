// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-2 + FR-C0-3 + FR-C0-4
import { describe, it, expect } from 'vitest';
import { mapConfidenceToVerdict } from '../../scripts/lineage/verdict-tier.mjs';
import {
  CONFIDENCE_THRESHOLD,
  VERDICT_HIGH,
  VERDICT_LOW,
  BACKFILL_TARGET_CAP,
} from '../../scripts/lineage/constants.mjs';
import { computeBackfillRow, structuralConfidence, backfillVisionKey } from '../../scripts/lineage/backfill-vision-key.mjs';

describe('lineage constants', () => {
  it('CONFIDENCE_THRESHOLD is 95 (single source of truth)', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(95);
  });
  it('BACKFILL_TARGET_CAP is 50', () => {
    expect(BACKFILL_TARGET_CAP).toBe(50);
  });
});

describe('mapConfidenceToVerdict', () => {
  it('95 (boundary) returns BACKFILLED_HIGH', () => {
    expect(mapConfidenceToVerdict(95)).toBe(VERDICT_HIGH);
  });
  it('100 returns BACKFILLED_HIGH', () => {
    expect(mapConfidenceToVerdict(100)).toBe(VERDICT_HIGH);
  });
  it('94.99 returns BACKFILLED_LOW_CONFIDENCE', () => {
    expect(mapConfidenceToVerdict(94.99)).toBe(VERDICT_LOW);
  });
  it('0 returns BACKFILLED_LOW_CONFIDENCE', () => {
    expect(mapConfidenceToVerdict(0)).toBe(VERDICT_LOW);
  });
  it('throws on non-numeric', () => {
    expect(() => mapConfidenceToVerdict('95')).toThrow(TypeError);
  });
  it('throws on out-of-range', () => {
    expect(() => mapConfidenceToVerdict(101)).toThrow(RangeError);
    expect(() => mapConfidenceToVerdict(-1)).toThrow(RangeError);
  });
});

describe('computeBackfillRow (tierKeysFromSDKey-first)', () => {
  it('L1 suffix SD → BACKFILLED_HIGH conf=100', () => {
    const out = computeBackfillRow({ sd_key: 'SD-FOO-L1-001', metadata: {} });
    expect(out.verdict).toBe(VERDICT_HIGH);
    expect(out.confidence).toBe(100);
    expect(out.vision_key).toBe('VISION-EHG-L1-001');
    expect(out.reason).toBe('tierKeysFromSDKey-first');
  });
  it('L2 suffix SD → BACKFILLED_HIGH conf=100', () => {
    const out = computeBackfillRow({ sd_key: 'SD-WRITERCONSUMER-ASYMMETRY-L2-001', metadata: {} });
    expect(out.verdict).toBe(VERDICT_HIGH);
    expect(out.confidence).toBe(100);
  });
  it('L3 suffix SD → BACKFILLED_HIGH conf=100', () => {
    const out = computeBackfillRow({ sd_key: 'SD-X-L3-007', metadata: {} });
    expect(out.verdict).toBe(VERDICT_HIGH);
    expect(out.confidence).toBe(100);
  });
  it('non-tier SD with no signals → BACKFILLED_LOW_CONFIDENCE', () => {
    const out = computeBackfillRow({ sd_key: 'SD-ARBITRARY-001', sd_type: null, metadata: {} });
    expect(out.verdict).toBe(VERDICT_LOW);
    expect(out.confidence).toBeLessThan(95);
    expect(out.reason).toBe('structural-heuristic');
  });
});

describe('structuralConfidence', () => {
  it('tier_suffix present (any L1/L2/L3) returns 100', () => {
    expect(structuralConfidence({ sd_key: 'SD-X-L2-001', metadata: {} })).toBe(100);
  });
  it('non-tier with only sd_type returns < 95', () => {
    const c = structuralConfidence({ sd_key: 'SD-X-001', sd_type: 'feature', metadata: {} });
    expect(c).toBeLessThan(95);
  });
});

describe('backfillVisionKey writer guards', () => {
  it('refuses --target > BACKFILL_TARGET_CAP', async () => {
    await expect(backfillVisionKey({ supabase: {}, target: BACKFILL_TARGET_CAP + 1 })).rejects.toThrow(/exceeds BACKFILL_TARGET_CAP/);
  });
});
