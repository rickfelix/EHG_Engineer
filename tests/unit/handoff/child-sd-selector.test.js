/**
 * Unit tests for Child SD Selector
 *
 * Part of AUTO-PROCEED child SD continuation implementation
 *
 * Tests selecting next ready child SD from orchestrator parent
 */

import { vi, describe, it, expect } from 'vitest';

// Mock urgency-scorer to avoid importing real module
vi.mock('../../../scripts/modules/handoff/auto-proceed/urgency-scorer.js', () => ({
  sortByUrgency: vi.fn((items) => items), // pass through unchanged
  scoreToBand: vi.fn(() => 'normal')
}));

// Mock dependency-dag to avoid importing real module
vi.mock('../../../lib/orchestrator/dependency-dag.js', () => ({
  buildDependencyDAG: vi.fn(),
  detectCycles: vi.fn(),
  computeRunnableSet: vi.fn()
}));

import {
  isChildSD,
  getNextReadyChild,
  getOrchestratorContext
} from '../../../scripts/modules/handoff/child-sd-selector.js';

describe('Child SD Selector', () => {
  describe('isChildSD', () => {
    it('should return true for SD with parent_sd_id', () => {
      const sd = { id: 'child-1', parent_sd_id: 'parent-1' };
      expect(isChildSD(sd)).toBe(true);
    });

    it('should return false for SD without parent_sd_id', () => {
      const sd = { id: 'top-level-1', parent_sd_id: null };
      expect(isChildSD(sd)).toBe(false);
    });

    it('should return false for SD with undefined parent_sd_id', () => {
      const sd = { id: 'top-level-2' };
      expect(isChildSD(sd)).toBe(false);
    });

    it('should return false for null SD', () => {
      expect(isChildSD(null)).toBe(false);
    });

    it('should return false for undefined SD', () => {
      expect(isChildSD(undefined)).toBe(false);
    });
  });

  describe('getNextReadyChild', () => {
    it('should return null when no parent ID provided', async () => {
      const mockSupabase = {};
      const result = await getNextReadyChild(mockSupabase, null);

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toBe('No parent ID provided');
    });

    it('should return next ready child when one exists', async () => {
      const mockChild = {
        id: 'child-2',
        sd_key: 'SD-CHILD-002',
        title: 'Child Task 2',
        status: 'draft',
        priority: 50,
        sequence_rank: 2
      };

      // Production code now uses:
      //   .from('strategic_directives_v2')
      //   .select(long column list)
      //   .eq('parent_sd_id', parentSdId)
      //   .in('status', ['draft', 'active'])
      // then optionally .neq('id', excludeCompletedId)
      // and awaits the result directly (no .order().limit() chain)
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                neq: () => Promise.resolve({ data: [mockChild], error: null })
              })
            })
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1', 'child-1');

      // The result.sd will include urgency fields added by the production code
      expect(result.sd).toBeTruthy();
      expect(result.sd.id).toBe('child-2');
      expect(result.sd.sd_key).toBe('SD-CHILD-002');
      expect(result.allComplete).toBe(false);
      expect(result.reason).toContain('Next child found');
    });

    it('should return allComplete=true when all children are completed', async () => {
      let queryCount = 0;
      const dualMock = {
        from: () => ({
          select: () => ({
            eq: () => {
              queryCount++;
              if (queryCount === 1) {
                // First query: looking for ready children with .in('status', ...)
                return {
                  in: () => Promise.resolve({ data: [], error: null })
                };
              } else {
                // Second query: getting all children (no .in, just .eq)
                return Promise.resolve({
                  data: [
                    { id: 'c1', status: 'completed' },
                    { id: 'c2', status: 'completed' }
                  ],
                  error: null
                });
              }
            }
          })
        })
      };

      const result = await getNextReadyChild(dualMock, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(true);
    });

    it('should indicate blocked children when some are blocked', async () => {
      let queryCount = 0;
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => {
              queryCount++;
              if (queryCount === 1) {
                // First query: looking for ready children (returns empty)
                return {
                  in: () => Promise.resolve({ data: [], error: null })
                };
              } else {
                // Second query: getting all children (some blocked)
                return Promise.resolve({
                  data: [
                    { id: 'c1', status: 'completed' },
                    { id: 'c2', status: 'blocked' },
                    { id: 'c3', status: 'blocked' }
                  ],
                  error: null
                });
              }
            }
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should handle query errors gracefully', async () => {
      // Production code: the first query uses .eq().in() and awaits directly
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: null, error: { message: 'DB error' } })
            })
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toContain('Query error');
    });
  });

  describe('getOrchestratorContext', () => {
    it('should return parent and children stats', async () => {
      const mockParent = {
        id: 'parent-1',
        sd_key: 'SD-PARENT-001',
        title: 'Parent Orchestrator',
        status: 'in_progress'
      };

      const mockChildren = [
        { id: 'c1', sd_key: 'SD-C1', status: 'completed' },
        { id: 'c2', sd_key: 'SD-C2', status: 'in_progress' },
        { id: 'c3', sd_key: 'SD-C3', status: 'draft' }
      ];

      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockParent, error: null }),
              order: () => ({
                order: () => Promise.resolve({ data: mockChildren, error: null })
              })
            })
          })
        })
      };

      const result = await getOrchestratorContext(mockSupabase, 'parent-1');

      expect(result.parent).toEqual(mockParent);
      expect(result.children).toEqual(mockChildren);
      expect(result.stats.total).toBe(3);
      expect(result.stats.completed).toBe(1);
      expect(result.stats.remaining).toBe(2);
    });

    it('should handle missing parent gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'Not found' } })
            })
          })
        })
      };

      const result = await getOrchestratorContext(mockSupabase, 'nonexistent');

      expect(result.parent).toBe(null);
      expect(result.children).toEqual([]);
      expect(result.stats.total).toBe(0);
    });
  });
});
