/**
 * FR-1/FR-2/FR-3 — S7 acquisition-tier rubric
 * SD-LEO-INFRA-S7-ACQUISITION-TIER-RUBRIC-001
 *
 * DERIVE the top-of-funnel decision from segment/GTM motion instead of LLM discretion.
 * Root-cause: venture-1 S7 produced no free teaser and the chairman restored it manually.
 */
import { describe, it, expect } from 'vitest';
import {
  extractSegmentGtmSignals,
  deriveAcquisitionTier,
  applyAcquisitionTier,
} from '../../../lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy.js';

describe('deriveAcquisitionTier (FR-1)', () => {
  it('self-serve segment -> free/freemium teaser, permanentFree true', () => {
    const rec = deriveAcquisitionTier({ selfServe: true });
    expect(rec.recommendation).toBe('free_teaser');
    expect(rec.permanentFree).toBe(true);
    expect(['free', 'freemium']).toContain(rec.tierType);
  });

  it('enterprise / high-ACV segment -> trial/demo, NO permanent free tier', () => {
    const rec = deriveAcquisitionTier({ highAcv: true });
    expect(rec.recommendation).toBe('trial_demo');
    expect(rec.permanentFree).toBe(false);
    expect(['trial', 'demo']).toContain(rec.tierType);
  });

  it('dual-segment -> dual recommendation, permanentFree true', () => {
    const rec = deriveAcquisitionTier({ selfServe: true, highAcv: true });
    expect(rec.recommendation).toBe('dual');
    expect(rec.permanentFree).toBe(true);
  });

  it('unknown / insufficient signal -> conservative default (no permanent free tier)', () => {
    const rec = deriveAcquisitionTier({});
    expect(rec.recommendation).toBe('trial_demo');
    expect(rec.permanentFree).toBe(false);
  });
});

describe('extractSegmentGtmSignals (FR-2)', () => {
  it('self-serve language in targetMarket yields selfServe:true', () => {
    const s = extractSegmentGtmSignals({ stage1Data: { targetMarket: 'Self-serve PLG tool for indie developers' } });
    expect(s.selfServe).toBe(true);
    expect(s.highAcv).toBe(false);
    expect(s.source).toBe('stage1');
  });

  it('enterprise / sales-led language yields highAcv:true', () => {
    const s = extractSegmentGtmSignals({ stage1Data: { targetMarket: 'Enterprise, sales-led with procurement and RFP cycles' } });
    expect(s.highAcv).toBe(true);
    expect(s.selfServe).toBe(false);
  });

  it('both self-serve and enterprise signals present yields dual:true', () => {
    const s = extractSegmentGtmSignals({ stage1Data: { targetMarket: 'SMB self-serve plus enterprise sales-led accounts' } });
    expect(s.dual).toBe(true);
    expect(s.selfServe).toBe(true);
    expect(s.highAcv).toBe(true);
  });

  it('ratified stage_zero segment overrides a conflicting weaker keyword signal', () => {
    // stage1 keyword says self-serve, but the ratified stage_zero segment says enterprise -> enterprise wins.
    const s = extractSegmentGtmSignals({
      stage1Data: { targetMarket: 'self-serve developers' },
      stageZeroSegment: 'Enterprise sales-led accounts',
    });
    expect(s.source).toBe('stage_zero');
    expect(s.highAcv).toBe(true);
    expect(s.selfServe).toBe(false);
  });
});

describe('applyAcquisitionTier (FR-3)', () => {
  const paidTiers = [
    { name: 'Pro', price: 49, billing_period: 'monthly', target_segment: 'Teams' },
    { name: 'Business', price: 199, billing_period: 'monthly', target_segment: 'Orgs' },
  ];

  it('self-serve recommendation adds a teaser tier and leaves paid tiers byte-identical', () => {
    const rec = deriveAcquisitionTier({ selfServe: true });
    const { tiers, added } = applyAcquisitionTier(paidTiers, rec);
    expect(added).toBe(true);
    // teaser prepended
    expect(tiers[0].price).toBe(0);
    expect(tiers[0].acquisition_tier).toBe(true);
    // competitor-anchored paid tiers unchanged (name + price byte-identical)
    const pro = tiers.find(t => t.name === 'Pro');
    const biz = tiers.find(t => t.name === 'Business');
    expect(pro.price).toBe(49);
    expect(biz.price).toBe(199);
    // original input array not mutated (pure function)
    expect(paidTiers).toHaveLength(2);
  });

  it('dual-segment recommendation adds a teaser AND retains the paid tiers', () => {
    const rec = deriveAcquisitionTier({ selfServe: true, highAcv: true });
    const { tiers, added } = applyAcquisitionTier(paidTiers, rec);
    expect(added).toBe(true);
    expect(tiers).toHaveLength(3);
    expect(tiers.filter(t => t.price > 0).map(t => t.name)).toEqual(['Pro', 'Business']);
  });

  it('enterprise recommendation does not leave a permanent free tier (converts price-0 to trial)', () => {
    const rec = deriveAcquisitionTier({ highAcv: true });
    const withFree = [{ name: 'Free', price: 0 }, ...paidTiers];
    const { tiers, added, converted } = applyAcquisitionTier(withFree, rec);
    expect(added).toBe(false);
    expect(converted).toBe(true);
    const free = tiers.find(t => Number(t.price) === 0);
    expect(free.trial).toBe(true); // no longer a permanent free tier
  });

  it('does not add a second teaser when a free tier already exists (self-serve)', () => {
    const rec = deriveAcquisitionTier({ selfServe: true });
    const withFree = [{ name: 'Free', price: 0 }, ...paidTiers];
    const { tiers, added } = applyAcquisitionTier(withFree, rec);
    expect(added).toBe(false);
    expect(tiers.filter(t => Number(t.price) === 0)).toHaveLength(1);
  });
});
