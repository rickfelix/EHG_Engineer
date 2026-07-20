/**
 * SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001 (FR-3) — applyGraduation() title-similarity fix.
 *
 * THE BUG: the query selected `title` but never compared it -- any two findings sharing
 * application_domain + detected_by counted toward graduation regardless of content, so
 * near-automatic tier inflation resulted (everything eventually reaches 'high'). Fixed by
 * reusing lib/sourcing-engine/router.js's existing jaccard() (TR-1) to require genuine
 * title similarity before a past finding counts toward the consecutive-weeks count.
 */
import { describe, it, expect } from 'vitest';
import { applyGraduation } from '../../../lib/eva/consultant/confidence-engine.js';

function mockClient(pastFindings) {
  return {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        order: () => builder,
        range: () => Promise.resolve({ data: pastFindings, error: null }),
      };
      return builder;
    },
  };
}

function mediumCandidate(title, domain = 'cross_venture_reuse') {
  return { title, domain, tier: 'medium', confidenceScore: 0.5 };
}

describe('applyGraduation (FR-3)', () => {
  it('TS-3: past findings in the same domain with DISSIMILAR titles do NOT count toward graduation', async () => {
    const candidate = mediumCandidate('Potential capability reuse between EHG_Engineer and CronGenius');
    const dissimilarPast = [
      { recommendation_date: '2026-07-10', title: 'High-frequency issue pattern: unrelated topic entirely', application_domain: 'cross_venture_reuse' },
      { recommendation_date: '2026-07-03', title: 'Totally different finding about OKR drift', application_domain: 'cross_venture_reuse' },
    ];
    const [result] = await applyGraduation(mockClient(dissimilarPast), [candidate]);
    expect(result.tier).toBe('medium');
    expect(result.graduated).toBeUndefined();
  });

  it('TS-4: past findings with a GENUINELY SIMILAR title across 2+ consecutive occurrences DO graduate', async () => {
    const candidate = mediumCandidate('Potential capability reuse between EHG_Engineer and CronGenius');
    const similarPast = [
      { recommendation_date: '2026-07-10', title: 'Potential capability reuse between EHG_Engineer and CronGenius', application_domain: 'cross_venture_reuse' },
      { recommendation_date: '2026-07-03', title: 'Potential capability reuse between EHG_Engineer and CronGenius', application_domain: 'cross_venture_reuse' },
    ];
    const [result] = await applyGraduation(mockClient(similarPast), [candidate]);
    expect(result.tier).toBe('high');
    expect(result.graduated).toBe(true);
  });

  it('a mix of similar and dissimilar past findings only counts the similar ones', async () => {
    const candidate = mediumCandidate('Potential capability reuse between EHG_Engineer and CronGenius');
    const mixedPast = [
      { recommendation_date: '2026-07-10', title: 'Potential capability reuse between EHG_Engineer and CronGenius', application_domain: 'cross_venture_reuse' },
      { recommendation_date: '2026-07-08', title: 'Completely unrelated OKR finding', application_domain: 'cross_venture_reuse' },
      { recommendation_date: '2026-07-03', title: 'Potential capability reuse between EHG_Engineer and CronGenius', application_domain: 'cross_venture_reuse' },
    ];
    const [result] = await applyGraduation(mockClient(mixedPast), [candidate]);
    // 2 similar occurrences (07-10, 07-03) within the gap-reset window -> still graduates,
    // proving the unrelated 07-08 row is correctly excluded rather than accidentally helping.
    expect(result.tier).toBe('high');
  });

  it('already-high findings pass through untouched (no query needed)', async () => {
    const candidate = { title: 'x', domain: 'okr_drift', tier: 'high', confidenceScore: 0.8 };
    const [result] = await applyGraduation(mockClient([]), [candidate]);
    expect(result).toEqual(candidate);
  });

  it('no past findings at all -> stays medium, not graduated', async () => {
    const candidate = mediumCandidate('A brand new finding with no history');
    const [result] = await applyGraduation(mockClient([]), [candidate]);
    expect(result.tier).toBe('medium');
    expect(result.graduated).toBeUndefined();
  });
});
