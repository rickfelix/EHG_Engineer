/**
 * SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001 (L7) activation test.
 *
 * Proves the vision-fidelity gate transitions from a permanent no_vision_key skip to a
 * REAL evaluation once an SD carries metadata.vision_key -- against the real, live database,
 * exercising the exact query fix (eva_vision_documents.vision_key / eva_architecture_plans.plan_key,
 * not the nonexistent `key` column both previously queried).
 *
 * The LLM call itself is injected (llmClient) so this test has zero LLM cost and is
 * deterministic; gitDiffFn is injected so it doesn't depend on the fixture SD having a real
 * git branch. Both injection points are first-class parameters of executeVisionFidelity(),
 * not test-only monkeypatching.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { executeVisionFidelity } from '../../lib/sub-agents/vision-fidelity/index.js';
import { DEFAULT_VISION_KEY } from '../../lib/sd-creation/pipeline.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

let testSdId;
let testSdKey;

const STUB_LLM_RESPONSE = JSON.stringify({
  delivered_elements: [{ element: 'fixture element', severity: 'normal', source_section: 'test', evidence: 'fixture evidence' }],
  partial_elements: [],
  missing_elements: [],
  scope_creep_elements: [],
});

describe.skipIf(!HAS_REAL_DB)('Vision-fidelity gate actually evaluates once vision_key is present (SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001)', () => {
  beforeAll(async () => {
    testSdId = uuidv4();
    testSdKey = `SD-TEST-VISION-GATE-${Date.now()}-001`;

    const { error } = await supabase.from('strategic_directives_v2').insert({
      id: testSdId,
      sd_key: testSdKey,
      title: '[fixture] vision-fidelity gate activation test',
      description: 'Ephemeral integration fixture — safe to delete on sight.',
      rationale: 'L7 activation-invariant coverage.',
      status: 'in_progress',
      current_phase: 'PLAN_VERIFICATION',
      sd_type: 'feature', // block-mode policy per severity-policy.js -- not skip/warn
      category: 'Feature',
      priority: 'low',
      scope: 'ephemeral test fixture',
      target_application: 'EHG_Engineer',
      success_criteria: [{ criterion: 'fixture', measure: 'n/a' }],
      metadata: { vision_key: DEFAULT_VISION_KEY },
    });
    if (error) throw new Error(`Fixture SD insert failed: ${error.message}`);
  });

  afterAll(async () => {
    if (testSdId) {
      await supabase.from('strategic_directives_v2').delete().eq('id', testSdId);
    }
  });

  it('the canonical default vision_key resolves to a real row in eva_vision_documents', async () => {
    const { data, error } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, status, chairman_approved')
      .eq('vision_key', DEFAULT_VISION_KEY)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.status).toBe('active');
    expect(data.chairman_approved).toBe(true);
  });

  it('executeVisionFidelity reaches a real verdict for a vision_key-carrying SD, not a no_vision_key/missing_artifact skip', async () => {
    let llmCalled = false;
    const stubLlmClient = {
      complete: async () => {
        llmCalled = true;
        return STUB_LLM_RESPONSE;
      },
    };
    const stubGitDiffFn = async () => '[fixture diff]';

    const result = await executeVisionFidelity({
      sdId: testSdId,
      supabase,
      dryRun: true, // no sub_agent_execution_results row needed for this assertion
      llmClient: stubLlmClient,
      gitDiffFn: stubGitDiffFn,
    });

    expect(llmCalled).toBe(true); // proves the flow reached the comparison stage, not an early skip
    expect(result.details?.skipped_reason).not.toBe('no_vision_key');
    expect(result.details?.missing_artifact).not.toBe('eva_vision_documents');
    expect(result.verdict).toBe('PASS'); // fixture LLM response has zero missing/scope-creep elements
    expect(result.passed).toBe(true);
    expect(result.delivered_elements).toHaveLength(1);
  });

  it('without a vision_key, the gate still short-circuits to no_vision_key (baseline unchanged for un-stamped legacy SDs)', async () => {
    const bareSdId = uuidv4();
    const bareSdKey = `SD-TEST-VISION-GATE-BARE-${Date.now()}-001`;
    const { error: insErr } = await supabase.from('strategic_directives_v2').insert({
      id: bareSdId,
      sd_key: bareSdKey,
      title: '[fixture] vision-fidelity bare SD (no vision_key)',
      description: 'Ephemeral integration fixture — safe to delete on sight.',
      rationale: 'L7 activation-invariant coverage (negative case).',
      status: 'in_progress',
      current_phase: 'PLAN_VERIFICATION',
      sd_type: 'feature',
      category: 'Feature',
      priority: 'low',
      scope: 'ephemeral test fixture',
      target_application: 'EHG_Engineer',
      success_criteria: [{ criterion: 'fixture', measure: 'n/a' }],
      metadata: {},
    });
    expect(insErr).toBeNull();

    try {
      const result = await executeVisionFidelity({ sdId: bareSdId, supabase, dryRun: true });
      expect(result.details?.skipped_reason).toBe('no_vision_key');
    } finally {
      await supabase.from('strategic_directives_v2').delete().eq('id', bareSdId);
    }
  });
});
