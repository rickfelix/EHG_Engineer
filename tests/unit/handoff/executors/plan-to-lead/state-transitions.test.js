/**
 * Tests for state-transitions.js - orchestrator template satisfaction
 * RCA: PAT-TEMPLATE-CODE-SYNC-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// SD-LEO-INFRA-BACKEND-WRITE-SAFETY-001: stub the new retro-clobber-guard helper
// so existing tests' Supabase mocks don't need to satisfy its SELECT chain.
vi.mock('../../../../../scripts/modules/handoff/lib/retro-clobber-guard.js', () => ({
  isSafeToWriteRetro: vi.fn().mockResolvedValue({ safe: true, reason: 'no_retro', existingRetro: null }),
}));

import {
  satisfyOrchestratorTemplateRequirements,
  finalizeUserStories,
} from '../../../../../scripts/modules/handoff/executors/plan-to-lead/state-transitions.js';

describe('satisfyOrchestratorTemplateRequirements', () => {
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip creation when handoff and retrospective already exist', async () => {
    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ id: 'existing-handoff' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'existing-retro' }],
                  error: null,
                }),
              }),
            }),
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(result.created).toHaveLength(0);
  });

  it('should create handoff when missing', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: insertFn,
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'existing-retro' }],
                  error: null,
                }),
              }),
            }),
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(result.created).toContain('PLAN-TO-LEAD handoff');
    expect(insertFn).toHaveBeenCalledOnce();
    expect(insertFn.mock.calls[0][0].handoff_type).toBe('PLAN-TO-LEAD');
  });

  it('should create retrospective when missing', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ id: 'existing-handoff' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            insert: insertFn,
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(result.created).toContain('retrospective');
    expect(insertFn).toHaveBeenCalledOnce();
    // SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001: must be the canonical completion
    // type — 'orchestrator_completion' was invisible to retro-filters.js and the
    // LEAD-FINAL-APPROVAL RETROSPECTIVE_EXISTS gate.
    expect(insertFn.mock.calls[0][0].retro_type).toBe('SD_COMPLETION');
  });

  // QF-20260713-742 / PAT-TEMPLATE-CODE-SYNC-001: the insert previously had no
  // target_application at all, failing NOT NULL / the registry-aware validation
  // trigger on every orchestrator with zero existing retros.
  it('should resolve target_application from sd.metadata.venture_name when registered', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-handoff' }], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: insertFn,
          };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: vi.fn((cols) => {
              if (cols === 'metadata') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { metadata: { venture_name: 'ApexNiche AI' } },
                      error: null,
                    }),
                  }),
                };
              }
              return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }),
          };
        }
        if (table === 'applications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ name: 'ApexNiche AI' }], error: null }),
            }),
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(insertFn.mock.calls[0][0].target_application).toBe('ApexNiche AI');
  });

  it('should fall back to EHG_Engineer when venture_name is unregistered and no child retro exists', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-handoff' }], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: insertFn,
          };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: vi.fn((cols) => {
              if (cols === 'metadata') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { metadata: { venture_name: 'Unregistered Venture' } },
                      error: null,
                    }),
                  }),
                };
              }
              return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }),
          };
        }
        if (table === 'applications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(insertFn.mock.calls[0][0].target_application).toBe('EHG_Engineer');
  });

  it('should create both when both missing', async () => {
    const handoffInsert = vi.fn().mockResolvedValue({ error: null });
    const retroInsert = vi.fn().mockResolvedValue({ error: null });

    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: handoffInsert,
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            insert: retroInsert,
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(result.created).toHaveLength(2);
    expect(handoffInsert).toHaveBeenCalledOnce();
    expect(retroInsert).toHaveBeenCalledOnce();
  });

  it('should handle db errors gracefully', async () => {
    mockDb = {
      from: vi.fn().mockImplementation(() => { throw new Error('Connection lost'); }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(false);
    expect(result.created).toHaveLength(0);
  });

  it('should handle null data from queries', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockDb = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: insertFn,
          };
        }
        if (table === 'retrospectives') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
            insert: insertFn,
          };
        }
      }),
    };

    const result = await satisfyOrchestratorTemplateRequirements(mockDb, 'sd-123', 'Test SD');
    expect(result.satisfied).toBe(true);
    expect(result.created).toHaveLength(2);
  });
});

// SD-LEO-INFRA-STORY-CASCADE-ADDITIVE-ONLY-001: finalizeUserStories() must stamp
// completed_by/completed_at only on a genuine first-time completion, never on a
// validation-only repair of an already-completed story, and never overwriting an
// existing completed_by value.
describe('finalizeUserStories', () => {
  function makeStoriesMock(stories) {
    const updateCalls = [];
    const updateFn = vi.fn((updates) => {
      updateCalls.push(updates);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });
    const db = {
      from: vi.fn((table) => {
        if (table === 'user_stories') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: stories, error: null }),
            }),
            update: updateFn,
          };
        }
        return {};
      }),
    };
    return { db, updateCalls, updateFn };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TS-1: stamps a fresh ready-status story on first completion', async () => {
    const story = {
      id: 's1',
      title: 'Story 1',
      status: 'ready',
      validation_status: 'pending',
      e2e_test_path: null,
      e2e_test_status: null,
      completed_by: null,
    };
    const { db, updateCalls } = makeStoriesMock([story]);

    await finalizeUserStories(db, null, 'sd-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe('completed');
    expect(updateCalls[0].validation_status).toBe('validated');
    expect(updateCalls[0].completed_by).toBe('system:finalizeUserStories');
    expect(updateCalls[0].completed_at).toBeTruthy();
  });

  it('TS-2: does NOT stamp a story that is already completed and only needs validation_status repaired', async () => {
    const story = {
      id: 's2',
      title: 'Story 2',
      status: 'completed',
      validation_status: 'pending',
      e2e_test_path: null,
      e2e_test_status: null,
      completed_by: null,
    };
    const { db, updateCalls } = makeStoriesMock([story]);

    await finalizeUserStories(db, null, 'sd-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].validation_status).toBe('validated');
    expect(updateCalls[0].completed_by).toBeUndefined();
    expect(updateCalls[0].completed_at).toBeUndefined();
  });

  it('TS-3: never overwrites an existing completed_by value', async () => {
    const story = {
      id: 's3',
      title: 'Story 3',
      status: 'ready',
      validation_status: 'pending',
      e2e_test_path: null,
      e2e_test_status: null,
      completed_by: 'Alpha (worker session e7c92ad8)',
    };
    const { db, updateCalls } = makeStoriesMock([story]);

    await finalizeUserStories(db, null, 'sd-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].completed_by).toBeUndefined();
    expect(updateCalls[0].completed_at).toBeUndefined();
  });
});
