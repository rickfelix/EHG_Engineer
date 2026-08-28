/**
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (Unit B, FR-3).
 * Coverage for lib/eva/experience-review/context.js.
 */

import { describe, it, expect } from 'vitest';
import {
  EXPERIENCE_ARTIFACT_TYPES,
  fetchExperienceReviewArtifacts,
  buildExperienceReviewPrompt,
} from '../../../../lib/eva/experience-review/context.js';

const VENTURE_ID = '00000000-0000-0000-0000-0000000000bb';

function makeMockSupabase(rowsByType) {
  return {
    from(table) {
      if (table !== 'venture_artifacts') throw new Error(`unexpected table: ${table}`);
      const state = {};
      const builder = {
        select() { return builder; },
        eq(col, val) {
          if (col === 'artifact_type') state.artifact_type = val;
          return builder;
        },
        order() { return builder; },
        limit() { return builder; },
        async maybeSingle() {
          const row = rowsByType[state.artifact_type];
          return row ? { data: row, error: null } : { data: null, error: null };
        },
      };
      return builder;
    },
  };
}

describe('fetchExperienceReviewArtifacts', () => {
  it('returns both artifacts when present, missing empty', async () => {
    const supabase = makeMockSupabase({
      [EXPERIENCE_ARTIFACT_TYPES.USER_JOURNEY]: { id: 'j1', artifact_data: { steps: [] } },
      [EXPERIENCE_ARTIFACT_TYPES.WIREFRAME_SCREENS]: { id: 'w1', artifact_data: { screens: [] } },
    });
    const r = await fetchExperienceReviewArtifacts(supabase, VENTURE_ID);
    expect(r.journey.id).toBe('j1');
    expect(r.wireframes.id).toBe('w1');
    expect(r.missing).toEqual([]);
  });

  it('reports missing artifacts without throwing (fail-soft, FR-3 dependency contract)', async () => {
    const supabase = makeMockSupabase({});
    const r = await fetchExperienceReviewArtifacts(supabase, VENTURE_ID);
    expect(r.journey).toBeNull();
    expect(r.wireframes).toBeNull();
    expect(r.missing.sort()).toEqual([
      EXPERIENCE_ARTIFACT_TYPES.USER_JOURNEY,
      EXPERIENCE_ARTIFACT_TYPES.WIREFRAME_SCREENS,
    ].sort());
  });

  it('throws on missing supabase/ventureId (programmer error, not a data-absence case)', async () => {
    await expect(fetchExperienceReviewArtifacts(null, VENTURE_ID)).rejects.toThrow(/supabase client required/);
    await expect(fetchExperienceReviewArtifacts(makeMockSupabase({}), null)).rejects.toThrow(/ventureId required/);
  });
});

describe('buildExperienceReviewPrompt', () => {
  it('embeds both artifacts when present', () => {
    const prompt = buildExperienceReviewPrompt({
      ventureName: 'AltifyAI', ventureId: VENTURE_ID, deploymentUrl: 'https://altifyai.example',
      journey: { artifact_data: { journey_id: 'jny-1' } },
      wireframes: { artifact_data: { screens: ['s1'] } },
      missing: [],
    });
    expect(prompt).toContain('AltifyAI');
    expect(prompt).toContain('https://altifyai.example');
    expect(prompt).toContain('jny-1');
    expect(prompt).toContain('s1');
    expect(prompt).not.toContain('Missing artifacts');
  });

  it('instructs INCONCLUSIVE handling when artifacts are absent, without inventing structure', () => {
    const prompt = buildExperienceReviewPrompt({
      ventureId: VENTURE_ID, deploymentUrl: 'https://altifyai.example',
      journey: null, wireframes: null,
      missing: ['blueprint_user_journey', 'wireframe_screens'],
    });
    expect(prompt).toContain('do not invent journey structure');
    expect(prompt).toContain('Missing artifacts');
    expect(prompt).toContain('blueprint_user_journey, wireframe_screens');
  });

  it('states the WARN-cap scope constraint (never self-censor severity)', () => {
    const prompt = buildExperienceReviewPrompt({
      ventureId: VENTURE_ID, deploymentUrl: 'https://altifyai.example', journey: null, wireframes: null,
    });
    expect(prompt).toMatch(/No experience finding can FAIL/);
    expect(prompt).toMatch(/do not self-censor/);
  });

  it('throws on missing required args', () => {
    expect(() => buildExperienceReviewPrompt({ deploymentUrl: 'https://x' })).toThrow(/ventureId required/);
    expect(() => buildExperienceReviewPrompt({ ventureId: VENTURE_ID })).toThrow(/deploymentUrl required/);
  });
});
