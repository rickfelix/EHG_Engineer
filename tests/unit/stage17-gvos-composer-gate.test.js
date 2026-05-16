import { describe, it, expect } from 'vitest';
import { isGvosComposerEnabled } from '../../server/routes/stage17.js';

function mockSupabase({ flagEnabled = null, error = null } = {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() { return this; },
            maybeSingle: async () => {
              if (error) return { data: null, error: { message: error } };
              if (flagEnabled === null) return { data: null, error: null };
              return { data: { is_enabled: flagEnabled }, error: null };
            },
          };
        },
      };
    },
  };
}

describe('isGvosComposerEnabled (QF-20260513-179)', () => {
  it('returns true when s17_use_gvos_composer flag is enabled', async () => {
    const r = await isGvosComposerEnabled('venture-uuid', mockSupabase({ flagEnabled: true }));
    expect(r).toBe(true);
  });

  it('returns false when flag is disabled', async () => {
    const r = await isGvosComposerEnabled('venture-uuid', mockSupabase({ flagEnabled: false }));
    expect(r).toBe(false);
  });

  it('returns false when flag row does not exist', async () => {
    const r = await isGvosComposerEnabled('venture-uuid', mockSupabase({ flagEnabled: null }));
    expect(r).toBe(false);
  });

  it('returns false on supabase query error (fail-safe)', async () => {
    const r = await isGvosComposerEnabled('venture-uuid', mockSupabase({ error: 'connection refused' }));
    expect(r).toBe(false);
  });

  it('returns false when supabase client is null/undefined', async () => {
    expect(await isGvosComposerEnabled('venture-uuid', null)).toBe(false);
    expect(await isGvosComposerEnabled('venture-uuid', undefined)).toBe(false);
  });

  it('handles supabase that throws synchronously', async () => {
    const broken = { from() { throw new Error('boom'); } };
    expect(await isGvosComposerEnabled('venture-uuid', broken)).toBe(false);
  });
});
