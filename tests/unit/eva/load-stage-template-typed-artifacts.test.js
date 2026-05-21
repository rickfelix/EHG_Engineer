/**
 * Regression test for the loadStageTemplate JS-fallback wrapper.
 *
 * RCA (NicheMetrics S14, 2026-05-21): the wrapper in eva-orchestrator-helpers.js
 * buried the analysis step's typed-array contract ({ artifacts: [...] }) inside
 * `payload`, one level below where eva-orchestrator.js detects it
 * (`Array.isArray(stepResult.artifacts)`). Effect: stages emitting the typed-array
 * form (S14 emits 5 typed artifacts, S26 likewise) had all but artifacts[0]
 * silently dropped — e.g. NicheMetrics S14 persisted only
 * blueprint_technical_architecture and lost the 4 projected blueprint artifacts.
 *
 * These tests assert the wrapper surfaces `result.artifacts` at the top level
 * (typed-array path) while leaving the legacy single-payload path unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/stage-templates/index.js', () => ({
  getTemplate: vi.fn(),
}));
vi.mock('../../../lib/eva/stage-execution-engine.js', () => ({
  // helpers statically imports resolveEvaKeys; execute() dynamically imports fetchUpstreamArtifacts
  resolveEvaKeys: vi.fn(async () => ({ visionKey: null, planKey: null })),
  fetchUpstreamArtifacts: vi.fn(async () => ({})),
}));
vi.mock('../../../lib/eva/contracts/stage-contracts.js', () => ({
  CROSS_STAGE_DEPS: {},
}));

const { getTemplate } = await import('../../../lib/eva/stage-templates/index.js');
const { loadStageTemplate } = await import('../../../lib/eva/eva-orchestrator-helpers.js');

// Supabase stub: venture_stage_templates lookup returns nothing so loadStageTemplate
// falls through to the JS template (getTemplate) path — where the bug lived.
const mockSupabase = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
  }),
};

describe('loadStageTemplate — typed-array passthrough (RCA: NicheMetrics S14)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces step result.artifacts at the top level so orchestrator detection fires', async () => {
    getTemplate.mockReturnValue({
      id: 'stage-14',
      version: '1.0.0',
      analysisStep: async () => ({
        // legacy keys are still spread at top level (back-compat for direct callers)
        architecture_summary: 'serverless analytics',
        // the typed-array contract that MUST reach the orchestrator
        artifacts: [
          { artifactType: 'blueprint_technical_architecture', payload: { architecture_summary: 'serverless analytics' }, source: 'analysis-step:stage-14' },
          { artifactType: 'blueprint_data_model', payload: { entities: [] }, source: 'analysis-step:stage-14-projection', gaps: ['g1'] },
          { artifactType: 'blueprint_erd_diagram', payload: { relationships: [] }, source: 'analysis-step:stage-14-projection' },
          { artifactType: 'blueprint_api_contract', payload: { endpoints: [] }, source: 'analysis-step:stage-14-projection' },
          { artifactType: 'blueprint_schema_spec', payload: { schema_format: 'structural' }, source: 'analysis-step:stage-14-projection' },
        ],
        usage: { totalTokens: 42 },
      }),
    });

    const template = await loadStageTemplate(mockSupabase, 14);
    const stepResult = await template.analysisSteps[0].execute({ ventureContext: { id: 'v1', name: 'NicheMetrics' } });

    // Primary regression assertion: the array is at the top level (not buried in payload).
    expect(Array.isArray(stepResult.artifacts)).toBe(true);
    expect(stepResult.artifacts).toHaveLength(5);
    expect(stepResult.artifacts.map((a) => a.artifactType)).toEqual([
      'blueprint_technical_architecture',
      'blueprint_data_model',
      'blueprint_erd_diagram',
      'blueprint_api_contract',
      'blueprint_schema_spec',
    ]);
    // The original bug: artifacts were nested under payload. Guard against re-introduction.
    expect(stepResult.payload?.artifacts).toBeUndefined();
    expect(stepResult.source).toBe('stage-14');
    expect(stepResult.usage).toEqual({ totalTokens: 42 });
  });

  it('still wraps legacy single-payload results (no artifacts array) under payload', async () => {
    getTemplate.mockReturnValue({
      id: 'stage-08',
      version: '1.0.0',
      analysisStep: async () => ({ business_model_canvas: { segments: ['a'] }, usage: { totalTokens: 7 } }),
    });

    const template = await loadStageTemplate(mockSupabase, 8);
    const stepResult = await template.analysisSteps[0].execute({ ventureContext: { id: 'v2', name: 'Legacy' } });

    // Legacy path unchanged: artifactType null, payload carries the result.
    expect(stepResult.artifacts).toBeUndefined();
    expect(stepResult.artifactType).toBeNull();
    expect(stepResult.payload).toMatchObject({ business_model_canvas: { segments: ['a'] } });
    expect(stepResult.source).toBe('stage-08');
  });

  it('does not take the typed-array path for an empty artifacts array', async () => {
    getTemplate.mockReturnValue({
      id: 'stage-09',
      version: '1.0.0',
      analysisStep: async () => ({ exit_strategy: { type: 'acquisition' }, artifacts: [] }),
    });

    const template = await loadStageTemplate(mockSupabase, 9);
    const stepResult = await template.analysisSteps[0].execute({ ventureContext: { id: 'v3', name: 'Empty' } });

    // Empty array must fall through to the legacy wrap (mirrors orchestrator's length>0 guard).
    expect(stepResult.artifactType).toBeNull();
    expect(stepResult.payload).toMatchObject({ exit_strategy: { type: 'acquisition' } });
  });
});
