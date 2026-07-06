// Unit tests for the FR-1/TR-1 locked-design-token precedence resolver
// (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001). Proves: GVOS-first precedence, legacy fallback,
// fail-open to 'none' when neither source exists (zero regression, TS-2), and no throw on
// a query error (db-touching, mocked supabase client per repo convention).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/eva/stage-17/token-manifest.js', () => ({
  getTokenConstraints: vi.fn(),
}));

import { resolveLockedDesignTokens, resolveMotionGrammar } from '../../../../lib/eva/bridge/design-token-resolver.js';
import { getTokenConstraints } from '../../../../lib/eva/stage-17/token-manifest.js';

function fakeSupabase({ gvosRow = null, gvosError = null, wfArt = null } = {}) {
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
      if (table === 'venture_artifacts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: wfArt, error: null }),
                  }),
                }),
              }),
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

describe('resolveMotionGrammar — FR-1 motion-grammar resolution (wireframe_screens.micro_animations)', () => {
  it('returns the first screen with populated micro_animations', async () => {
    const wfArt = { artifact_data: { screens: [
      { name: 'Screen A' },
      { name: 'Screen B', micro_animations: { entry_transition: 'fade-in 200ms' } },
      { name: 'Screen C', micro_animations: { entry_transition: 'slide 300ms' } },
    ] } };
    const sb = fakeSupabase({ wfArt });
    const r = await resolveMotionGrammar('v-1', sb);
    expect(r).toEqual({ entry_transition: 'fade-in 200ms' });
  });

  it('returns null when no wireframe_screens artifact exists', async () => {
    const sb = fakeSupabase({ wfArt: null });
    expect(await resolveMotionGrammar('v-1', sb)).toBeNull();
  });

  it('returns null when screens exist but none carry micro_animations', async () => {
    const wfArt = { artifact_data: { screens: [{ name: 'Screen A' }, { name: 'Screen B' }] } };
    const sb = fakeSupabase({ wfArt });
    expect(await resolveMotionGrammar('v-1', sb)).toBeNull();
  });

  it('missing ventureId/supabase -> null without throwing', async () => {
    expect(await resolveMotionGrammar(null, {})).toBeNull();
    expect(await resolveMotionGrammar('v-1', null)).toBeNull();
  });

  it('a query error is swallowed -> null, never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    expect(await resolveMotionGrammar('v-1', sb)).toBeNull();
  });
});
