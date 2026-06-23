/**
 * SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-1/FR-2): the fleet-critical operational band.
 * isFleetCritical is the NARROW, EXPLICIT predicate (metadata.fleet_critical === true) used by the
 * backlog ranker to lift a needle-0 fleet-health SD above the gauge-needle backlog WITHOUT a fake
 * rung or manual dispatch. STRICT === true so it cannot be enrolled by a stray truthy value.
 * The band-ordering itself (fleet-critical above unlock+needle, below the quality gates) is exercised
 * live by the FR-4 dogfood (stamp + backlog-rank --dry-run); here we lock down the gating predicate
 * and the band-comparator contract.
 */
import { describe, it, expect } from 'vitest';
import { isFleetCritical } from '../../scripts/coordinator-backlog-rank.mjs';

describe('SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001: isFleetCritical', () => {
  it('is true ONLY for metadata.fleet_critical === true', () => {
    expect(isFleetCritical({ metadata: { fleet_critical: true } })).toBe(true);
  });

  it('is false for false / undefined / missing metadata (default: not fleet-critical)', () => {
    expect(isFleetCritical({ metadata: { fleet_critical: false } })).toBe(false);
    expect(isFleetCritical({ metadata: {} })).toBe(false);
    expect(isFleetCritical({})).toBe(false);
    expect(isFleetCritical({ metadata: null })).toBe(false);
  });

  it('is STRICT — a truthy-but-not-true value does NOT enrol (anti-gaming: no accidental floats)', () => {
    for (const v of [1, 'true', 'yes', {}, []]) {
      expect(isFleetCritical({ metadata: { fleet_critical: v } })).toBe(false);
    }
  });

  it('band-comparator contract: a fleet_critical SD sorts BEFORE a non-critical one (even higher-unlock)', () => {
    // Mirrors the 2-line band in the ranker (applied above unlock+needle): fleet-critical first.
    const band = (a, b) => (isFleetCritical(b) ? 1 : 0) - (isFleetCritical(a) ? 1 : 0);
    const critical = { metadata: { fleet_critical: true } };
    const backlog = { metadata: {} };
    expect(band(critical, backlog)).toBeLessThan(0);   // critical ranks first
    expect(band(backlog, critical)).toBeGreaterThan(0);
    expect(band(critical, critical)).toBe(0);          // ties fall through to unlock/needle/priority
  });
});
