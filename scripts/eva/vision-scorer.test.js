import { describe, it, expect } from 'vitest';
import { resolveDefaultKeysFromSD, DEFAULT_VISION_KEY, DEFAULT_ARCH_KEY } from './vision-scorer.js';

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

  it('returns nulls when SD has no metadata', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns vision_key + arch_key from SD metadata', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' });
  });

  it('returns nulls when row not found', async () => {
    const supabase = fakeSupabase(null);
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-MISSING');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('exports L1 fallback constants', () => {
    expect(DEFAULT_VISION_KEY).toBe('VISION-EHG-L1-001');
    expect(DEFAULT_ARCH_KEY).toBe('ARCH-EHG-L1-001');
  });

  it('returns vision_key only when arch_key missing in metadata', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: null });
  });
});
