import { describe, it, expect } from 'vitest';
import { runVentureScreen } from '../../../../lib/foresight/workflow/run-venture-screen.js';
import { loadCouncils } from '../../../../lib/foresight/content/index.mjs';
import { createMockSupabase, createMockLLMClient, SAMPLE_SPECIALIST_OUTPUT, SAMPLE_ADJUDICATOR_OUTPUT, SAMPLE_EVA_OUTPUT } from './test-helpers.js';

/** Build the exact FIFO response queue runVentureScreen() will consume: for each of
 *  the 5 real councils, 3 specialist responses + 1 adjudicator response, then 1 EVA
 *  synthesis response at the end. */
function buildFullBoardResponseQueue() {
  const councils = loadCouncils();
  const queue = [];
  for (const council of councils) {
    for (let i = 0; i < council.specialist_perspective_ids.length; i++) queue.push(SAMPLE_SPECIALIST_OUTPUT);
    queue.push(SAMPLE_ADJUDICATOR_OUTPUT);
  }
  queue.push(SAMPLE_EVA_OUTPUT);
  return queue;
}

describe('runVentureScreen (PRD FR-4, spec section 9.2)', () => {
  it('produces 15 specialist_assessments + 5 council_adjudications + 1 venture_decision_dossiers rows for a full mock run', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(buildFullBoardResponseQueue());

    const result = await runVentureScreen('vc-test-001', { supabase, llmClient });

    expect(result.errors).toEqual([]);
    expect(result.specialistAssessmentIds).toHaveLength(15);
    expect(result.councilAdjudicationIds).toHaveLength(5);
    expect(result.dossierId).toBeTruthy();
    expect(supabase.inserted.specialist_assessments).toHaveLength(15);
    expect(supabase.inserted.council_adjudications).toHaveLength(5);
    expect(supabase.inserted.venture_decision_dossiers).toHaveLength(1);
  });

  it('the dossier references exactly the 5 council_adjudications ids produced by this run', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(buildFullBoardResponseQueue());

    const result = await runVentureScreen('vc-test-001', { supabase, llmClient });

    const dossierRow = supabase.inserted.venture_decision_dossiers[0];
    expect(dossierRow.council_adjudication_ids.sort()).toEqual([...result.councilAdjudicationIds].sort());
  });

  it('accepts a full venture-candidate context object, not just a bare id string', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(buildFullBoardResponseQueue());

    const result = await runVentureScreen({ venture_candidate_id: 'vc-test-002', venture_name: 'Another Venture' }, { supabase, llmClient });

    expect(result.dossierId).toBeTruthy();
    expect(supabase.inserted.specialist_assessments[0].venture_candidate_id).toBe('vc-test-002');
  });

  it('a malformed response for exactly one specialist call surfaces a collected error without aborting the rest of the run (PRD FR-4)', async () => {
    const supabase = createMockSupabase();
    const queue = buildFullBoardResponseQueue();
    queue[0] = 'not valid json at all'; // corrupt the very first specialist call
    const llmClient = createMockLLMClient(queue);

    const result = await runVentureScreen('vc-test-001', { supabase, llmClient });

    // 1 specialist failed -> 14 specialist assessments instead of 15; everything
    // downstream (all 5 councils' adjudications + the dossier) still completes.
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].stage).toBe('specialist');
    expect(result.specialistAssessmentIds).toHaveLength(14);
    expect(result.councilAdjudicationIds).toHaveLength(5);
    expect(result.dossierId).toBeTruthy();
  });

  it('makes no live LLM API calls -- every call is served by the injected mock client', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(buildFullBoardResponseQueue());

    await runVentureScreen('vc-test-001', { supabase, llmClient });

    expect(llmClient.complete).toHaveBeenCalledTimes(21); // 15 specialist + 5 adjudicator + 1 eva
  });
});
