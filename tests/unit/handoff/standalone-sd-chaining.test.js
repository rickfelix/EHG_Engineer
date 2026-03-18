/**
 * Unit tests for Standalone SD Auto-Chaining
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 *
 * Tests the standalone SD chaining logic in cli-main.js that allows
 * top-level non-orchestrator SDs to auto-chain to the next available SD
 * when chain_orchestrators is enabled.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../../../lib/terminal-identity.js', () => ({
  getTerminalId: vi.fn().mockReturnValue('win-cc-test-12345')
}));

vi.mock('../../../lib/claim-guard.mjs', () => ({
  claimGuard: vi.fn().mockResolvedValue({ success: true, claim: { status: 'newly_acquired' } }),
  isSameConversation: vi.fn().mockReturnValue(true)
}));

vi.mock('../../../lib/resolve-own-session.js', () => ({
  resolveOwnSession: vi.fn().mockResolvedValue({
    data: { session_id: 'test-session', metadata: { auto_proceed: true, chain_orchestrators: true } }
  })
}));

import { findNextAvailableOrchestrator } from '../../../scripts/modules/handoff/orchestrator-completion-hook.js';
import { getChainOrchestrators } from '../../../scripts/modules/handoff/auto-proceed-resolver.js';

describe('Standalone SD Auto-Chaining', () => {
  describe('getChainOrchestrators', () => {
    it('should return chainOrchestrators=true when session metadata has chain_orchestrators=true', async () => {
      const result = await getChainOrchestrators({});
      expect(result.chainOrchestrators).toBe(true);
    });
  });

  describe('findNextAvailableOrchestrator (reused for standalone chaining)', () => {
    it('should return the next unclaimed top-level SD', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue([])
            }),
            in: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      neq: vi.fn().mockResolvedValue({
                        data: [
                          { id: 'next-sd-uuid', sd_key: 'SD-NEXT-001', title: 'Next SD', status: 'draft', priority: 'medium', parent_sd_id: null }
                        ],
                        error: null
                      })
                    })
                  })
                })
              })
            })
          })
        })
      };

      const result = await findNextAvailableOrchestrator(mockSupabase, 'current-sd-uuid');
      expect(result.orchestrator).not.toBeNull();
      expect(result.orchestrator.sd_key).toBe('SD-NEXT-001');
    });

    it('should return null when no SDs are available', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue([])
            }),
            in: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      neq: vi.fn().mockResolvedValue({
                        data: [],
                        error: null
                      })
                    })
                  })
                })
              })
            })
          })
        })
      };

      const result = await findNextAvailableOrchestrator(mockSupabase, 'current-sd-uuid');
      expect(result.orchestrator).toBeNull();
      expect(result.reason).toContain('No orchestrators in queue');
    });

    it('should exclude the just-completed SD from results', async () => {
      const neqSpy = vi.fn().mockResolvedValue({
        data: [{ id: 'other-uuid', sd_key: 'SD-OTHER-001', title: 'Other SD', status: 'draft', priority: 'medium', parent_sd_id: null }],
        error: null
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue([])
            }),
            in: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      neq: neqSpy
                    })
                  })
                })
              })
            })
          })
        })
      };

      await findNextAvailableOrchestrator(mockSupabase, 'completed-sd-uuid');
      expect(neqSpy).toHaveBeenCalledWith('id', 'completed-sd-uuid');
    });
  });

  describe('Chaining behavior integration', () => {
    it('should not chain when chain_orchestrators is false', async () => {
      // Override resolveOwnSession for this test
      const { resolveOwnSession } = await import('../../../lib/resolve-own-session.js');
      resolveOwnSession.mockResolvedValueOnce({
        data: { session_id: 'test-session', metadata: { auto_proceed: true, chain_orchestrators: false } }
      });

      const result = await getChainOrchestrators({});
      expect(result.chainOrchestrators).toBe(false);
    });
  });
});
