/**
 * Tests for the market signal scanner scoring engine (FR-2).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 *
 * The hard triangulation rule (>=3 distinct families, >=1 must be money_in or
 * stickiness, attention-only NEVER passes) is the most safety-critical piece of
 * this module -- it is exercised precisely and from multiple angles below.
 */

import { describe, it, expect } from 'vitest';
import { NO_DATA_MARKER, scoreNiche, isHardScreenFailed } from '../../../lib/market-signal-scanner/scoring.js';

function reading(family, slope, extra = {}) {
  return {
    family,
    slope_90d_vs_baseline: slope,
    observations: [
      {
        source: extra.source ?? `${family}_source`,
        raw_value: extra.raw_value ?? 100,
        source_url: extra.source_url ?? `https://example.test/${family}`,
        content_hash: extra.content_hash ?? 'deadbeef',
        fetched_at: extra.fetched_at ?? '2026-07-16T00:00:00.000Z',
        transform_version: extra.transform_version ?? 'v1',
      },
    ],
  };
}

describe('NO_DATA_MARKER', () => {
  it('is a greppable, non-empty string that documents the do-not-fabricate rule', () => {
    expect(typeof NO_DATA_MARKER).toBe('string');
    expect(NO_DATA_MARKER).toMatch(/^NO-DATA:/);
    expect(NO_DATA_MARKER.toLowerCase()).toContain('do not fabricate');
  });
});

describe('scoreNiche -- hard triangulation rule', () => {
  it('REJECTS a 2-family candidate (attention + structural only, no money_in/stickiness)', () => {
    const result = scoreNiche([reading('attention', 0.5), reading('structural', 0.3)]);
    expect(result.triangulationPassed).toBe(false);
    expect(result.nicheScore).toBeNull();
    expect(result.families.sort()).toEqual(['attention', 'structural']);
  });

  it('ACCEPTS a 3-family candidate with money_in present (money_in + structural + attention)', () => {
    const result = scoreNiche([
      reading('money_in', 0.4),
      reading('structural', 0.2),
      reading('attention', 0.1),
    ]);
    expect(result.triangulationPassed).toBe(true);
    expect(typeof result.nicheScore).toBe('number');
    expect(Number.isFinite(result.nicheScore)).toBe(true);
    // 0.35*0.4 + 0.20*0.2 + 0.15*0.1 = 0.14 + 0.04 + 0.015 = 0.195
    expect(result.nicheScore).toBeCloseTo(0.195, 6);
    expect(result.families.sort()).toEqual(['attention', 'money_in', 'structural']);
  });

  it('ACCEPTS a 3-family candidate with stickiness present instead of money_in', () => {
    const result = scoreNiche([
      reading('stickiness', 0.6),
      reading('structural', 0.2),
      reading('attention', 0.1),
    ]);
    expect(result.triangulationPassed).toBe(true);
    expect(typeof result.nicheScore).toBe('number');
  });

  it('NEVER accepts an attention-only combination, even with multiple distinct attention-family readings', () => {
    const result = scoreNiche([
      reading('attention', 0.9, { source: 'google_trends' }),
      reading('attention', 5.0, { source: 'hypothetical_second_attention_source' }),
      reading('attention', 1000, { source: 'huge_magnitude_attention_source' }),
    ]);
    expect(result.triangulationPassed).toBe(false);
    expect(result.nicheScore).toBeNull();
    // All three readings collapse to ONE distinct family ('attention'), not three.
    expect(result.families).toEqual(['attention']);
  });

  it('rejects a 3-DISTINCT-family combination that lacks money_in/stickiness entirely (structural + attention + a hypothetical third non-required family)', () => {
    const result = scoreNiche([
      reading('structural', 0.5),
      reading('attention', 0.5),
      reading('some_other_family', 0.5),
    ]);
    expect(result.families.length).toBe(3);
    expect(result.triangulationPassed).toBe(false);
    expect(result.nicheScore).toBeNull();
  });

  it('treats slope_90d_vs_baseline: null (first-ever cycle, no baseline history) as NO reading -- never as zero', () => {
    const result = scoreNiche([
      reading('money_in', null),
      reading('stickiness', null),
      reading('structural', null),
      reading('attention', null),
    ]);
    expect(result.families).toEqual([]);
    expect(result.triangulationPassed).toBe(false);
    expect(result.nicheScore).toBeNull();
  });

  it('correctly ignores null-slope families when mixed with real-slope families (partial first-cycle data)', () => {
    // stickiness and attention have no baseline yet (null); only money_in and
    // structural have real slopes this cycle -- only 2 real families -> reject.
    const result = scoreNiche([
      reading('money_in', 0.4),
      reading('stickiness', null),
      reading('structural', 0.2),
      reading('attention', null),
    ]);
    expect(result.families.sort()).toEqual(['money_in', 'structural']);
    expect(result.triangulationPassed).toBe(false);
    expect(result.nicheScore).toBeNull();
  });

  it('handles an empty readings array as zero families, triangulation fails', () => {
    const result = scoreNiche([]);
    expect(result.families).toEqual([]);
    expect(result.triangulationPassed).toBe(false);
    expect(result.nicheScore).toBeNull();
  });
});

describe('scoreNiche -- weighted formula sanity checks', () => {
  it('computes a higher score for a 4-family candidate than an otherwise-identical 3-family candidate (same slopes, stickiness added)', () => {
    const threeFamily = scoreNiche([
      reading('money_in', 0.4),
      reading('structural', 0.2),
      reading('attention', 0.1),
    ]);
    const fourFamily = scoreNiche([
      reading('money_in', 0.4),
      reading('stickiness', 0.6),
      reading('structural', 0.2),
      reading('attention', 0.1),
    ]);

    expect(threeFamily.triangulationPassed).toBe(true);
    expect(fourFamily.triangulationPassed).toBe(true);
    expect(fourFamily.nicheScore).not.toBeCloseTo(threeFamily.nicheScore, 6);
    // Adding stickiness=0.6 at weight 0.30 should add exactly +0.18 to the score.
    expect(fourFamily.nicheScore - threeFamily.nicheScore).toBeCloseTo(0.3 * 0.6, 6);
    expect(fourFamily.nicheScore).toBeGreaterThan(threeFamily.nicheScore);
  });

  it('averages multiple readings within the same family before applying that family weight', () => {
    const result = scoreNiche([
      reading('money_in', 0.2, { source: 'a' }),
      reading('money_in', 0.6, { source: 'b' }), // avg money_in = 0.4
      reading('structural', 0.2),
      reading('attention', 0.1),
    ]);
    expect(result.families).toEqual(['money_in', 'structural', 'attention']);
    // 0.35*0.4 + 0.20*0.2 + 0.15*0.1 = 0.195 (identical to the single-reading case above)
    expect(result.nicheScore).toBeCloseTo(0.195, 6);
  });

  it('missing families contribute 0 to the weighted sum', () => {
    // Only money_in, structural, attention present -- stickiness absent entirely.
    const result = scoreNiche([
      reading('money_in', 1.0),
      reading('structural', 1.0),
      reading('attention', 1.0),
    ]);
    // 0.35 + 0.20 + 0.15 = 0.70 (stickiness's 0.30 weight contributes nothing)
    expect(result.nicheScore).toBeCloseTo(0.7, 6);
  });

  it('reasoning field is a non-empty string explaining the verdict in both pass and fail cases', () => {
    const failed = scoreNiche([reading('attention', 0.5)]);
    const passed = scoreNiche([reading('money_in', 0.5), reading('structural', 0.5), reading('attention', 0.5)]);
    expect(typeof failed.reasoning).toBe('string');
    expect(failed.reasoning.length).toBeGreaterThan(0);
    expect(typeof passed.reasoning).toBe('string');
    expect(passed.reasoning.length).toBeGreaterThan(0);
  });

  it('scoreNiche never sets hardScreenFailed itself (single-argument contract -- no niche metadata available)', () => {
    const passed = scoreNiche([reading('money_in', 0.5), reading('structural', 0.5), reading('attention', 0.5)]);
    const failed = scoreNiche([reading('attention', 0.5)]);
    expect(passed.hardScreenFailed).toBeNull();
    expect(failed.hardScreenFailed).toBeNull();
  });
});

describe('isHardScreenFailed', () => {
  it('flags a brand-moat category', () => {
    expect(isHardScreenFailed({ category: 'brand-moat' })).toBe('brand-moat');
  });

  it('flags a paid-acquisition-dominated category via keywords', () => {
    expect(
      isHardScreenFailed({ category: 'ecommerce', keywords: ['paid acquisition', 'CAC-heavy'] }),
    ).toBe('paid-acquisition-dominated');
  });

  it('flags a network-effect category', () => {
    expect(isHardScreenFailed({ category: 'network-effect' })).toBe('network-effect');
  });

  it('flags a platform-hostage category via description text', () => {
    expect(
      isHardScreenFailed({ category: 'mobile-app', description: 'Fully platform hostage to app store approval.' }),
    ).toBe('platform-hostage');
  });

  it('flags an enterprise-motion category via keywords', () => {
    expect(
      isHardScreenFailed({ category: 'b2b-saas', keywords: ['long enterprise sales cycle'] }),
    ).toBe('enterprise-motion');
  });

  it('returns null for a category not in the denylist', () => {
    expect(isHardScreenFailed({ category: 'wordpress-plugin-utility', keywords: ['simple', 'self-serve'] })).toBeNull();
  });

  it('returns null for missing/empty metadata', () => {
    expect(isHardScreenFailed(null)).toBeNull();
    expect(isHardScreenFailed(undefined)).toBeNull();
    expect(isHardScreenFailed({})).toBeNull();
  });
});
