// Unit tests for the FR-1/TR-1 locked-design-token precedence resolver
// (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001). Proves: GVOS-first precedence, legacy fallback,
// fail-open to 'none' when neither source exists (zero regression, TS-2), and no throw on
// a query error (db-touching, mocked supabase client per repo convention).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/eva/stage-17/token-manifest.js', () => ({
  getTokenConstraints: vi.fn(),
}));

import { resolveLockedDesignTokens } from '../../../../lib/eva/bridge/design-token-resolver.js';
import { getTokenConstraints } from '../../../../lib/eva/stage-17/token-manifest.js';

function fakeSupabase({ gvosRow = null, gvosError = null } = {}) {
  return {
    from(table) {
      if (table === 'venture_gvos_profile') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: gvosRow, error: gvosError }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in fakeSupabase: ${table}`);
    },
  };
}

describe('resolveLockedDesignTokens — TR-1 precedence (GVOS first, legacy fallback)', () => {
  it('TS-3: GVOS source takes precedence when both exist', async () => {
    getTokenConstraints.mockResolvedValue({ colors: ['#legacy'] });
    const sb = fakeSupabase({ gvosRow: { locked_prompt_snapshot: { colors: ['#gvos'] } } });
    const r = await resolveLockedDesignTokens('v-1', sb);
    expect(r).toEqual({ source: 'gvos', tokens: { colors: ['#gvos'] } });
  });

  it('falls back to the legacy blueprint_token_manifest when GVOS is absent', async () => {
    getTokenConstraints.mockResolvedValue({ colors: ['#legacy'] });
    const sb = fakeSupabase({ gvosRow: null });
    const r = await resolveLockedDesignTokens('v-1', sb);
    expect(r).toEqual({ source: 'legacy', tokens: { colors: ['#legacy'] } });
  });

  it('TS-2: neither source exists -> "none" (zero regression, template unaffected)', async () => {
    getTokenConstraints.mockResolvedValue(null);
    const sb = fakeSupabase({ gvosRow: null });
    const r = await resolveLockedDesignTokens('v-1', sb);
    expect(r).toEqual({ source: 'none', tokens: null });
  });

  it('fail-open: a GVOS query error falls through to the legacy source, never throws', async () => {
    getTokenConstraints.mockResolvedValue({ colors: ['#legacy'] });
    const sb = fakeSupabase({ gvosRow: null, gvosError: { message: 'boom' } });
    const r = await resolveLockedDesignTokens('v-1', sb);
    expect(r.source).toBe('legacy');
  });

  it('missing ventureId/supabase -> "none" without throwing', async () => {
    expect(await resolveLockedDesignTokens(null, {})).toEqual({ source: 'none', tokens: null });
    expect(await resolveLockedDesignTokens('v-1', null)).toEqual({ source: 'none', tokens: null });
  });
});
