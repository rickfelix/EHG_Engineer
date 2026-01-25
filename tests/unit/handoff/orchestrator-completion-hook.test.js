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
  executeOrchestratorCompletionHook,
  findNextAvailableOrchestrator,
  emitChainingTelemetry
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

    // SD-LEO-ENH-AUTO-PROCEED-001-05: Orchestrator Chaining Tests
    it('should return chainContinue when chaining enabled and orchestrator available', async () => {
      // Override to enable chaining and provide next orchestrator
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
                      data: {
                        session_id: 'test',
                        metadata: { auto_proceed: true, chain_orchestrators: true }
                      },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              in: () => ({
                is: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => ({
                        neq: () => Promise.resolve({
                          data: [{ id: 'SD-NEXT-001', sd_key: 'SD-NEXT-001', title: 'Next Orchestrator' }],
                          error: null
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        }
        return { select: () => Promise.resolve({ data: [], error: null }) };
      };

      const result = await executeOrchestratorCompletionHook(
        'SD-ORCH-001',
        'Completed Orchestrator',
        5,
        { supabase: mockSupabase }
      );

      expect(result.fired).toBe(true);
      expect(result.autoProceed).toBe(true);
      expect(result.chainContinue).toBe(true);
      expect(result.nextOrchestrator).toBe('SD-NEXT-001');
    });

    it('should not chain when chaining disabled', async () => {
      // Override to disable chaining
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
                      data: {
                        session_id: 'test',
                        metadata: { auto_proceed: true, chain_orchestrators: false }
                      },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              in: () => ({
                is: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => ({
                        neq: () => Promise.resolve({
                          data: [{ id: 'SD-NEXT-001', sd_key: 'SD-NEXT-001', title: 'Next Orchestrator' }],
                          error: null
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        }
        return { select: () => Promise.resolve({ data: [], error: null }) };
      };

      const result = await executeOrchestratorCompletionHook(
        'SD-ORCH-001',
        'Completed Orchestrator',
        5,
        { supabase: mockSupabase }
      );

      expect(result.fired).toBe(true);
      expect(result.autoProceed).toBe(true);
      expect(result.chainContinue).toBeUndefined();
    });
  });

  // SD-LEO-ENH-AUTO-PROCEED-001-05: findNextAvailableOrchestrator Tests
  describe('findNextAvailableOrchestrator', () => {
    it('should find next orchestrator when one is available', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            in: () => ({
              is: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({
                      data: [
                        { id: 'SD-NEXT-001', sd_key: 'SD-NEXT-001', title: 'Next Orch', status: 'draft', priority: 5 }
                      ],
                      error: null
                    })
                  })
                })
              })
            })
          })
        })
      };

      const result = await findNextAvailableOrchestrator(mockSupabase);
      expect(result.orchestrator).toBeDefined();
      expect(result.orchestrator.id).toBe('SD-NEXT-001');
      expect(result.reason).toBe('Next orchestrator found');
    });

    it('should return null when no orchestrators in queue', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            in: () => ({
              is: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null })
                  })
                })
              })
            })
          })
        })
      };

      const result = await findNextAvailableOrchestrator(mockSupabase);
      expect(result.orchestrator).toBe(null);
      expect(result.reason).toBe('No orchestrators in queue');
    });

    it('should exclude current orchestrator when specified', async () => {
      let capturedQuery = null;
      const mockSupabase = {
        from: () => ({
          select: () => ({
            in: () => ({
              is: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => ({
                      neq: (field, value) => {
                        capturedQuery = { field, value };
                        return Promise.resolve({
                          data: [{ id: 'SD-OTHER-001' }],
                          error: null
                        });
                      }
                    })
                  })
                })
              })
            })
          })
        })
      };

      await findNextAvailableOrchestrator(mockSupabase, 'SD-CURRENT-001');
      expect(capturedQuery.value).toBe('SD-CURRENT-001');
    });

    it('should handle database error gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            in: () => ({
              is: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: null, error: { message: 'DB error' } })
                  })
                })
              })
            })
          })
        })
      };

      const result = await findNextAvailableOrchestrator(mockSupabase);
      expect(result.orchestrator).toBe(null);
      expect(result.reason).toContain('Query error');
    });
  });

  // SD-LEO-ENH-AUTO-PROCEED-001-05: emitChainingTelemetry Tests
  describe('emitChainingTelemetry', () => {
    it('should successfully emit chain decision telemetry', async () => {
      let insertedData = null;
      const mockSupabase = {
        from: () => ({
          insert: (data) => {
            insertedData = data;
            return Promise.resolve({ error: null });
          }
        })
      };

      const result = await emitChainingTelemetry(
        mockSupabase,
        'SD-ORCH-001',
        'SD-NEXT-001',
        'chain',
        'corr-123'
      );

      expect(result).toBe(true);
      expect(insertedData.event_type).toBe('ORCHESTRATOR_CHAINING_DECISION');
      expect(insertedData.details.decision).toBe('chain');
      expect(insertedData.details.next_orchestrator_id).toBe('SD-NEXT-001');
      expect(insertedData.severity).toBe('info');
    });

    it('should emit pause_disabled decision with info severity', async () => {
      let insertedData = null;
      const mockSupabase = {
        from: () => ({
          insert: (data) => {
            insertedData = data;
            return Promise.resolve({ error: null });
          }
        })
      };

      await emitChainingTelemetry(
        mockSupabase,
        'SD-ORCH-001',
        null,
        'pause_disabled',
        'corr-456'
      );

      expect(insertedData.details.decision).toBe('pause_disabled');
      expect(insertedData.details.next_orchestrator_id).toBe(null);
      expect(insertedData.severity).toBe('info');
    });

    it('should emit stop_on_error decision with warning severity', async () => {
      let insertedData = null;
      const mockSupabase = {
        from: () => ({
          insert: (data) => {
            insertedData = data;
            return Promise.resolve({ error: null });
          }
        })
      };

      await emitChainingTelemetry(
        mockSupabase,
        'SD-ORCH-001',
        null,
        'stop_on_error',
        'corr-789'
      );

      expect(insertedData.details.decision).toBe('stop_on_error');
      expect(insertedData.severity).toBe('warning');
    });

    it('should return false on database error', async () => {
      const mockSupabase = {
        from: () => ({
          insert: () => Promise.resolve({ error: { message: 'Insert failed' } })
        })
      };

      const result = await emitChainingTelemetry(
        mockSupabase,
        'SD-ORCH-001',
        null,
        'chain',
        'corr-123'
      );

      expect(result).toBe(false);
    });
  });
});
