/**
 * SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-3): lib/roadmap/plan-linkage-retro.js — TS-5.
 * Pure payload/delta computation, isolated from Date.now()/DB so it doesn't need mocking.
 */
import { describe, it, expect } from 'vitest';
import { buildPlanLinkageRetroPayload, PLAN_LINKAGE_RETRO_CATEGORY, PLAN_LINKAGE_RETRO_DEDUP_KEY } from '../../../lib/roadmap/plan-linkage-retro.js';

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001: buildPlanLinkageRetroPayload', () => {
  it('TS-5: with no prior run, delta_vs_prior_run is null', () => {
    const payload = buildPlanLinkageRetroPayload({ coverage: 0.5, linked: 5, total: 10 }, null);
    expect(payload.category).toBe(PLAN_LINKAGE_RETRO_CATEGORY);
    expect(payload.dedup_key).toBe(PLAN_LINKAGE_RETRO_DEDUP_KEY);
    expect(payload.metadata.coverage).toBe(0.5);
    expect(payload.metadata.delta_vs_prior_run).toBeNull();
    expect(payload.description).toMatch(/no prior run/);
  });

  it('TS-5: delta reflects the actual coverage change between two runs (increase)', () => {
    const prior = { metadata: { coverage: 0.5 } };
    const payload = buildPlanLinkageRetroPayload({ coverage: 0.7, linked: 7, total: 10 }, prior);
    expect(payload.metadata.delta_vs_prior_run).toBe(20); // 70% - 50% = +20pp
    expect(payload.description).toMatch(/\+20pp/);
  });

  it('TS-5: delta reflects a decreasing (growing unlinked share) trend', () => {
    const prior = { metadata: { coverage: 0.8 } };
    const payload = buildPlanLinkageRetroPayload({ coverage: 0.6, linked: 6, total: 10 }, prior);
    expect(payload.metadata.delta_vs_prior_run).toBe(-20);
    expect(payload.description).toMatch(/-20pp/);
  });

  it('handles the 0-claimable-leaves case (coverage=null) without throwing', () => {
    const payload = buildPlanLinkageRetroPayload({ coverage: null, linked: 0, total: 0 }, null);
    expect(payload.metadata.coverage).toBeNull();
    expect(payload.metadata.delta_vs_prior_run).toBeNull();
    expect(payload.description).toMatch(/n\/a/);
  });

  it('a stable dedup_key (not date/coverage-dependent) is used so same-day identical runs dedup via emitFeedback', () => {
    const p1 = buildPlanLinkageRetroPayload({ coverage: 0.5, linked: 5, total: 10 }, null);
    const p2 = buildPlanLinkageRetroPayload({ coverage: 0.5, linked: 5, total: 10 }, null);
    expect(p1.dedup_key).toBe(p2.dedup_key);
    expect(p1.description).toBe(p2.description); // identical inputs -> identical description -> same dedup_hash
  });
});
