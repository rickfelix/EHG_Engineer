/**
 * Unit tests for Orchestrator Completion Hook
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-03
 */

// Jest provides describe, it, expect, beforeEach globally
import {
  generateIdempotencyKey,
  hasHookFired,
  recordHookEvent,
  executeOrchestratorCompletionHook
} from '../../../scripts/modules/handoff/orchestrator-completion-hook.js';

describe('Orchestrator Completion Hook', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate correlation keys containing orchestrator ID and timestamp', () => {
      const key = generateIdempotencyKey('SD-TEST-001');

      expect(key).toContain('SD-TEST-001');
      expect(key).toMatch(/^orch-completion-SD-TEST-001-\d+$/);
      // Key includes timestamp for correlation tracing
      // Note: Actual idempotency is handled by hasHookFired() database check
    });

    it('should include orchestrator ID in key', () => {
      const key = generateIdempotencyKey('SD-ORCH-123');
      expect(key).toContain('SD-ORCH-123');
      expect(key).toMatch(/^orch-completion-SD-ORCH-123-\d+$/);
    });
  });

  describe('hasHookFired', () => {
    it('should return false when no hook event exists', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [], error: null })
              })
            })
          })
        })
      };

      const result = await hasHookFired(mockSupabase, 'SD-TEST-001');
      expect(result).toBe(false);
    });

    it('should return true when hook event exists', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [{ id: 'event-1' }], error: null })
              })
            })
          })
        })
      };

      const result = await hasHookFired(mockSupabase, 'SD-TEST-001');
      expect(result).toBe(true);
    });

    it('should fail open on error (return false)', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: null, error: { message: 'DB error' } })
              })
            })
          })
        })
      };

      const result = await hasHookFired(mockSupabase, 'SD-TEST-001');
      expect(result).toBe(false);
    });
  });

  describe('recordHookEvent', () => {
    it('should successfully record hook event', async () => {
      const mockSupabase = {
        from: () => ({
          insert: () => Promise.resolve({ error: null })
        })
      };

      const result = await recordHookEvent(
        mockSupabase,
        'SD-TEST-001',
        'corr-123',
        { autoProceed: true, childCount: 5 }
      );

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      const mockSupabase = {
        from: () => ({
          insert: () => Promise.resolve({ error: { message: 'Insert failed' } })
        })
      };

      const result = await recordHookEvent(
        mockSupabase,
        'SD-TEST-001',
        'corr-123',
        {}
      );

      expect(result).toBe(false);
    });
  });

  describe('executeOrchestratorCompletionHook', () => {
    let mockSupabase;

    beforeEach(() => {
      // Reset mock for each test
      mockSupabase = {
        from: (table) => {
          if (table === 'system_events') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: () => Promise.resolve({ data: [], error: null })
                  })
                })
              }),
              insert: () => Promise.resolve({ error: null })
            };
          }
          if (table === 'strategic_directives_v2') {
            return {
              select: () => ({
                in: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [], error: null })
                    })
                  })
                })
              })
            };
          }
          if (table === 'claude_sessions') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      single: () => Promise.resolve({
                        data: { session_id: 'test-session', metadata: { auto_proceed: true } },
                        error: null
                      })
                    })
                  })
                })
              })
            };
          }
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
      };
    });

    it('should fire hook when not previously fired', async () => {
      const result = await executeOrchestratorCompletionHook(
        'SD-ORCH-001',
        'Test Orchestrator',
        5,
        { supabase: mockSupabase }
      );

      expect(result.fired).toBe(true);
      expect(result.correlationId).toContain('SD-ORCH-001');
    });

    it('should skip when hook already fired (idempotency)', async () => {
      // Override to simulate hook already fired
      mockSupabase.from = (table) => {
        if (table === 'system_events') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => Promise.resolve({ data: [{ id: 'existing' }], error: null })
                })
              })
            })
          };
        }
        return { select: () => Promise.resolve({ data: [], error: null }) };
      };

      const result = await executeOrchestratorCompletionHook(
        'SD-ORCH-001',
        'Test Orchestrator',
        5,
        { supabase: mockSupabase }
      );

      expect(result.fired).toBe(false);
    });

    it('should respect AUTO-PROCEED setting', async () => {
      // Override to disable AUTO-PROCEED
      mockSupabase.from = (table) => {
        if (table === 'system_events') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => Promise.resolve({ data: [], error: null })
                })
              })
            }),
            insert: () => Promise.resolve({ error: null })
          };
        }
        if (table === 'claude_sessions') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    single: () => Promise.resolve({
                      data: { session_id: 'test', metadata: { auto_proceed: false } },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null })
                })
              })
            })
          })
        };
      };

      const result = await executeOrchestratorCompletionHook(
        'SD-ORCH-001',
        'Test Orchestrator',
        5,
        { supabase: mockSupabase }
      );

      expect(result.fired).toBe(true);
      expect(result.autoProceed).toBe(false);
    });
  });
});
