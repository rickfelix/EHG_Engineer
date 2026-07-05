/**
 * Unit tests for lib/eva/adherence-scorer.js.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C
 *
 * @module tests/unit/eva/adherence-scorer.test
 */

import { describe, it, expect } from 'vitest';
import {
  DIMENSION_ARTIFACT_MAP,
  classifyDeviationReason,
  scoreVerdictTable,
  buildDeviationLedger,
} from '../../../lib/eva/adherence-scorer.js';
import { enumerateRequiredArtifacts } from '../../../lib/eva/post-build-verdict-engine.js';

/** Generic filterable/sortable in-memory query-chain mock matching Supabase's
 *  builder shape closely enough for unit testing (eq/in/contains filter,
 *  order sorts, limit truncates, maybeSingle/single/thenable all terminal). */
function makeChain(rows, transforms = []) {
  const apply = (data) => transforms.reduce((acc, fn) => fn(acc), data);
  const withTransform = (fn) => makeChain(rows, [...transforms, fn]);
  const chain = {
    eq: (col, val) => withTransform((data) => data.filter((r) => r[col] === val)),
    lte: (col, val) => withTransform((data) => data.filter((r) => r[col] <= val)),
    in: (col, vals) => withTransform((data) => data.filter((r) => vals.includes(r[col]))),
    contains: (col, obj) => withTransform((data) => data.filter((r) => {
      const target = r[col];
      return target && Object.entries(obj).every(([k, v]) => target[k] === v);
    })),
    order: (col, opts = {}) => withTransform((data) => {
      const sorted = [...data].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0));
      return opts.ascending === false ? sorted.reverse() : sorted;
    }),
    limit: (n) => withTransform((data) => data.slice(0, n)),
    maybeSingle: async () => ({ data: apply(rows)[0] ?? null, error: null }),
    single: async () => ({ data: apply(rows)[0] ?? null, error: null }),
    then: (resolve) => resolve({ data: apply(rows), error: null }),
  };
  return chain;
}

function createMockSupabase(tableData = {}) {
  return {
    from: (tableName) => ({ select: () => makeChain(tableData[tableName] || []) }),
  };
}

const PUBLISHED_RUBRIC = {
  rubric_key: 'post_build_adherence_v1',
  version: 1,
  status: 'published',
  dimensions: {},
  dimension_floor: 3,
  mean_floor: 4,
  zero_unscored_fails: true,
};

describe('classifyDeviationReason()', () => {
  it('classifies a sensible, causally-grounded reason as SENSIBLE', () => {
    expect(classifyDeviationReason(
      'Stripe webhook signing requires server-side handling, so we moved this off the client per Stripe\'s own security requirement.'
    )).toBe('SENSIBLE');
  });

  it('classifies a generic/circular reason as THIN', () => {
    expect(classifyDeviationReason('Decided to do it differently.')).toBe('THIN');
  });

  it('classifies a too-short reason as THIN regardless of content', () => {
    expect(classifyDeviationReason('because reasons')).toBe('THIN');
  });

  it('classifies an empty/missing reason as THIN', () => {
    expect(classifyDeviationReason('')).toBe('THIN');
    expect(classifyDeviationReason(undefined)).toBe('THIN');
  });

  it('fails toward THIN for a long-but-non-causal reason (ambiguous never becomes SENSIBLE)', () => {
    expect(classifyDeviationReason('We ended up building this in a completely different way than planned for the venture.')).toBe('THIN');
  });
});

describe('scoreDimension() / scoreVerdictTable()', () => {
  it('TS-1: all-BUILT verdicts across all 4 dimensions score 5/5/5/5 and PASS', async () => {
    const postBuildVerdicts = [
      { id: 'v1', venture_id: 'v-1', artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-1', disposition: 'BUILT' },
      { id: 'v2', venture_id: 'v-1', artifact_type: 'identity_persona_brand', claim_ref: 'identity_persona_brand', disposition: 'BUILT' },
      { id: 'v3', venture_id: 'v-1', artifact_type: 'blueprint_data_model', claim_ref: 'blueprint_data_model', disposition: 'BUILT' },
      { id: 'v4', venture_id: 'v-1', artifact_type: 'blueprint_technical_architecture', claim_ref: 'blueprint_technical_architecture', disposition: 'BUILT' },
    ];
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: postBuildVerdicts,
      venture_artifacts: [],
    });

    const result = await scoreVerdictTable(supabase, { ventureId: 'v-1' });
    expect(result.dimensionScores.user_story_coverage).toBe(5);
    expect(result.dimensionScores.persona_surface_coverage).toBe(5);
    expect(result.dimensionScores.data_model_fidelity).toBe(5);
    expect(result.dimensionScores.architecture_conformance).toBe(5);
    expect(result.unscoredDimensions).toEqual([]);
    expect(result.mean).toBe(5);
    expect(result.pass).toBe(true);
  });

  it('TS-2: one dimension with zero verdict rows is UNSCORED, overall FAIL regardless of other 3 scores', async () => {
    const postBuildVerdicts = [
      // user_story_coverage: entirely missing (no rows at all)
      { id: 'v2', venture_id: 'v-2', artifact_type: 'identity_persona_brand', claim_ref: 'identity_persona_brand', disposition: 'BUILT' },
      { id: 'v3', venture_id: 'v-2', artifact_type: 'blueprint_data_model', claim_ref: 'blueprint_data_model', disposition: 'BUILT' },
      { id: 'v4', venture_id: 'v-2', artifact_type: 'blueprint_technical_architecture', claim_ref: 'blueprint_technical_architecture', disposition: 'BUILT' },
    ];
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: postBuildVerdicts,
      venture_artifacts: [],
    });

    const result = await scoreVerdictTable(supabase, { ventureId: 'v-2' });
    expect(result.dimensionScores.user_story_coverage).toBeNull();
    expect(result.unscoredDimensions).toEqual(['user_story_coverage']);
    expect(result.dimensionScores.persona_surface_coverage).toBe(5);
    expect(result.dimensionScores.data_model_fidelity).toBe(5);
    expect(result.dimensionScores.architecture_conformance).toBe(5);
    // zero_unscored_fails=true -> FAIL overall despite the other 3 dimensions scoring perfectly
    expect(result.pass).toBe(false);
  });

  it('TS-3: a DEVIATED_WITH_DOCUMENTED_REASON claim with a THIN reason scores as drift, not passing evidence', async () => {
    const postBuildVerdicts = [
      { id: 'v1', venture_id: 'v-3', artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-thin', disposition: 'DEVIATED_WITH_DOCUMENTED_REASON' },
    ];
    const ventureArtifacts = [
      {
        id: 'dev-1',
        venture_id: 'v-3',
        artifact_type: 'build_deviation_record',
        created_at: '2026-07-01T00:00:00Z',
        artifact_data: { artifact_ref: 'story-thin', why: 'Decided to do it differently.', weight: 'minor' },
      },
    ];
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: postBuildVerdicts,
      venture_artifacts: ventureArtifacts,
    });

    const result = await scoreVerdictTable(supabase, { ventureId: 'v-3' });
    // The only claim in user_story_coverage has a THIN reason -> scores as drift (goodFraction=0) -> 1
    expect(result.dimensionScores.user_story_coverage).toBe(1);
  });

  it('a DEVIATED_WITH_DOCUMENTED_REASON claim with a SENSIBLE reason scores as passing evidence', async () => {
    const postBuildVerdicts = [
      { id: 'v1', venture_id: 'v-4', artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-sensible', disposition: 'DEVIATED_WITH_DOCUMENTED_REASON' },
    ];
    const ventureArtifacts = [
      {
        id: 'dev-2',
        venture_id: 'v-4',
        artifact_type: 'build_deviation_record',
        created_at: '2026-07-01T00:00:00Z',
        artifact_data: {
          artifact_ref: 'story-sensible',
          why: 'Combined signup and login per UX testing, since the two-step flow caused measurable drop-off in the beta cohort.',
          weight: 'moderate',
        },
      },
    ];
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: postBuildVerdicts,
      venture_artifacts: ventureArtifacts,
    });

    const result = await scoreVerdictTable(supabase, { ventureId: 'v-4' });
    expect(result.dimensionScores.user_story_coverage).toBe(5);
  });

  it('throws if no published rubric row exists for the given rubric_key', async () => {
    const supabase = createMockSupabase({ adherence_rubrics: [], post_build_verdicts: [], venture_artifacts: [] });
    await expect(scoreVerdictTable(supabase, { ventureId: 'v-5' })).rejects.toThrow(/no published rubric/);
  });
});

describe('DIMENSION_ARTIFACT_MAP coverage', () => {
  it('assigns every artifact_type enumerable through stage 19 to exactly one dimension, or documents the exclusion', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => makeChain([
          { stage_number: 19, required_artifacts: [
            'truth_idea_brief', 'truth_ai_critique', 'truth_validation_decision', 'truth_competitive_analysis',
            'truth_financial_model', 'engine_risk_matrix', 'engine_pricing_model', 'engine_business_model_canvas',
            'engine_exit_strategy', 'identity_persona_brand', 'identity_naming_visual', 'identity_brand_guidelines',
            'identity_gtm_sales_strategy', 'blueprint_product_roadmap', 'blueprint_technical_architecture',
            'blueprint_data_model', 'blueprint_erd_diagram', 'blueprint_api_contract', 'blueprint_schema_spec',
            'wireframe_screens', 'blueprint_user_story_pack', 'blueprint_financial_projection',
            'system_devils_advocate_review', 'marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero',
            'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement',
            'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft', 'build_mvp_build',
          ] },
        ]),
      }),
    };

    const EXPLICITLY_OUT_OF_SCOPE = new Set([
      'truth_idea_brief', 'truth_ai_critique', 'truth_validation_decision', 'truth_competitive_analysis',
      'truth_financial_model', 'engine_risk_matrix', 'engine_pricing_model', 'engine_business_model_canvas',
      'engine_exit_strategy', 'identity_gtm_sales_strategy', 'wireframe_screens', 'blueprint_financial_projection',
      'system_devils_advocate_review', 'marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero',
      'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement',
      'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft', 'build_mvp_build',
    ]);

    const mapped = new Set(Object.values(DIMENSION_ARTIFACT_MAP).flat());
    const allTypes = (await enumerateRequiredArtifacts(mockSupabase, { throughStage: 19 })).map((r) => r.artifactType);

    for (const type of allTypes) {
      const isMapped = mapped.has(type);
      const isExcluded = EXPLICITLY_OUT_OF_SCOPE.has(type);
      expect(isMapped || isExcluded, `artifact_type "${type}" is neither mapped to a dimension nor explicitly documented as out-of-scope`).toBe(true);
      expect(isMapped && isExcluded, `artifact_type "${type}" cannot be both mapped AND excluded`).toBe(false);
    }
  });
});

describe('buildDeviationLedger()', () => {
  it('ranks deviations critical-tier first, then moderate, minor, declared-descope last', async () => {
    const postBuildVerdicts = [
      { id: 'v1', venture_id: 'v-6', claim_ref: 'story-a', disposition: 'DEVIATED_WITH_DOCUMENTED_REASON' },
      { id: 'v2', venture_id: 'v-6', claim_ref: 'story-b', disposition: 'DEVIATED_UNDOCUMENTED' },
      { id: 'v3', venture_id: 'v-6', claim_ref: 'story-c', disposition: 'DEVIATED_WITH_DOCUMENTED_REASON' },
      { id: 'v4', venture_id: 'v-6', claim_ref: 'story-d', disposition: 'DEVIATED_WITH_DOCUMENTED_REASON' },
    ];
    const ventureArtifacts = [
      { id: 'd-a', venture_id: 'v-6', artifact_type: 'build_deviation_record', created_at: '2026-07-01T00:00:00Z', artifact_data: { artifact_ref: 'story-a', why: 'moderate reason here for testing purposes', weight: 'moderate' } },
      { id: 'd-b', venture_id: 'v-6', artifact_type: 'build_deviation_record', created_at: '2026-07-01T00:00:00Z', artifact_data: { artifact_ref: 'story-b', why: 'critical because of a real production defect', weight: 'critical' } },
      { id: 'd-c', venture_id: 'v-6', artifact_type: 'build_deviation_record', created_at: '2026-07-01T00:00:00Z', artifact_data: { artifact_ref: 'story-c', why: 'minor cosmetic reason for a small tweak', weight: 'minor' } },
      { id: 'd-d', venture_id: 'v-6', artifact_type: 'build_deviation_record', created_at: '2026-07-01T00:00:00Z', artifact_data: { artifact_ref: 'story-d', why: 'declared descope per chairman approval', weight: 'declared-descope' } },
    ];
    const supabase = createMockSupabase({ post_build_verdicts: postBuildVerdicts, venture_artifacts: ventureArtifacts });

    const ledger = await buildDeviationLedger(supabase, { ventureId: 'v-6' });
    expect(ledger.map((e) => e.weight)).toEqual(['critical', 'moderate', 'minor', 'declared-descope']);
  });
});
