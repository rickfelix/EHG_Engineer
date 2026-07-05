/**
 * Unit tests for lib/eva/journey-evidence-merge.js.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E
 *
 * @module tests/unit/eva/journey-evidence-merge.test
 */

import { describe, it, expect } from 'vitest';
import { mergeStepEvidence, mergeJourneyEvidence } from '../../../lib/eva/journey-evidence-merge.js';
import { DIMENSION_ARTIFACT_MAP } from '../../../lib/eva/adherence-scorer.js';

/** Mutable in-memory post_build_verdicts mock supporting select + upsert. */
function createMockSupabase(initialRows = []) {
  const rows = [...initialRows];
  return {
    from: (table) => {
      if (table !== 'post_build_verdicts') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col1, val1) => ({
            eq: (col2, val2) => ({
              eq: (col3, val3) => ({
                maybeSingle: async () => {
                  const row = rows.find((r) => r[col1] === val1 && r[col2] === val2 && r[col3] === val3);
                  return { data: row || null, error: null };
                },
              }),
            }),
          }),
        }),
        upsert: (payload) => ({
          select: () => ({
            single: async () => {
              const idx = rows.findIndex(
                (r) => r.venture_id === payload.venture_id && r.artifact_type === payload.artifact_type && r.claim_ref === payload.claim_ref
              );
              const merged = { id: idx >= 0 ? rows[idx].id : `v-${rows.length}`, ...payload };
              if (idx >= 0) rows[idx] = merged; else rows.push(merged);
              return { data: { id: merged.id }, error: null };
            },
          }),
        }),
      };
    },
    _rows: rows,
  };
}

describe('mergeStepEvidence() — TS-5 (upgrade + append)', () => {
  it('upgrades PARTIAL to BUILT and appends evidenceRefs (never replaces) on a successful journey step', async () => {
    const supabase = createMockSupabase([
      { id: 'v1', venture_id: 'v-1', artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-1', disposition: 'PARTIAL', evidence_refs: [{ path: 'src/foo.js', line: 3 }] },
    ]);

    const result = await mergeStepEvidence(supabase, {
      ventureId: 'v-1', artifactType: 'blueprint_user_story_pack', claimRef: 'story-1',
      stepOutcome: { step: 'submit', url: '/app', renderedStateSummary: 'ok', success: true },
    });

    expect(result.merged).toBe(true);
    expect(result.upgraded).toBe(true);
    const row = supabase._rows.find((r) => r.claim_ref === 'story-1');
    expect(row.disposition).toBe('BUILT');
    expect(row.evidence_refs).toHaveLength(2);
    expect(row.evidence_refs[0]).toEqual({ path: 'src/foo.js', line: 3 });
    expect(row.evidence_refs[1].source).toBe('journey-walk');
  });
});

describe('mergeStepEvidence() — TS-6 (no downgrade, no-op on unmatched claim)', () => {
  it('leaves an existing BUILT verdict disposition unchanged when the journey step did not confirm it', async () => {
    const supabase = createMockSupabase([
      { id: 'v1', venture_id: 'v-1', artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-1', disposition: 'BUILT', evidence_refs: [] },
    ]);

    const result = await mergeStepEvidence(supabase, {
      ventureId: 'v-1', artifactType: 'blueprint_user_story_pack', claimRef: 'story-1',
      stepOutcome: { step: 'submit', url: '/app', renderedStateSummary: 'ok', success: false },
    });

    expect(result.upgraded).toBe(false);
    const row = supabase._rows.find((r) => r.claim_ref === 'story-1');
    expect(row.disposition).toBe('BUILT');
  });

  it('is a no-op (not an error) when no existing verdict row matches the claim', async () => {
    const supabase = createMockSupabase([]);
    const result = await mergeStepEvidence(supabase, {
      ventureId: 'v-1', artifactType: 'blueprint_user_story_pack', claimRef: 'story-unmatched',
      stepOutcome: { step: 'submit', url: '/app', renderedStateSummary: 'ok', success: true },
    });
    expect(result.merged).toBe(false);
    expect(result.verdictId).toBeNull();
  });
});

describe('DIMENSION_ARTIFACT_MAP — TS-7 (no new rubric dimension introduced)', () => {
  it('remains exactly the 4 chairman-ratified dimensions', () => {
    expect(Object.keys(DIMENSION_ARTIFACT_MAP).sort()).toEqual(
      ['architecture_conformance', 'data_model_fidelity', 'persona_surface_coverage', 'user_story_coverage'].sort()
    );
  });
});

describe('mergeJourneyEvidence() — TS-8 (ordering guard)', () => {
  it('throws when walkCompletedAt is not provided, refusing to merge onto possibly-stale rows', async () => {
    const supabase = createMockSupabase([]);
    await expect(mergeJourneyEvidence(supabase, { ventureId: 'v-1', journeyOutcomes: [] }))
      .rejects.toThrow(/walkCompletedAt/);
  });

  it('merges all outcomes when walkCompletedAt is provided', async () => {
    const supabase = createMockSupabase([
      { id: 'v1', venture_id: 'v-1', artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-1', disposition: 'PARTIAL', evidence_refs: [] },
      { id: 'v2', venture_id: 'v-1', artifact_type: 'identity_persona_brand', claim_ref: 'identity_persona_brand', disposition: 'PARTIAL', evidence_refs: [] },
    ]);
    const journeyOutcomes = [
      { step: 'submit', artifactType: 'blueprint_user_story_pack', claimRef: 'story-1', url: '/app', renderedStateSummary: 'ok', success: true },
      { step: 'land', artifactType: 'identity_persona_brand', claimRef: 'identity_persona_brand', url: '/', renderedStateSummary: 'ok', success: true },
    ];

    const { results, mergedCount, upgradedCount } = await mergeJourneyEvidence(supabase, {
      ventureId: 'v-1', journeyOutcomes, walkCompletedAt: new Date().toISOString(),
    });

    expect(mergedCount).toBe(2);
    expect(upgradedCount).toBe(2);
    expect(results).toHaveLength(2);
  });
});
