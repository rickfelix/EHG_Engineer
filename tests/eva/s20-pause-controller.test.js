/**
 * Tests for S20 Pause Controller
 *
 * SD-LEO-INFRA-S20-VENTURE-LEO-001
 *
 * Tests the pause/resume state machine, backward compatibility,
 * force advance, and progress reporting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { S20PauseController, PAUSE_STATES } from '../../lib/eva/s20-pause-controller.js';

// Mock Supabase client
function createMockSupabase(overrides = {}) {
  const defaultData = {
    venture_stage_work: null,
    strategic_directives: [],
    children: [],
  };
  const data = { ...defaultData, ...overrides };

  const mockFrom = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === 'venture_stage_work') {
          return { data: data.venture_stage_work, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      order: () => chain,
      upsert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      then: (fn) => {
        if (table === 'strategic_directives_v2') {
          return fn({ data: data.strategic_directives, error: null });
        }
        if (table === 'venture_stage_work') {
          return fn({ data: data.venture_stage_work ? [data.venture_stage_work] : [], error: null });
        }
        return fn({ data: [], error: null });
      },
    };
    return chain;
  };

  return {
    from: vi.fn(mockFrom),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb) => { if (cb) cb('SUBSCRIBED'); return { unsubscribe: vi.fn() }; }),
    })),
    removeChannel: vi.fn(),
  };
}

const mockLogger = {
  log: vi.fn(),
  warn: vi.fn(),
};

describe('S20PauseController', () => {
  let controller;
  let supabase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PAUSE_STATES', () => {
    it('exports all required states', () => {
      expect(PAUSE_STATES.CHECKING).toBe('CHECKING');
      expect(PAUSE_STATES.PAUSED).toBe('PAUSED');
      expect(PAUSE_STATES.RESUMING).toBe('RESUMING');
      expect(PAUSE_STATES.COMPLETE).toBe('COMPLETE');
    });
  });

  describe('check() — no linked SDs (backward compatibility)', () => {
    it('returns not blocked when no SDs linked to venture', async () => {
      supabase = createMockSupabase({ strategic_directives: [] });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(false);
      expect(result.status).toBe('no_sds');
      expect(result.data.total_sds).toBe(0);
    });
  });

  describe('check() — all SDs completed', () => {
    it('returns not blocked when all orchestrator SDs are completed', async () => {
      const sds = [
        { id: 'sd-1', sd_key: 'SD-ORCH-001', title: 'Test', status: 'completed', current_phase: 'COMPLETED', progress: 100, parent_sd_id: null },
      ];
      supabase = createMockSupabase({ strategic_directives: sds });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(false);
      expect(result.status).toBe('complete');
    });
  });

  describe('check() — SDs in progress', () => {
    it('returns blocked when orchestrator SDs are not complete', async () => {
      const sds = [
        { id: 'sd-1', sd_key: 'SD-ORCH-001', title: 'Test', status: 'in_progress', current_phase: 'EXEC', progress: 50, parent_sd_id: null },
      ];
      supabase = createMockSupabase({ strategic_directives: sds });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(true);
      expect(result.status).toBe('paused');
      expect(result.data.state).toBe(PAUSE_STATES.PAUSED);
      expect(result.data.total_sds).toBe(1);
      expect(result.data.non_terminal_sds).toBe(1);
    });
  });

  describe('check() — multi-orchestrator', () => {
    it('remains blocked when only some orchestrators are complete', async () => {
      const sds = [
        { id: 'sd-1', sd_key: 'SD-ORCH-001', title: 'First', status: 'completed', current_phase: 'COMPLETED', progress: 100, parent_sd_id: null },
        { id: 'sd-2', sd_key: 'SD-ORCH-002', title: 'Second', status: 'in_progress', current_phase: 'EXEC', progress: 30, parent_sd_id: null },
      ];
      supabase = createMockSupabase({ strategic_directives: sds });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(true);
      expect(result.data.completed_sds).toBe(1);
      expect(result.data.non_terminal_sds).toBe(1);
    });

    it('resumes when ALL orchestrators are complete', async () => {
      const sds = [
        { id: 'sd-1', sd_key: 'SD-ORCH-001', title: 'First', status: 'completed', current_phase: 'COMPLETED', progress: 100, parent_sd_id: null },
        { id: 'sd-2', sd_key: 'SD-ORCH-002', title: 'Second', status: 'completed', current_phase: 'COMPLETED', progress: 100, parent_sd_id: null },
      ];
      supabase = createMockSupabase({ strategic_directives: sds });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(false);
      expect(result.status).toBe('complete');
    });
  });

  describe('check() — force advance', () => {
    it('returns not blocked when force_advanced is true', async () => {
      supabase = createMockSupabase({
        venture_stage_work: {
          advisory_data: {
            pause_state: { state: PAUSE_STATES.PAUSED, force_advanced: true },
          },
        },
        strategic_directives: [
          { id: 'sd-1', sd_key: 'SD-001', title: 'Test', status: 'in_progress', current_phase: 'EXEC', progress: 50, parent_sd_id: null },
        ],
      });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(false);
      expect(result.status).toBe('force_advanced');
    });
  });

  describe('check() — Replit build path', () => {
    it('returns replit_path status for Replit ventures', async () => {
      supabase = createMockSupabase({
        venture_stage_work: {
          advisory_data: { build_method: 'replit_agent' },
        },
      });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(false);
      expect(result.status).toBe('replit_path');
    });
  });

  describe('check() — error handling', () => {
    it('fails open on error (does not block)', async () => {
      supabase = {
        from: vi.fn(() => { throw new Error('DB connection failed'); }),
        channel: vi.fn(),
        removeChannel: vi.fn(),
      };
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      expect(result.blocked).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('check() — child SDs excluded from top-level', () => {
    it('only watches top-level SDs, not children', async () => {
      const sds = [
        { id: 'sd-parent', sd_key: 'SD-ORCH-001', title: 'Parent', status: 'in_progress', current_phase: 'EXEC', progress: 50, parent_sd_id: null },
        { id: 'sd-child-1', sd_key: 'SD-ORCH-001-A', title: 'Child A', status: 'completed', current_phase: 'COMPLETED', progress: 100, parent_sd_id: 'sd-parent' },
        { id: 'sd-child-2', sd_key: 'SD-ORCH-001-B', title: 'Child B', status: 'in_progress', current_phase: 'EXEC', progress: 40, parent_sd_id: 'sd-parent' },
      ];
      supabase = createMockSupabase({ strategic_directives: sds });
      controller = new S20PauseController(supabase, mockLogger);

      const result = await controller.check('venture-123');

      // Only the parent should be in the top-level check, not children
      expect(result.blocked).toBe(true);
      expect(result.data.total_sds).toBe(1); // Only parent
    });
  });

  describe('forceAdvance()', () => {
    it('sets force_advanced in pause state', async () => {
      supabase = createMockSupabase();
      controller = new S20PauseController(supabase, mockLogger);

      await controller.forceAdvance('venture-123', 'rick');

      // Verify upsert was called
      expect(supabase.from).toHaveBeenCalledWith('venture_stage_work');
    });
  });

  describe('getProgress()', () => {
    it('returns orchestrator tree with children', async () => {
      const sds = [
        { id: 'sd-parent', sd_key: 'SD-ORCH-001', title: 'Parent', status: 'in_progress', current_phase: 'EXEC', progress: 50, parent_sd_id: null },
        { id: 'sd-child-1', sd_key: 'SD-ORCH-001-A', title: 'Child A', status: 'completed', current_phase: 'COMPLETED', progress: 100, parent_sd_id: 'sd-parent' },
      ];

      // Need a more sophisticated mock for getProgress since it makes multiple queries
      const mockFrom = (table) => {
        const chain = {
          select: () => chain,
          eq: (col, val) => {
            chain._lastEq = { col, val };
            return chain;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => chain,
          then: (fn) => {
            if (table === 'strategic_directives_v2') {
              // If querying children (parent_sd_id filter)
              if (chain._lastEq?.col === 'parent_sd_id') {
                const children = sds.filter(sd => sd.parent_sd_id === chain._lastEq.val);
                return fn({ data: children, error: null });
              }
              return fn({ data: sds, error: null });
            }
            return fn({ data: null, error: null });
          },
        };
        return chain;
      };

      supabase = { from: vi.fn(mockFrom), channel: vi.fn(), removeChannel: vi.fn() };
      controller = new S20PauseController(supabase, mockLogger);

      const progress = await controller.getProgress('venture-123');

      expect(progress.orchestrators.length).toBe(1);
      expect(progress.orchestrators[0].sd_key).toBe('SD-ORCH-001');
      expect(progress.summary.total_orchestrators).toBe(1);
    });
  });

  describe('destroy()', () => {
    it('does not throw on empty state', () => {
      supabase = createMockSupabase();
      controller = new S20PauseController(supabase, mockLogger);

      expect(() => controller.destroy()).not.toThrow();
    });
  });
});
