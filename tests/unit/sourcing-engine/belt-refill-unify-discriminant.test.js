/**
 * SD-LEO-INFRA-UNIFY-BELT-REFILL-001 (FR-1) — unify the belt-refill discriminant onto item_disposition.
 *
 * Before this SD the belt auto-refill NEVER worked: hasBuildDisposition read a SEPARATE, never-populated
 * item.disposition/metadata.disposition field ('build'), while the real column roadmap_wave_items
 * .item_disposition never carried 'build' — a two-field / zero-overlap schism that starved the fleet.
 * These tests pin the unified discriminant: item_disposition === 'selected' is build-eligible; the
 * NOT_STAGED lifecycle gate now admits {'pending','selected'}; and the >0-candidates regression proof.
 */
import { describe, it, expect } from 'vitest';
import {
  hasBuildDisposition,
  evaluateRefillCandidate,
  BUILD_DISPOSITIONS,
  STAGED_DISPOSITIONS,
  REFILL_INVALID_REASONS,
} from '../../../lib/sourcing-engine/refill-candidate-validity.js';
import { selectRefillBatch } from '../../../lib/sourcing-engine/refill-auto-promote.js';

// A well-formed staged refill candidate; item_disposition overridden per case.
const validItem = (over = {}) => ({
  item_disposition: 'selected',
  promoted_to_sd_key: null,
  title: 'Harden the worktree reaper against orphaned junctions',
  source_type: 'conversion_ledger',
  source_id: '11111111-1111-1111-1111-111111111111',
  lane: 'belt',
  ...over,
});

describe('FR-1a: BUILD_DISPOSITIONS is the unified marker', () => {
  it("contains 'selected' and does NOT contain 'build'", () => {
    expect(BUILD_DISPOSITIONS.has('selected')).toBe(true);
    expect(BUILD_DISPOSITIONS.has('build')).toBe(false);
  });
  it("STAGED_DISPOSITIONS admits exactly {'pending','selected'}", () => {
    expect(STAGED_DISPOSITIONS.has('pending')).toBe(true);
    expect(STAGED_DISPOSITIONS.has('selected')).toBe(true);
    expect(STAGED_DISPOSITIONS.has('deferred')).toBe(false);
    expect(STAGED_DISPOSITIONS.has('promoted')).toBe(false);
  });
});

describe('FR-1b: hasBuildDisposition reads item_disposition (TS-1)', () => {
  it("true for item_disposition='selected'", () => {
    expect(hasBuildDisposition({ item_disposition: 'selected' })).toBe(true);
  });
  it('false for pending / deferred / dropped / brainstormed / promoted / null / absent', () => {
    expect(hasBuildDisposition({ item_disposition: 'pending' })).toBe(false);
    expect(hasBuildDisposition({ item_disposition: 'deferred' })).toBe(false);
    expect(hasBuildDisposition({ item_disposition: 'dropped' })).toBe(false);
    expect(hasBuildDisposition({ item_disposition: 'brainstormed' })).toBe(false);
    // 'promoted' is already-promoted (not a refill candidate) — intentionally NOT build-eligible.
    expect(hasBuildDisposition({ item_disposition: 'promoted' })).toBe(false);
    expect(hasBuildDisposition({ item_disposition: null })).toBe(false);
    expect(hasBuildDisposition({})).toBe(false);
    expect(hasBuildDisposition(null)).toBe(false);
  });
  it('still honors the inert legacy disposition==="build" fallback (backward-compat)', () => {
    expect(hasBuildDisposition({ disposition: 'build' })).toBe(true);
    expect(hasBuildDisposition({ metadata: { disposition: 'build' } })).toBe(true);
  });
});

describe('FR-1c: NOT_STAGED gate admits pending + selected (TS-2)', () => {
  it("a 'selected' item passes the lifecycle gate and reaches CHECK #11 (and passes it under distilledOnly)", () => {
    const v = evaluateRefillCandidate(validItem({ item_disposition: 'selected' }), { distilledOnly: true });
    expect(v).toEqual({ valid: true, reason: null });
  });
  it("the identical 'pending' item is rejected at CHECK #11 (UNDISPOSITIONED_OR_NON_BUILD), NOT at NOT_STAGED", () => {
    const v = evaluateRefillCandidate(validItem({ item_disposition: 'pending' }), { distilledOnly: true });
    expect(v).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.UNDISPOSITIONED_OR_NON_BUILD });
  });
  it('deferred / brainstormed / dropped / promoted / null still report NOT_STAGED', () => {
    for (const d of ['deferred', 'brainstormed', 'dropped', 'promoted', null]) {
      expect(evaluateRefillCandidate(validItem({ item_disposition: d })).reason)
        .toBe(REFILL_INVALID_REASONS.NOT_STAGED);
    }
  });
  it("a 'pending' item still passes the lifecycle gate when distilledOnly is OFF (legacy behavior)", () => {
    // NOT_STAGED must admit pending; with the flag off CHECK #11 is inert so it is fully valid.
    expect(evaluateRefillCandidate(validItem({ item_disposition: 'pending' }))).toEqual({ valid: true, reason: null });
  });
});

describe('FR-1 REGRESSION PROOF (TS-3 / AC-4): the belt now produces >0 candidates', () => {
  it("a chairman-accepted (item_disposition='selected') unpromoted item is selected onto the belt batch", () => {
    const rows = [
      validItem({ item_disposition: 'selected', source_id: 'rw-accepted' }),
      // an un-accepted 'pending' sibling must NOT flood the belt under the default fail-closed gate
      validItem({ item_disposition: 'pending', source_id: 'rw-pending' }),
    ];
    const sel = selectRefillBatch(rows, { distilledOnly: true });
    expect(sel.validCount).toBeGreaterThanOrEqual(1);
    const ids = sel.batch.map((b) => b.source_id);
    expect(ids).toContain('rw-accepted');
    expect(ids).not.toContain('rw-pending');
  });

  it('flood-safety (TS-6): with 0 selected items, the belt batch is empty even amid many pending rows', () => {
    const rows = Array.from({ length: 20 }, (_, i) => validItem({ item_disposition: 'pending', source_id: `rw-${i}` }));
    const sel = selectRefillBatch(rows, { distilledOnly: true });
    expect(sel.batch).toHaveLength(0);
  });
});
