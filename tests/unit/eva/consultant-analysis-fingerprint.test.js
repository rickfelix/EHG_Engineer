/**
 * SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001 (FR-1, FR-6) — stable per-finding fingerprint.
 *
 * TS-1/TS-2/TS-9: the generator re-emitted duplicates every run because its old dedup key
 * (recommendation_date, title) is scoped to a single day -- a byte-identical finding
 * re-surfacing on a different day sailed straight past it. This tests the NEW stable
 * identity: sources[0] as the anchor where an analyzer provides one, otherwise a
 * volatile-number-normalized title, hashed via the existing lib/shared/content-fingerprint.cjs
 * (TR-1: reuse, don't invent new hashing).
 */
import { describe, it, expect } from 'vitest';
import {
  stripVolatileNumbers,
  computeFindingFingerprint,
  isNearTotalSuppression,
} from '../../../scripts/eva/consultant-analysis-round.mjs';

describe('stripVolatileNumbers', () => {
  it('normalizes a percentage to a stable placeholder', () => {
    expect(stripVolatileNumbers('Delivery skewed toward infrastructure SDs (65%)'))
      .toBe(stripVolatileNumbers('Delivery skewed toward infrastructure SDs (72%)'));
  });

  it('normalizes a raw count to a stable placeholder', () => {
    expect(stripVolatileNumbers('12 pending protocol improvements (oldest: 9d)'))
      .toBe(stripVolatileNumbers('15 pending protocol improvements (oldest: 14d)'));
  });

  it('leaves genuinely different non-numeric text distinct', () => {
    expect(stripVolatileNumbers('3 OKR key results are at risk'))
      .not.toBe(stripVolatileNumbers('3 OKR key results not updated in 14+ days'));
  });
});

describe('computeFindingFingerprint (TS-1, TS-2)', () => {
  it('TS-1: two findings differing ONLY in a volatile percentage produce identical fingerprints', () => {
    const findingA = { domain: 'capability_delivery', title: 'Delivery skewed toward infrastructure SDs (65%)', sources: [] };
    const findingB = { domain: 'capability_delivery', title: 'Delivery skewed toward infrastructure SDs (72%)', sources: [] };
    expect(computeFindingFingerprint(findingA)).toBe(computeFindingFingerprint(findingB));
  });

  it('TS-1 (protocol_health variant): differing count + day-delta still collapse to one fingerprint', () => {
    const findingA = { domain: 'protocol_health', title: '12 pending protocol improvements (oldest: 9d)', sources: [] };
    const findingB = { domain: 'protocol_health', title: '15 pending protocol improvements (oldest: 14d)', sources: [] };
    expect(computeFindingFingerprint(findingA)).toBe(computeFindingFingerprint(findingB));
  });

  it('TS-2: genuinely different findings from the same analyzer produce different fingerprints (no false suppression)', () => {
    const findingA = { domain: 'okr_drift', title: '3 OKR key results are at risk', sources: ['kr-a'] };
    const findingB = { domain: 'okr_drift', title: '3 OKR key results not updated in 14+ days', sources: ['kr-b'] };
    expect(computeFindingFingerprint(findingA)).not.toBe(computeFindingFingerprint(findingB));
  });

  it('prefers sources[0] as the identity anchor when present, ignoring title differences entirely', () => {
    const findingA = { domain: 'okr_drift', title: 'Old wording', sources: ['kr-shared'] };
    const findingB = { domain: 'okr_drift', title: 'Completely different wording', sources: ['kr-shared'] };
    expect(computeFindingFingerprint(findingA)).toBe(computeFindingFingerprint(findingB));
  });

  it('different sources[0] anchors produce different fingerprints even with identical titles', () => {
    const findingA = { domain: 'okr_drift', title: 'Same title', sources: ['kr-a'] };
    const findingB = { domain: 'okr_drift', title: 'Same title', sources: ['kr-b'] };
    expect(computeFindingFingerprint(findingA)).not.toBe(computeFindingFingerprint(findingB));
  });

  it('different domains never collide even with the same anchor text', () => {
    const findingA = { domain: 'okr_drift', title: 'shared text', sources: [] };
    const findingB = { domain: 'protocol_health', title: 'shared text', sources: [] };
    expect(computeFindingFingerprint(findingA)).not.toBe(computeFindingFingerprint(findingB));
  });

  it('TS-9: the real recurring live finding (no sources, no volatile numbers) fingerprints identically across 3 simulated runs', () => {
    // Verbatim shape of the finding that recurred 2026-07-04/07-08/07-11 per LEAD-phase research.
    const finding = {
      domain: 'cross_venture_reuse',
      title: 'Potential capability reuse between EHG_Engineer and CronGenius',
      sources: [],
    };
    const run1 = computeFindingFingerprint(finding);
    const run2 = computeFindingFingerprint({ ...finding });
    const run3 = computeFindingFingerprint({ ...finding });
    expect(run1).toBe(run2);
    expect(run2).toBe(run3);
  });
});

describe('isNearTotalSuppression (FR-6, TS-10)', () => {
  it('TS-10: detects a fully-suppressed run (candidates generated, nothing inserted)', () => {
    expect(isNearTotalSuppression(12, 0)).toBe(true);
  });

  it('a normal run (some candidates inserted) is not flagged', () => {
    expect(isNearTotalSuppression(12, 5)).toBe(false);
  });

  it('a genuinely quiet run (no candidates at all) is not flagged as a suppression regression', () => {
    expect(isNearTotalSuppression(0, 0)).toBe(false);
  });
});
