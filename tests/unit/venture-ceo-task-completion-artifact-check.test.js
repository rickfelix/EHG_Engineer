// SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-5): _updateVentureProgress (lib/agents/venture-ceo/
// handlers.js, called via handleCEOTaskCompletion) must refuse to advance
// current_lifecycle_stage when the completed stage's required artifacts are missing, reusing
// checkStageArtifactPrecondition (the same fail-open check lib/eva/stage-execution-worker.js's
// _advanceStage choke-point already enforces for the daemon-walk path).
//
// NOTE: Test file lives at tests/unit/ (not tests/unit/agents/) because the vitest config has a
// glob exclude pattern for the agents directory which would prevent test discovery (mirrors
// tests/unit/venture-ceo-handlers.test.js's own note).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/eva/stage-artifact-precondition.js', () => ({
  checkStageArtifactPrecondition: vi.fn(),
}));

const { handleCEOTaskCompletion } = await import('../../lib/agents/venture-ceo/handlers.js');
const { checkStageArtifactPrecondition } = await import('../../lib/eva/stage-artifact-precondition.js');

function createMockSupabase() {
  const updates = [];
  return {
    updates,
    from: vi.fn(() => ({
      update: vi.fn((payload) => ({
        eq: vi.fn(() => {
          updates.push(payload);
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('_updateVentureProgress artifact-existence check (via handleCEOTaskCompletion)', () => {
  it('refuses to advance current_lifecycle_stage when required artifacts are missing', async () => {
    checkStageArtifactPrecondition.mockResolvedValue({
      blocked: true,
      missingArtifacts: ['truth_financial_model'],
      deviatedArtifacts: [],
      source: 'canonical',
    });
    const supabase = createMockSupabase();
    const context = { supabase, ventureId: 'v-1' };

    const result = await handleCEOTaskCompletion(context, {
      id: 'msg-1',
      from_agent_id: 'vp-1',
      body: { task_id: 't-1', status: 'completed', deliverables: [], metrics: { stage_completed: 5 } },
    });

    expect(checkStageArtifactPrecondition).toHaveBeenCalledWith(supabase, 'v-1', 5);
    expect(supabase.updates).toHaveLength(0);
    // The handler itself still reports the message as processed -- the block is silent-refuse
    // at the progress-write site, mirroring _advanceStage's own non-throwing choke-point contract.
    expect(result.status).toBe('completed');
  });

  it('advances current_lifecycle_stage when required artifacts are present', async () => {
    checkStageArtifactPrecondition.mockResolvedValue({
      blocked: false,
      missingArtifacts: [],
      deviatedArtifacts: [],
      source: 'canonical',
    });
    const supabase = createMockSupabase();
    const context = { supabase, ventureId: 'v-1' };

    await handleCEOTaskCompletion(context, {
      id: 'msg-2',
      from_agent_id: 'vp-1',
      body: { task_id: 't-2', status: 'completed', deliverables: [], metrics: { stage_completed: 5 } },
    });

    expect(supabase.updates).toHaveLength(1);
    expect(supabase.updates[0]).toMatchObject({ current_lifecycle_stage: 6 });
  });

  it('does not check artifacts or advance when the task is not marked completed', async () => {
    const supabase = createMockSupabase();
    const context = { supabase, ventureId: 'v-1' };

    await handleCEOTaskCompletion(context, {
      id: 'msg-3',
      from_agent_id: 'vp-1',
      body: { task_id: 't-3', status: 'in_progress', deliverables: [], metrics: { stage_completed: 5 } },
    });

    expect(checkStageArtifactPrecondition).not.toHaveBeenCalled();
    expect(supabase.updates).toHaveLength(0);
  });
});
