import { describe, it, expect } from 'vitest';
import { inferDefaultSdTypeFromKey, resolveSdType } from '../../scripts/leo-create-sd.js';
import { deriveSdFieldsFromRoadmapItem } from '../../lib/sourcing-engine/register-first.js';

// SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001: the leo-create-sd type-inference path defaults a TYPELESS
// SD-LEO-* / SD-MAN-INFRA-* / SD-LEARN-FIX- key to 'infrastructure' (harness work is infra by
// definition), killing the per-SD feature->infra reclassify tax. An explicit type always wins;
// product keys (SD-EHG-*) still default 'feature'.

describe('inferDefaultSdTypeFromKey (FR-1)', () => {
  it('returns infrastructure for the harness key prefixes', () => {
    expect(inferDefaultSdTypeFromKey('SD-LEO-INFRA-FOO-001')).toBe('infrastructure');
    expect(inferDefaultSdTypeFromKey('SD-LEO-FEAT-FOO-001')).toBe('infrastructure');
    expect(inferDefaultSdTypeFromKey('SD-MAN-INFRA-BAR-001')).toBe('infrastructure');
    expect(inferDefaultSdTypeFromKey('SD-LEARN-FIX-BAZ-001')).toBe('infrastructure');
  });

  it('returns null for product / non-harness keys (caller falls back to feature)', () => {
    expect(inferDefaultSdTypeFromKey('SD-EHG-MARKETING-001')).toBeNull();
    expect(inferDefaultSdTypeFromKey('SD-FDBK-INFRA-001')).toBeNull();
    expect(inferDefaultSdTypeFromKey('SD-2025-001')).toBeNull();
  });

  it('does not over-match a longer token that merely starts with the prefix letters', () => {
    // SD-LEONARDO-* must NOT be treated as SD-LEO- (hyphen boundary in the regex).
    expect(inferDefaultSdTypeFromKey('SD-LEONARDO-001')).toBeNull();
    expect(inferDefaultSdTypeFromKey('SD-LEARNING-001')).toBeNull();
  });

  it('is null-safe for non-string input', () => {
    expect(inferDefaultSdTypeFromKey(undefined)).toBeNull();
    expect(inferDefaultSdTypeFromKey(null)).toBeNull();
    expect(inferDefaultSdTypeFromKey(42)).toBeNull();
  });
});

describe('resolveSdType (FR-1/FR-2/FR-3)', () => {
  it('FR-1: a TYPELESS infra-prefixed key defaults to infrastructure', () => {
    expect(resolveSdType(undefined, 'SD-LEO-INFRA-FOO-001')).toBe('infrastructure');
    expect(resolveSdType(null, 'SD-MAN-INFRA-FOO-001')).toBe('infrastructure');
    expect(resolveSdType(undefined, 'SD-LEARN-FIX-FOO-001')).toBe('infrastructure');
  });

  it('FR-2: an explicit type ALWAYS wins over the prefix default', () => {
    expect(resolveSdType('feature', 'SD-LEO-INFRA-FOO-001')).toBe('feature');
    expect(resolveSdType('bugfix', 'SD-LEO-FOO-001')).toBe('bugfix');
    expect(resolveSdType('database', 'SD-MAN-INFRA-FOO-001')).toBe('database');
  });

  it('FR-3: a TYPELESS product key still defaults to feature', () => {
    expect(resolveSdType(undefined, 'SD-EHG-MARKETING-001')).toBe('feature');
    expect(resolveSdType(null, 'SD-FDBK-INFRA-001')).toBe('feature');
  });
});

describe('deriveSdFieldsFromRoadmapItem no longer bakes a feature default (FR-3)', () => {
  it('returns type=null when the roadmap item carries no metadata.sd_type', () => {
    // null lets the createSD SSOT (resolveSdType) apply the key-prefix default for promoted SDs.
    const fields = deriveSdFieldsFromRoadmapItem({ id: 'rwi-1', title: 'Harden the reaper' });
    expect(fields.type).toBeNull();
  });

  it('still passes through an explicit metadata.sd_type unchanged', () => {
    const fields = deriveSdFieldsFromRoadmapItem({ id: 'rwi-2', title: 'X', metadata: { sd_type: 'bugfix' } });
    expect(fields.type).toBe('bugfix');
  });

  it('end-to-end: a typeless LEO-source promotion resolves to infrastructure', () => {
    // The from-roadmap path generates an SD-LEO-* key, then createSD calls resolveSdType(fields.type, key).
    const fields = deriveSdFieldsFromRoadmapItem({ id: 'rwi-3', title: 'Reap orphan worktrees' });
    expect(resolveSdType(fields.type, 'SD-LEO-GEN-REAP-ORPHAN-001')).toBe('infrastructure');
  });
});
