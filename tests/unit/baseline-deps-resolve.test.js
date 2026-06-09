/**
 * SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001
 * Network-free unit tests for the deps_satisfied dependency-shape resolver
 * (lib/sd-baseline/deps-resolve.js), the JS mirror of the v_sd_next_candidates
 * SQL. Also asserts buildBaselineItemRow never emits a UUID sd_id (regression
 * for the removed `|| sd.id` fallback).
 */
import { describe, it, expect } from 'vitest';
import { resolveDepRef, computeDepsSatisfied } from '../../lib/sd-baseline/deps-resolve.js';
import { buildBaselineItemRow } from '../../lib/sd-baseline/build-item.js';

// lookup fixtures: SD-DONE-001 completed, SD-OPEN-001 incomplete, anything else unknown.
const lookup = (ref) =>
  ref === 'SD-DONE-001' ? 'completed'
  : ref === 'SD-OPEN-001' ? 'incomplete'
  : null;

describe('resolveDepRef — element shapes', () => {
  it('string: first space-delimited token', () => {
    expect(resolveDepRef('SD-OPEN-001 (foundational)')).toBe('SD-OPEN-001');
    expect(resolveDepRef('SD-DONE-001')).toBe('SD-DONE-001');
  });
  it('object: sd_key > sd_id > orchestrator precedence', () => {
    expect(resolveDepRef({ sd_key: 'SD-OPEN-001' })).toBe('SD-OPEN-001');
    expect(resolveDepRef({ sd_id: 'SD-OPEN-001' })).toBe('SD-OPEN-001');
    expect(resolveDepRef({ orchestrator: 'SD-OPEN-001' })).toBe('SD-OPEN-001');
    expect(resolveDepRef({ sd_key: 'SD-A', sd_id: 'SD-B' })).toBe('SD-A');
  });
  it('null / empty / non-object -> null', () => {
    expect(resolveDepRef(null)).toBeNull();
    expect(resolveDepRef({})).toBeNull();
    expect(resolveDepRef(42)).toBeNull();
    expect(resolveDepRef([])).toBeNull();
  });
});

describe('computeDepsSatisfied — fail-open semantics', () => {
  it('object dep referencing a COMPLETED SD -> satisfied (TS-1)', () => {
    expect(computeDepsSatisfied([{ sd_id: 'SD-DONE-001' }], lookup)).toBe(true);
  });
  it('object dep referencing a NON-completed SD -> NOT satisfied (TS-2)', () => {
    expect(computeDepsSatisfied([{ sd_id: 'SD-OPEN-001' }], lookup)).toBe(false);
  });
  it('string dep "SD-OPEN-001 (foundational)" referencing non-completed -> NOT satisfied', () => {
    expect(computeDepsSatisfied(['SD-OPEN-001 (foundational)'], lookup)).toBe(false);
  });
  it('none / null snapshot / prose / unresolvable -> satisfied (TS-3)', () => {
    expect(computeDepsSatisfied([{ sd_key: 'none', description: 'No blocking dependencies' }], lookup)).toBe(true);
    expect(computeDepsSatisfied(null, lookup)).toBe(true);
    expect(computeDepsSatisfied([], lookup)).toBe(true);
    expect(computeDepsSatisfied(['Access to EHG application codebase'], lookup)).toBe(true);
    expect(computeDepsSatisfied([{ sd_id: 'SD-UNKNOWN-999' }], lookup)).toBe(true);
  });
  it('mixed: one completed + one incomplete -> NOT satisfied (any blocker blocks)', () => {
    expect(computeDepsSatisfied([{ sd_id: 'SD-DONE-001' }, { sd_id: 'SD-OPEN-001' }], lookup)).toBe(false);
  });
});

describe('buildBaselineItemRow — never emits a UUID sd_id (TS-6)', () => {
  it('uses sd_key, not the UUID id', () => {
    const row = buildBaselineItemRow({
      sd: { sd_key: 'SD-FOO-001', id: '11111111-2222-3333-4444-555555555555', dependencies: null, metadata: {} },
      baselineId: 'b-1', sequenceRank: 1, healthScore: 1.0,
    });
    expect(row.sd_id).toBe('SD-FOO-001');
    expect(row.sd_id).not.toMatch(/^[0-9a-f]{8}-/);
  });
  it('throws when sd_key is absent (no silent UUID fallback)', () => {
    expect(() => buildBaselineItemRow({
      sd: { id: '11111111-2222-3333-4444-555555555555' },
      baselineId: 'b-1', sequenceRank: 1, healthScore: 1.0,
    })).toThrow(/sd_key is required/);
  });
});
