/**
 * SD-LEO-INFRA-CRITICAL-WALK-BLOCKER-OUTRANKS-PRODUCT-PIVOT-001 (FR-1/FR-2/FR-3/FR-4)
 *
 * The backlog ranker's product-pivot band ranks ANY product-class SD above ANY harness-class SD when
 * the pivot is active — so a thin MED product idea-note outranked a HIGH critical S19 walk-blocker, and
 * the only override (the fleet-critical band) required a RUNTIME metadata.fleet_critical hand-set.
 *
 * The fix generalizes the band predicate to isCriticalWalkBlocker = STRICT-true on ANY of three DURABLE
 * SOURCING-TIME signals (fleet_critical | convergence_caught | blocks_active_mission), so an Adam-sourced
 * walk-blocker outranks the product-pivot band WITHOUT a runtime hand-set. The product-pivot bias is
 * preserved for every NON-critical-walk-blocker SD.
 *
 * These tests lock down (a) the gating predicate and (b) the ordering contract: the critical-walk-blocker
 * band sits ABOVE the product-pivot band, which sits ABOVE priority. The full comparator's placement
 * (above unlock+needle, below the bare-shell/quarantine gates) is exercised live by the dry-run dogfood.
 */
import { describe, it, expect } from 'vitest';
import {
  isCriticalWalkBlocker,
  isFleetCritical,
  productPivotCompare,
  productPivotRank,
} from '../../scripts/coordinator-backlog-rank.mjs';

describe('SD-...-CRITICAL-WALK-BLOCKER: isCriticalWalkBlocker predicate', () => {
  it('is true for fleet_critical===true (backward-compat: a superset of isFleetCritical)', () => {
    const d = { metadata: { fleet_critical: true } };
    expect(isCriticalWalkBlocker(d)).toBe(true);
    expect(isFleetCritical(d)).toBe(true); // fleet_critical is still its own narrower predicate
  });

  it('is true for the new sourcing-time signals convergence_caught / blocks_active_mission ===true', () => {
    expect(isCriticalWalkBlocker({ metadata: { convergence_caught: true } })).toBe(true);
    expect(isCriticalWalkBlocker({ metadata: { blocks_active_mission: true } })).toBe(true);
    // ...but these are NOT fleet_critical (so the dispatch-lane audit/cap only counts hand-set ones).
    expect(isFleetCritical({ metadata: { convergence_caught: true } })).toBe(false);
  });

  it('is false for false / undefined / missing metadata', () => {
    expect(isCriticalWalkBlocker({ metadata: { fleet_critical: false, convergence_caught: false } })).toBe(false);
    expect(isCriticalWalkBlocker({ metadata: {} })).toBe(false);
    expect(isCriticalWalkBlocker({})).toBe(false);
    expect(isCriticalWalkBlocker({ metadata: null })).toBe(false);
  });

  it('is STRICT — a truthy-but-not-true value does NOT enrol (anti-gaming) on ANY key', () => {
    for (const v of [1, 'true', 'yes', {}, []]) {
      expect(isCriticalWalkBlocker({ metadata: { fleet_critical: v } })).toBe(false);
      expect(isCriticalWalkBlocker({ metadata: { convergence_caught: v } })).toBe(false);
      expect(isCriticalWalkBlocker({ metadata: { blocks_active_mission: v } })).toBe(false);
    }
  });
});

describe('SD-...-CRITICAL-WALK-BLOCKER: ordering contract (band above product-pivot above priority)', () => {
  // Mirror the relevant slice of the real comparator: critical-walk-blocker band, then product-pivot
  // band (when active), then priority. (Higher priority weight sorts earlier.)
  const PW = { critical: 3, high: 2, medium: 1, med: 1, low: 0 };
  const cmp = (a, b) => {
    const fa = isCriticalWalkBlocker(a) ? 1 : 0, fb = isCriticalWalkBlocker(b) ? 1 : 0;
    if (fa !== fb) return fb - fa;                 // critical-walk-blocker first
    const pp = productPivotCompare(a, b);
    if (pp !== 0) return pp;                        // then product-pivot band (always active)
    return (PW[(b.priority || '').toLowerCase()] ?? 0) - (PW[(a.priority || '').toLowerCase()] ?? 0);
  };

  const harnessWalkBlocker = { sd_key: 'SD-LEO-INFRA-S19-PROMOTE-ORDER-001', priority: 'high', metadata: { convergence_caught: true } };
  const productNote = { sd_key: 'SD-EHG-PRODUCT-IDEA-NOTE-001', priority: 'medium', metadata: {} };
  const routineHarness = { sd_key: 'SD-LEO-INFRA-ROUTINE-001', priority: 'medium', metadata: {} };

  it('FR-1/FR-3: a HIGH critical-walk-blocker (convergence_caught, sourcing-time) outranks a MED product note WITHOUT a runtime fleet_critical', () => {
    expect(isFleetCritical(harnessWalkBlocker)).toBe(false); // no runtime hand-set
    expect(cmp(harnessWalkBlocker, productNote)).toBeLessThan(0);   // walk-blocker first
    expect(cmp(productNote, harnessWalkBlocker)).toBeGreaterThan(0);
  });

  it('FR-2: a routine MED harness SD still ranks BELOW a MED product SD (product bias preserved)', () => {
    expect(productPivotRank(productNote)).toBe(0);     // product band first
    expect(productPivotRank(routineHarness)).toBe(2);  // harness band last
    expect(cmp(productNote, routineHarness)).toBeLessThan(0);       // product first
    expect(cmp(routineHarness, productNote)).toBeGreaterThan(0);
  });

  it('the S19-PROMOTE-ORDER-style walk-blocker ranks #1 among {product note, routine harness} with the pivot active', () => {
    const ranked = [productNote, routineHarness, harnessWalkBlocker].sort((a, b) => cmp(a, b));
    expect(ranked[0]).toBe(harnessWalkBlocker);
  });

  it('fleet_critical===true still enrols the band (backward-compat with the dispatch-lane SD)', () => {
    const legacy = { sd_key: 'SD-LEO-INFRA-LEGACY-001', priority: 'medium', metadata: { fleet_critical: true } };
    expect(cmp(legacy, productNote)).toBeLessThan(0); // legacy fleet_critical still outranks product
  });
});
