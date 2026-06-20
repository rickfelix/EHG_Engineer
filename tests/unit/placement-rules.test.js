/**
 * SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001 (FR-2)
 * Pure tests for the vision-ladder placement rules. The revenue-placement rule must flag ONLY the
 * 4 named revenue capabilities when they sit on V1 — NEVER the 6 operational KR/governance
 * capabilities that correctly live on V1 (flagging those would, if it ever gated the gauge, suppress
 * the live chairman gauge).
 */
import { describe, it, expect } from 'vitest';
import { evaluatePlacement, REVENUE_CAPABILITIES, PLACEMENT_RULES, assertPlacementRulesValid } from '../../lib/vision/placement-rules.js';

const v1 = (capability, nature = 'buildable') => ({ capability, rung_key: 'V1', nature });
const v2 = (capability, nature = 'operational') => ({ capability, rung_key: 'V2', nature });

describe('placement-rules — revenue caps belong on V2 not V1 (FR-2)', () => {
  it('flags each of the 4 revenue capabilities when found on V1', () => {
    const criteria = REVENUE_CAPABILITIES.map((c) => v1(c, 'operational'));
    const { ok, violations } = evaluatePlacement(criteria);
    expect(ok).toBe(false);
    expect(violations).toHaveLength(4);
    expect(violations.map((x) => x.capability).sort()).toEqual([...REVENUE_CAPABILITIES].sort());
    for (const v of violations) expect(v.rule).toBe('REVENUE-NOT-IN-FOUNDATION');
  });

  it('does NOT flag the 6 legitimate operational KR/governance capabilities on V1', () => {
    const legitOperationalOnV1 = [
      'Solo-operator survivability',
      'A queryable, structured north star',
      'Governance cascade enforced',
      'OKR-driven prioritization + day-28 hard stop',
      'All 7 governance guardrails',
      'Competitive vigilance process established',
    ].map((c) => v1(c, 'operational'));
    const { ok, violations } = evaluatePlacement(legitOperationalOnV1);
    expect(ok).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag revenue capabilities when correctly placed on V2', () => {
    const criteria = REVENUE_CAPABILITIES.map((c) => v2(c));
    expect(evaluatePlacement(criteria).ok).toBe(true);
  });

  it('does NOT flag ordinary buildable capabilities on V1', () => {
    const criteria = [v1('Capability Registry'), v1('Calibrate the gates'), v1('Backlog distilled and dispositioned')];
    expect(evaluatePlacement(criteria).ok).toBe(true);
  });

  it('mixed set: flags only the misplaced revenue cap among correct ones', () => {
    const criteria = [
      v1('Solo-operator survivability', 'operational'), // legit operational on V1
      v1('Capability Registry'),                        // legit buildable on V1
      v1('Take a real dollar', 'operational'),          // MISPLACED revenue cap on V1
      v2('See distance-to-quit'),                       // correct revenue cap on V2
    ];
    const { violations } = evaluatePlacement(criteria);
    expect(violations).toHaveLength(1);
    expect(violations[0].capability).toBe('Take a real dollar');
  });
});

describe('placement-rules — purity & robustness', () => {
  it('is total: never throws on hostile/empty input', () => {
    expect(evaluatePlacement(null)).toEqual({ ok: true, violations: [] });
    expect(evaluatePlacement(undefined)).toEqual({ ok: true, violations: [] });
    expect(evaluatePlacement([null, {}, { capability: 'x' }, 42])).toEqual({ ok: true, violations: [] });
  });

  it('REVENUE_CAPABILITIES is the exact frozen 4-set', () => {
    expect(REVENUE_CAPABILITIES).toEqual([
      'Take a real dollar', 'See distance-to-quit', 'Run a self-operating venture', 'Compound venture-level learning',
    ]);
    expect(Object.isFrozen(REVENUE_CAPABILITIES)).toBe(true);
  });

  it('registry is coherent (loud-at-import guard passes)', () => {
    expect(assertPlacementRulesValid()).toBe(true);
    expect(PLACEMENT_RULES.length).toBeGreaterThanOrEqual(1);
  });
});
