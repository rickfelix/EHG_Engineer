/**
 * Tests for state-transitions.js - orchestrator template satisfaction
 * RCA: PAT-TEMPLATE-CODE-SYNC-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { satisfyOrchestratorTemplateRequirements } from '../../../../../scripts/modules/handoff/executors/plan-to-lead/state-transitions.js';

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
    expect(insertFn.mock.calls[0][0].retro_type).toBe('orchestrator_completion');
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
