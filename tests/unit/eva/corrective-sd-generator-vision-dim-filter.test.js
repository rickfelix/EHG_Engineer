/**
 * QF-20260610-124: V-dim strip for readonly/bugfix/documentation sources.
 *
 * The 5b source-class filter stripped A01-A05 for suppressed sources but let
 * V-dims pass, so narrow bugfix/infra SDs emitted P1 vision-gap findings (all 5
 * corrective_finding rows ever emitted hit this class; all triaged wont_fix).
 * These pin the pure strip helper both directions: readonly verdicts strip V+A,
 * lifecycle_feature stays A-only, genuine write sources classify to null (never
 * reach the strip at all), and non-V/non-A dims always pass through.
 */

import { describe, it, expect } from 'vitest';
// NOTE: no supabase-js mock needed — every export under test is pure, and the
// generator module only constructs its client lazily inside _getSupabase()
// (never at import time), so this suite is genuinely DB-free (Stage-1.6 clean).
import {
  classifySourceSD,
  _stripSuppressedDims,
  VISION_SUPPRESSED_REASONS,
} from '../../../scripts/eva/corrective-sd-generator.mjs';

const dim = (dimId) => ({ dimId, dimensionName: `dim ${dimId}`, score: 1 });
const group = (...dimIds) => ({ dims: dimIds.map(dim), sdType: 'corrective', category: 'corrective', label: 'Vision' });

describe('VISION_SUPPRESSED_REASONS membership (FR-1/FR-5)', () => {
  it('contains exactly the readonly verdicts — lifecycle_feature excluded', () => {
    expect([...VISION_SUPPRESSED_REASONS].sort()).toEqual(['cli_validation', 'documentation', 'readonly_bugfix']);
  });
});

describe('_stripSuppressedDims — readonly verdicts strip V-dims (FR-1)', () => {
  it('(a) bugfix source with a weak V-dim: finding suppressed (STAGE-RENDERER V04 regression)', () => {
    const groups = [group('V04')];
    const out = _stripSuppressedDims(groups, 'readonly_bugfix');
    expect(out.suppressedVision).toEqual(['V04']);
    expect(groups).toHaveLength(0); // empty group dropped -> nothing emits
  });

  it('(b) cli/infra source with V04/V06: both suppressed (COMPLETION-FLAG-HARNESS regression)', () => {
    const groups = [group('V04', 'V06')];
    const out = _stripSuppressedDims(groups, 'cli_validation');
    expect(out.suppressedVision).toEqual(['V04', 'V06']);
    expect(groups).toHaveLength(0);
  });

  it('(d) mixed V+A groups on a readonly source: both stripped, empty groups dropped', () => {
    const groups = [group('V03'), group('A04', 'A05')];
    const out = _stripSuppressedDims(groups, 'readonly_bugfix');
    expect(out.suppressedVision).toEqual(['V03']);
    expect(out.suppressedArch).toEqual(['A04', 'A05']);
    expect(groups).toHaveLength(0);
  });

  it('documentation verdict also strips V-dims', () => {
    const groups = [group('V01')];
    expect(_stripSuppressedDims(groups, 'documentation').suppressedVision).toEqual(['V01']);
    expect(groups).toHaveLength(0);
  });

  it('non-V/non-A dims always pass through (group kept, V/A removed from it)', () => {
    const groups = [{ ...group('V02', 'X01'), label: 'Vision' }];
    const out = _stripSuppressedDims(groups, 'cli_validation');
    expect(out.suppressedVision).toEqual(['V02']);
    expect(groups).toHaveLength(1);
    expect(groups[0].dims.map(d => d.dimId)).toEqual(['X01']);
  });
});

describe('_stripSuppressedDims — conservative defaults preserved (FR-2)', () => {
  it('lifecycle_feature keeps V-dims (A-dims-only strip, prior behavior byte-identical)', () => {
    const groups = [group('V04'), group('A05')];
    const out = _stripSuppressedDims(groups, 'lifecycle_feature');
    expect(out.suppressedVision).toEqual([]);
    expect(out.suppressedArch).toEqual(['A05']);
    expect(groups).toHaveLength(1);
    expect(groups[0].dims.map(d => d.dimId)).toEqual(['V04']);
  });

  it('(c) genuine write/feature source classifies to null — never reaches the strip (PROVISIONING-PARITY regression)', () => {
    // SD-LEO-FIX-VENTURE-PROVISIONING-PARITY-001 shape: write keywords >= 2 -> null verdict
    const sd = {
      sd_type: 'bugfix',
      title: 'Fix venture provisioning parity',
      description: 'persist provisioning rows and emit lifecycle events; insert missing records',
      scope: 'provisioning insert/update paths',
      key_changes: [{ change: 'persist + publish parity events', impact: 'rows inserted' }],
    };
    expect(classifySourceSD(sd)).toBeNull(); // suppress=false -> V- AND A-dims both still emit
  });

  it('null reason strips nothing vision-side (defensive: stripVision is verdict-gated)', () => {
    const groups = [group('V04')];
    const out = _stripSuppressedDims(groups, null);
    expect(out.suppressedVision).toEqual([]);
    expect(groups).toHaveLength(1);
  });
});
