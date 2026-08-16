/**
 * Unit tests for Orchestrator Completion Hook
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-03
 */

// Jest provides describe, it, expect, beforeEach globally
// SD-MAN-INFRA-CLAIM-AUTO-PROCEED-001: Mock claim and terminal modules to avoid real DB calls
import { vi } from 'vitest';
vi.mock('../../../lib/claim-guard.mjs', () => ({
  claimGuard: vi.fn().mockResolvedValue({ success: true, claim: { status: 'newly_acquired' } }),
  isSameConversation: vi.fn().mockReturnValue(true)
}));
vi.mock('../../../lib/terminal-identity.js', () => ({
  getTerminalId: vi.fn().mockReturnValue('win-cc-test-12345')
}));
// Mock resolve-own-session — default returns auto_proceed=true, chain=true; override per-test
import { resolveOwnSession } from '../../../lib/resolve-own-session.js';
vi.mock('../../../lib/resolve-own-session.js', () => ({
  resolveOwnSession: vi.fn()
}));

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

    // Pre-existing: resolveOwnSession doesn't match mock's .eq().order().limit().single() chain
    it.skip('should respect AUTO-PROCEED setting', async () => {
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
    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001: individually skipped (not the whole
    // file) — this test was the sole reason the ENTIRE file was quarantined in
    // tests/quarantine-manifest.json since 2026-06-11 (assertion-drift, linked_ref
    // feedback:65fce396-3dfb-4fda-b9d4-81417d7205f7, a generic 114-file re-pin backlog item,
    // defer_only:true — never actively worked). That whole-file quarantine silently dropped
    // this SD's own new TS-2/[STATIC] tests from real CI collection (found by
    // testing-plan-cascade — the exact "test file in zero collected projects never runs,
    // and the suite still says green" class this repo has hit before, commit 5a2be57d588).
    // Confirmed via git-stash isolation this test fails identically against unmodified HEAD
    // (pre-existing, unrelated to this SD) — see harness bug feedback 9fe2e252-03dc-4ae9-aa75-8c7f59fbabc3.
    // Un-quarantining the file and skipping only this one test keeps the drift VISIBLE
    // (reports skipped, not silently absent) while giving the other 24 tests in this file
    // real CI coverage again.
    it.skip('should return chainContinue when chaining enabled and orchestrator available', async () => {
      // SD-MAN-INFRA-CLAIM-AUTO-PROCEED-001: Configure session mock for chaining=true
      resolveOwnSession.mockResolvedValue({
        data: { session_id: 'test', metadata: { auto_proceed: true, chain_orchestrators: true } },
        error: null
      });

      // Flexible chainable mock that handles any method chain and resolves at await
      const chainable = (data) => {
        const make = () => new Proxy(() => {}, {
          apply: () => make(),
          get: (_, prop) => {
            if (prop === 'then') return (resolve) => resolve({ data, error: null });
            if (prop === 'single') return () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null });
            return make();
          }
        });
        return { select: make(), insert: () => Promise.resolve({ error: null }) };
      };

      mockSupabase.from = (table) => {
        if (table === 'system_events') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
            insert: () => Promise.resolve({ error: null })
          };
        }
        if (table === 'claude_sessions') return chainable([]);
        if (table === 'strategic_directives_v2') {
          return chainable([{ id: 'SD-NEXT-001', sd_key: 'SD-NEXT-001', title: 'Next Orchestrator', parent_sd_id: null, priority: 5, category: 'test', current_phase: 'LEAD' }]);
        }
        return chainable([]);
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
      // Legacy fallback: no session ID resolved → unclaimed but still chains
      expect(result.claimed).toBe(false);
    });

    it('should not chain when chaining disabled', async () => {
      // SD-MAN-INFRA-CLAIM-AUTO-PROCEED-001: Set chaining=false for this test
      resolveOwnSession.mockResolvedValue({
        data: { session_id: 'test', metadata: { auto_proceed: true, chain_orchestrators: false } },
        error: null
      });

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
      // SD-MAN-INFRA-CLAIM-AUTO-PROCEED-001: mock must handle both claude_sessions
      // claim-awareness query and strategic_directives_v2 query.
      // .limit() must be thenable (await-able) AND support .neq() chaining.
      const orchData = [{ id: 'SD-NEXT-001', sd_key: 'SD-NEXT-001', title: 'Next Orch', status: 'draft', priority: 5 }];
      const makeLimitResult = (data) => {
        const result = Promise.resolve({ data, error: null });
        result.neq = () => Promise.resolve({ data, error: null });
        return result;
      };
      const mockSupabase = {
        from: (table) => {
          if (table === 'claude_sessions') {
            return { select: () => ({ not: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
          }
          return {
            select: () => ({
              in: () => ({
                is: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => makeLimitResult(orchData)
                    })
                  })
                })
              })
            })
          };
        }
      };

      const result = await findNextAvailableOrchestrator(mockSupabase);
      expect(result.orchestrator).toBeDefined();
      expect(result.orchestrator.id).toBe('SD-NEXT-001');
      expect(result.reason).toBe('Next orchestrator found');
    });

    it('should return null when no orchestrators in queue', async () => {
      const makeLimitResult = (data) => {
        const result = Promise.resolve({ data, error: null });
        result.neq = () => Promise.resolve({ data, error: null });
        return result;
      };
      const mockSupabase = {
        from: (table) => {
          if (table === 'claude_sessions') {
            return { select: () => ({ not: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
          }
          return {
            select: () => ({
              in: () => ({
                is: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => makeLimitResult([])
                    })
                  })
                })
              })
            })
          };
        }
      };

      const result = await findNextAvailableOrchestrator(mockSupabase);
      expect(result.orchestrator).toBe(null);
      expect(result.reason).toBe('No orchestrators in queue');
    });

    it('should exclude current orchestrator when specified', async () => {
      let capturedQuery = null;
      const mockSupabase = {
        from: (table) => {
          if (table === 'claude_sessions') {
            return { select: () => ({ not: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
          }
          return {
            select: () => ({
              in: () => ({
                is: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => {
                        const result = Promise.resolve({
                          data: [{ id: 'SD-OTHER-001', sd_key: 'SD-OTHER-001' }],
                          error: null
                        });
                        result.neq = (field, value) => {
                          capturedQuery = { field, value };
                          return Promise.resolve({
                            data: [{ id: 'SD-OTHER-001', sd_key: 'SD-OTHER-001' }],
                            error: null
                          });
                        };
                        return result;
                      }
                    })
                  })
                })
              })
            })
          };
        }
      };

      await findNextAvailableOrchestrator(mockSupabase, 'SD-CURRENT-001');
      expect(capturedQuery.value).toBe('SD-CURRENT-001');
    });

    it('should handle database error gracefully', async () => {
      const makeLimitResult = (data, error) => {
        const result = Promise.resolve({ data, error });
        result.neq = () => Promise.resolve({ data, error });
        return result;
      };
      const mockSupabase = {
        from: (table) => {
          if (table === 'claude_sessions') {
            return { select: () => ({ not: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
          }
          return {
            select: () => ({
              in: () => ({
                is: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => makeLimitResult(null, { message: 'DB error' })
                    })
                  })
                })
              })
            })
          };
        }
      };

      const result = await findNextAvailableOrchestrator(mockSupabase);
      expect(result.orchestrator).toBe(null);
      expect(result.reason).toContain('Query error');
    });

    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-2/TS-2): authority-fence tests.
    // Uses a universally-chainable, universally-thenable mock (every method the real
    // code could call resolves correctly, including .range() for the paginated
    // claimed-sessions query) so a missing chained method can never silently fail open
    // and make the assertion vacuous (the exact TESTING sub-agent F7 finding).
    describe('authority fence (FR-2)', () => {
      function makeChainableQuery(terminalValue) {
        const methods = ['select', 'in', 'is', 'neq', 'not', 'order', 'range', 'eq', 'limit'];
        const chain = {};
        for (const m of methods) chain[m] = vi.fn(() => chain);
        chain.then = (resolve) => resolve(terminalValue);
        return chain;
      }
      function mockSupabaseFor(candidates, claimedSessions = []) {
        return {
          from: vi.fn((table) => {
            if (table === 'claude_sessions') return makeChainableQuery({ data: claimedSessions, error: null });
            return makeChainableQuery({ data: candidates, error: null });
          }),
        };
      }

      const FENCED = { id: 'fenced-uuid', sd_key: 'SD-FENCED-001', title: 'Fenced', status: 'draft', priority: 5, parent_sd_id: null, metadata: { requires_human_action: true } };
      const NORMAL = { id: 'normal-uuid', sd_key: 'SD-NORMAL-001', title: 'Normal', status: 'draft', priority: 3, parent_sd_id: null, metadata: {} };

      it('TS-2 — a requires_human_action=TRUE top candidate is never returned; a lower-priority normal candidate is returned instead', async () => {
        const mockSupabase = mockSupabaseFor([FENCED, NORMAL]);
        const result = await findNextAvailableOrchestrator(mockSupabase);

        expect(result.orchestrator?.sd_key).not.toBe('SD-FENCED-001');
        expect(result.orchestrator?.sd_key).toBe('SD-NORMAL-001');
      });

      it('returns the documented no-candidate result when every unclaimed candidate is fenced', async () => {
        const mockSupabase = mockSupabaseFor([FENCED]);
        const result = await findNextAvailableOrchestrator(mockSupabase);

        expect(result.orchestrator).toBeNull();
        expect(result.reason).toMatch(/authority-fenced/);
      });

      it('composes correctly with the existing claimed-SD exclusion — additive, not a replacement', async () => {
        const claimed = { id: 'claimed-uuid', sd_key: 'SD-CLAIMED-001', title: 'Claimed', status: 'draft', priority: 5, parent_sd_id: null, metadata: {} };
        const mockSupabase = mockSupabaseFor([claimed, NORMAL], [{ sd_key: 'SD-CLAIMED-001', id: 'session-1' }]);
        const result = await findNextAvailableOrchestrator(mockSupabase);

        expect(result.orchestrator?.sd_key).toBe('SD-NORMAL-001');
      });

      it('TS-3 (findNextAvailableOrchestrator half) — regression pin: a normal candidate set selects the same candidate id as pre-fix', async () => {
        const mockSupabase = mockSupabaseFor([NORMAL]);
        const result = await findNextAvailableOrchestrator(mockSupabase);

        expect(result.orchestrator?.id).toBe('normal-uuid');
      });

      // TESTING EXEC (T11): runtime fail-open regression pin, not just the [STATIC] select-string
      // test below. findNextAvailableOrchestrator's real select() never returns sd_type
      // (confirmed by the [STATIC] test), so this exact combination cannot occur from a real
      // query today -- this fixture instead pins the CLASSIFIER-FORM choice itself, so a future
      // select() widening would be caught here rather than relying solely on the select-string guard.
      it('[FAIL-OPEN REGRESSION GUARD] a fenced candidate that is ALSO sd_type=orchestrator is still refused — catches a reversion to the first-match classifier', async () => {
        const fencedOrchestrator = { id: 'fenced-orch-uuid', sd_key: 'SD-FENCED-ORCH-001', title: 'Fenced Orchestrator', status: 'draft', priority: 5, parent_sd_id: null, sd_type: 'orchestrator', metadata: { requires_human_action: true } };
        const mockSupabase = mockSupabaseFor([fencedOrchestrator, NORMAL]);
        const result = await findNextAvailableOrchestrator(mockSupabase);

        expect(result.orchestrator?.sd_key).not.toBe('SD-FENCED-ORCH-001');
        expect(result.orchestrator?.sd_key).toBe('SD-NORMAL-001');
      });

      it('[STATIC] never adds sd_type to the eligibility-relevant select — this function selects orchestrator-type rows by design (status/parent_sd_id filter), and the general classifier would refuse its own subject', () => {
        // findNextAvailableOrchestrator has MULTIPLE .select(...) calls (the candidate query
        // AND a separate claimed-sessions query) — a plain .match() takes whichever occurs
        // FIRST in source order, which is not necessarily the eligibility-relevant one (it
        // was the claimed-sessions select here, making the earlier version of this assertion
        // pass or fail for the wrong reason). Scan every .select(...) call and assert on the
        // one that actually selects metadata — the candidate query.
        const src = findNextAvailableOrchestrator.toString();
        const selectCalls = [...src.matchAll(/\.select\(\s*(['"`])([^'"`]*)\1/g)].map((m) => m[2]);
        expect(selectCalls.length, 'findNextAvailableOrchestrator must have at least one literal .select(...) call').toBeGreaterThan(0);
        const candidateSelect = selectCalls.find((cols) => cols.split(',').map((s) => s.trim()).includes('metadata'));
        expect(candidateSelect, `expected one .select(...) call to include metadata; found: ${JSON.stringify(selectCalls)}`).toBeDefined();
        expect(candidateSelect.split(',').map((s) => s.trim())).not.toContain('sd_type');
      });
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
