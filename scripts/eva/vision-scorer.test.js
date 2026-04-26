import { describe, it, expect } from 'vitest';
import {
  resolveDefaultKeysFromSD,
  tierKeysFromSDKey,
  DEFAULT_VISION_KEY,
  DEFAULT_ARCH_KEY
} from './vision-scorer.js';

function fakeSupabase(row) {
  return {
    from() { return this; },
    select() { return this; },
    or() { return this; },
    maybeSingle: async () => ({ data: row, error: null })
  };
}

describe('resolveDefaultKeysFromSD', () => {
  it('returns nulls when sdKey is empty', async () => {
    const result = await resolveDefaultKeysFromSD(null, null);
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns nulls when SD has no metadata and no tier suffix', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns vision_key + arch_key from SD metadata (metadata wins)', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' });
  });

  it('returns nulls when row not found and no tier suffix', async () => {
    const supabase = fakeSupabase(null);
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-MISSING');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('exports L1 fallback constants', () => {
    expect(DEFAULT_VISION_KEY).toBe('VISION-EHG-L1-001');
    expect(DEFAULT_ARCH_KEY).toBe('ARCH-EHG-L1-001');
  });

  it('returns vision_key only when arch_key missing in metadata (metadata wins, no suffix fallback)', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: null });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetection (TS-4)
  it('falls back to suffix-derived L2 keys when metadata is null and sd_key matches /-L2-/', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-VISION-S17-SIMPLIFY-L2-001');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L2-001', arch_key: 'ARCH-EHG-L2-001' });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetection — L1 + L3
  it('falls back to suffix-derived L1 keys', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L1-001');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L1-001', arch_key: 'ARCH-EHG-L1-001' });
  });

  it('falls back to suffix-derived L3 keys', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L3-007');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L3-001', arch_key: 'ARCH-EHG-L3-001' });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetect MISS (TS-5)
  it('returns nulls when sd_key has no tier suffix', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-LEO-INFRA-FOO-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('does not match unrelated L4-L9 substrings', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L4-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('does not match without hyphen guards (e.g. L2 inside word)', async () => {
    const supabase = fakeSupabase({ metadata: null });
    // 'SD-XL2X-001' contains 'L2' but not bounded by hyphens — must NOT match
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-XL2X-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });
});

describe('tierKeysFromSDKey', () => {
  it('returns nulls for empty input', () => {
    expect(tierKeysFromSDKey('')).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey(null)).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey(undefined)).toEqual({ vision_key: null, arch_key: null, tier: null });
  });

  it('extracts L1 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-A-L1-001')).toEqual({
      vision_key: 'VISION-EHG-L1-001',
      arch_key: 'ARCH-EHG-L1-001',
      tier: 'L1'
    });
  });

  it('extracts L2 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-VISION-S17-SIMPLIFY-L2-001')).toEqual({
      vision_key: 'VISION-EHG-L2-001',
      arch_key: 'ARCH-EHG-L2-001',
      tier: 'L2'
    });
  });

  it('extracts L3 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-A-L3-042')).toEqual({
      vision_key: 'VISION-EHG-L3-001',
      arch_key: 'ARCH-EHG-L3-001',
      tier: 'L3'
    });
  });

  it('returns nulls when no tier suffix matches', () => {
    expect(tierKeysFromSDKey('SD-LEO-INFRA-FOO-001')).toEqual({
      vision_key: null,
      arch_key: null,
      tier: null
    });
  });

  it('rejects non-string input gracefully', () => {
    expect(tierKeysFromSDKey(42)).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey({})).toEqual({ vision_key: null, arch_key: null, tier: null });
  });
});
