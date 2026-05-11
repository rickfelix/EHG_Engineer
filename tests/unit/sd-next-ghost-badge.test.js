/**
 * Tests: scripts/modules/sd-next/status-helpers.js — STATUS_INCONSISTENT badge
 * SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('status-helpers: getInconsistentSDIds + getStatusInconsistentBadge', () => {
  let getInconsistentSDIds;
  let getStatusInconsistentBadge;
  let _resetInconsistentCache;
  let warnSpy;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ({
      getInconsistentSDIds,
      getStatusInconsistentBadge,
      _resetInconsistentCache,
    } = await import('../../scripts/modules/sd-next/status-helpers.js'));
    _resetInconsistentCache();
    // Clear any warns emitted during module import (dotenvx tip messages, etc.)
    warnSpy.mockClear();
  });

  function buildMock(data, error) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data, error }),
        })),
      })),
    };
  }

  it('returns a Set of ghost ids when view has rows', async () => {
    const supabase = buildMock([{ id: 'sd-a' }, { id: 'sd-b' }], null);
    const result = await getInconsistentSDIds(supabase);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has('sd-a')).toBe(true);
    expect(result.has('sd-b')).toBe(true);
  });

  it('returns empty Set when view absent (PostgrestError code 42P01) + warns ONCE', async () => {
    const supabase = buildMock(null, { code: '42P01', message: 'relation "v_sd_completion_integrity" does not exist' });
    const r1 = await getInconsistentSDIds(supabase);
    const r2 = await getInconsistentSDIds(supabase);
    expect(r1).toBeInstanceOf(Set);
    expect(r1.size).toBe(0);
    expect(r2).toBeInstanceOf(Set);
    expect(r2.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns empty Set when error message matches /relation .* does not exist/i', async () => {
    const supabase = buildMock(null, { code: 'OTHER', message: 'relation "v_sd_completion_integrity" does not exist (psql variant)' });
    const r = await getInconsistentSDIds(supabase);
    expect(r.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns empty Set when PostgREST reports schema-cache miss (no 42P01 code)', async () => {
    const supabase = buildMock(null, { code: undefined, message: "Could not find the table 'public.v_sd_completion_integrity' in the schema cache" });
    const r = await getInconsistentSDIds(supabase);
    expect(r.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns empty Set when other postgres errors fire + warns ONCE', async () => {
    const supabase = buildMock(null, { code: 'P0001', message: 'permission denied' });
    await getInconsistentSDIds(supabase);
    await getInconsistentSDIds(supabase);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('is memoized: second call does not re-query supabase', async () => {
    const supabase = buildMock([{ id: 'sd-a' }], null);
    await getInconsistentSDIds(supabase);
    await getInconsistentSDIds(supabase);
    await getInconsistentSDIds(supabase);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('returns empty Set when supabase client is null', async () => {
    const r = await getInconsistentSDIds(null);
    expect(r).toBeInstanceOf(Set);
    expect(r.size).toBe(0);
  });

  it('getStatusInconsistentBadge returns STATUS_INCONSISTENT token when SD id is in set', () => {
    const item = { id: 'sd-a' };
    const set = new Set(['sd-a', 'sd-b']);
    expect(getStatusInconsistentBadge(item, set)).toContain('STATUS_INCONSISTENT');
  });

  it('getStatusInconsistentBadge returns empty string when SD not in set', () => {
    expect(getStatusInconsistentBadge({ id: 'sd-x' }, new Set(['sd-a']))).toBe('');
  });

  it('getStatusInconsistentBadge returns empty string for empty/missing inputs', () => {
    expect(getStatusInconsistentBadge(null, new Set(['a']))).toBe('');
    expect(getStatusInconsistentBadge({ id: 'a' }, null)).toBe('');
    expect(getStatusInconsistentBadge({ id: 'a' }, new Set())).toBe('');
  });
});
