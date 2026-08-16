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
  getReadyChildren,
  getOrchestratorContext
} from '../../../scripts/modules/handoff/child-sd-selector.js';
// Handles onto the module-level mocks above, so per-test .mockReturnValue() can drive
// getReadyChildren's DAG-requiring path without needing the real DAG algorithm — this
// file tests the authority-fence logic, not dependency-graph correctness.
import { buildDependencyDAG, detectCycles, computeRunnableSet } from '../../../lib/orchestrator/dependency-dag.js';

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

    it('should return allComplete=true when children are a mix of completed and cancelled (QF-20260710-491)', async () => {
      let queryCount = 0;
      const dualMock = {
        from: () => ({
          select: () => ({
            eq: () => {
              queryCount++;
              if (queryCount === 1) {
                return {
                  in: () => Promise.resolve({ data: [], error: null })
                };
              } else {
                return Promise.resolve({
                  data: [
                    { id: 'c1', status: 'completed' },
                    { id: 'c2', status: 'cancelled' },
                    { id: 'c3', status: 'completed' }
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
      expect(result.reason).toContain('terminal');
    });

    it('getReadyChildren (direct, unmocked implementation): a completed+cancelled mix short-circuits to allComplete=true (SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001)', async () => {
      // Adversarial finding: getReadyChildren had ZERO direct coverage — the only other
      // reference (tests/unit/parallel-team-spawner.test.js) fully mocks it via vi.fn().
      // This exercises the real function body via the early-return branch (before any
      // DAG code — buildDependencyDAG/detectCycles are bare vi.fn() with no
      // implementation in this file, so a DAG-requiring path would fail for unrelated
      // reasons; the all-terminal branch returns before reaching them).
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => Promise.resolve({
              data: [
                { id: 'c1', status: 'completed' },
                { id: 'c2', status: 'cancelled' },
                { id: 'c3', status: 'completed' },
              ],
              error: null,
            }),
          }),
        }),
      };

      const result = await getReadyChildren(mockSupabase, 'parent-1');

      expect(result.children).toEqual([]);
      expect(result.allComplete).toBe(true);
      expect(result.reason).toContain('terminal');
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

    it('skips children with active cadence gate and returns the next unguarded one', async () => {
      // f52246de — orchestrator preflight router was bypassing the cadence gate
      // applied at sd-start. The gate must apply identically here.
      const futureIso = new Date(Date.now() + 5 * 86400000).toISOString();
      const gatedChild = {
        id: 'child-gated',
        sd_key: 'SD-GATED',
        title: 'Gated Child',
        status: 'draft',
        priority: 50,
        sequence_rank: 1,
        governance_metadata: { next_workable_after: futureIso },
      };
      const openChild = {
        id: 'child-open',
        sd_key: 'SD-OPEN',
        title: 'Open Child',
        status: 'draft',
        priority: 50,
        sequence_rank: 2,
      };
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [gatedChild, openChild], error: null })
            })
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1');

      expect(result.sd).toBeTruthy();
      expect(result.sd.id).toBe('child-open');
      expect(result.allComplete).toBe(false);
    });

    it('returns null when every candidate is gated by an active cadence window', async () => {
      const futureIso = new Date(Date.now() + 3 * 86400000).toISOString();
      const gatedChildren = [
        {
          id: 'c1', sd_key: 'SD-C1', status: 'draft',
          governance_metadata: { next_workable_after: futureIso },
        },
        {
          id: 'c2', sd_key: 'SD-C2', status: 'draft',
          governance_metadata: { next_workable_after: futureIso },
        },
      ];
      let queryCount = 0;
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => {
              queryCount++;
              if (queryCount === 1) {
                return { in: () => Promise.resolve({ data: gatedChildren, error: null }) };
              }
              return Promise.resolve({
                data: [
                  { id: 'c1', status: 'draft' },
                  { id: 'c2', status: 'draft' }
                ],
                error: null
              });
            }
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      // 2 candidates were gated, 0 completed → no ready children, none blocked
      expect(result.reason).toContain('No ready children');
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

    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-6/TS-8): authority-fence tests.
    // This is the THIRD cascade picker (found only by TESTING's F4 finding, never in the
    // original scope) — getNextReadyChild had ZERO eligibility checks pre-fix. Its select()
    // already includes sd_type (pre-existing, for unrelated SD-type-aware workflow
    // continuation) — safe here because the fix uses classifyAllDispatchIneligibility +
    // the narrow CLAIM_WRITE_FENCE_AXES set, which deliberately EXCLUDES orchestrator_parent,
    // so a nested child that happens to be sd_type='orchestrator' is never wrongly refused
    // by this check regardless of what's selected.
    describe('authority fence (FR-6)', () => {
      const FENCED_CHILD = { id: 'child-fenced', sd_key: 'SD-CHILD-FENCED-001', title: 'Fenced Child', status: 'draft', priority: 90, sequence_rank: 1, metadata: { requires_human_action: true } };
      const NORMAL_CHILD = { id: 'child-normal', sd_key: 'SD-CHILD-NORMAL-001', title: 'Normal Child', status: 'draft', priority: 50, sequence_rank: 2, metadata: {} };

      function mockFor(candidates) {
        return {
          from: () => ({
            select: () => ({
              eq: () => ({
                in: () => Promise.resolve({ data: candidates, error: null })
              })
            })
          })
        };
      }

      it('TS-8 — a requires_human_action=TRUE top-priority child is never returned; a lower-priority normal child is returned instead', async () => {
        const result = await getNextReadyChild(mockFor([FENCED_CHILD, NORMAL_CHILD]), 'parent-1');

        expect(result.sd?.sd_key).not.toBe('SD-CHILD-FENCED-001');
        expect(result.sd?.sd_key).toBe('SD-CHILD-NORMAL-001');
      });

      it('returns no-ready-children (not allComplete) when the only candidate is fenced — a fenced child is neither "ready" nor "complete"', async () => {
        // getNextReadyChild falls through to a SECOND query (.select('id, status').eq(...),
        // awaited directly with no further chain) when the first query yields zero ready
        // candidates, to distinguish "no children exist" / "all terminal" / "exist but not
        // ready" — matches the dualMock/queryCount convention used elsewhere in this file.
        let queryCount = 0;
        const dualMock = {
          from: () => ({
            select: () => ({
              eq: () => {
                queryCount++;
                if (queryCount === 1) {
                  return { in: () => Promise.resolve({ data: [FENCED_CHILD], error: null }) };
                }
                return Promise.resolve({ data: [{ id: FENCED_CHILD.id, status: FENCED_CHILD.status }], error: null });
              }
            })
          })
        };

        const result = await getNextReadyChild(dualMock, 'parent-1');

        expect(result.sd).toBeNull();
        expect(result.allComplete).toBe(false);
        expect(result.reason).toContain('No ready children');
      });

      it('TS-3 (getNextReadyChild half) — regression pin: a normal candidate set selects the same child id as pre-fix', async () => {
        const result = await getNextReadyChild(mockFor([NORMAL_CHILD]), 'parent-1');

        expect(result.sd?.id).toBe('child-normal');
        expect(result.sd?.sd_key).toBe('SD-CHILD-NORMAL-001');
      });

      it('a nested child that is itself sd_type=orchestrator is NOT wrongly refused — CLAIM_WRITE_FENCE_AXES deliberately excludes orchestrator_parent', async () => {
        const nestedOrchestratorChild = { id: 'child-nested-orch', sd_key: 'SD-CHILD-NESTED-ORCH-001', title: 'Nested Orchestrator Child', status: 'draft', priority: 70, sequence_rank: 1, sd_type: 'orchestrator', metadata: {} };
        const result = await getNextReadyChild(mockFor([nestedOrchestratorChild]), 'parent-1');

        expect(result.sd?.sd_key).toBe('SD-CHILD-NESTED-ORCH-001');
      });

      // SECURITY EXEC review (S4/Q1): a fixture combining sd_type='orchestrator' with
      // requires_human_action=true is the actual FAIL-OPEN detector for a reversion to the
      // first-match classifier. Measured by SECURITY: classifyAllDispatchIneligibility on
      // this combo returns ['orchestrator_parent','human_action_required'] (fenced=true,
      // correct); the first-match classifyDispatchIneligibility returns only
      // 'orchestrator_parent' first, which CLAIM_WRITE_FENCE_AXES does NOT contain
      // (fenced=FALSE — a silent fail-open, not a false-refusal). The prior nested-orchestrator
      // test above only proves under-refusal is fixed; this one proves a specific
      // classifier-form regression would be caught, not silently accepted.
      it('[FAIL-OPEN REGRESSION GUARD] a fenced child that is ALSO sd_type=orchestrator is still refused — catches a reversion to the first-match classifier', async () => {
        const fencedNestedOrchestrator = { id: 'child-fenced-orch', sd_key: 'SD-CHILD-FENCED-ORCH-001', title: 'Fenced Nested Orchestrator', status: 'draft', priority: 95, sequence_rank: 1, sd_type: 'orchestrator', metadata: { requires_human_action: true } };
        const result = await getNextReadyChild(mockFor([fencedNestedOrchestrator, NORMAL_CHILD]), 'parent-1');

        expect(result.sd?.sd_key).not.toBe('SD-CHILD-FENCED-ORCH-001');
        expect(result.sd?.sd_key).toBe('SD-CHILD-NORMAL-001');
      });

      it('[STATIC] getNextReadyChild uses the all-match classifier form (classifyAllDispatchIneligibility), never the first-match form alone — the first-match form short-circuits on orchestrator_parent before ever checking human_action_required', () => {
        // Word-boundary-anchored, not a literal "NAME(" match — Vite's SSR transform rewrites
        // imported-binding calls to (0,__vite_ssr_import_N__.NAME)(args), so the identifier is
        // followed by ")" in the transformed .toString(), not "(". \b correctly does NOT match
        // "classifyDispatchIneligibility" inside "classifyAllDispatchIneligibility" (no boundary
        // between "...lAll" and "Dispatch...").
        const src = getNextReadyChild.toString();
        expect(src).toMatch(/\bclassifyAllDispatchIneligibility\b/);
        expect(src).not.toMatch(/\bclassifyDispatchIneligibility\b/);
      });
    });

    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (SECURITY EXEC S2, post-EXEC-TO-PLAN
    // finding): getReadyChildren is a FOURTH cascade picker, reached from cli-main.js's
    // parallel-team check (gated on ORCH_PARALLEL_CHILDREN_ENABLED, currently unset/latent)
    // BEFORE getNextReadyChild's own fence is ever reached — its 'parallel' result returns
    // early, skipping getNextReadyChild for that iteration entirely. It already selected
    // metadata (pre-existing, for DAG construction) but never consulted it until this fix.
    describe('getReadyChildren — authority fence (S2 security finding)', () => {
      const FENCED = { id: 'child-fenced', sd_key: 'SD-CHILD-FENCED-001', title: 'Fenced', status: 'draft', priority: 90, sequence_rank: 1, metadata: { requires_human_action: true }, governance_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
      const NORMAL_A = { id: 'child-normal-a', sd_key: 'SD-CHILD-NORMAL-A', title: 'Normal A', status: 'draft', priority: 50, sequence_rank: 2, metadata: {}, governance_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
      const NORMAL_B = { id: 'child-normal-b', sd_key: 'SD-CHILD-NORMAL-B', title: 'Normal B', status: 'draft', priority: 40, sequence_rank: 3, metadata: {}, governance_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

      function mockAllChildren(children) {
        return {
          from: () => ({
            select: () => ({
              eq: () => Promise.resolve({ data: children, error: null })
            })
          })
        };
      }

      // buildDependencyDAG/detectCycles/computeRunnableSet are bare vi.fn() at module scope
      // (this file tests authority-fence logic, not DAG correctness) — drive them per-test so
      // the code reaches the cadence/authority filter stages instead of throwing on an
      // unimplemented mock's undefined return.
      function stubDagAsIndependent(children) {
        buildDependencyDAG.mockReturnValue({ dag: {}, errors: [] });
        detectCycles.mockReturnValue({ hasCycles: false, cyclePath: [] });
        computeRunnableSet.mockReturnValue({ runnable: children.map((c) => c.id) });
      }

      it('parallel mode: excludes a fenced child from the full returned array while keeping normal siblings', async () => {
        const children = [FENCED, NORMAL_A, NORMAL_B];
        stubDagAsIndependent(children);

        const result = await getReadyChildren(mockAllChildren(children), 'parent-1', { parallelEnabled: true });

        const keys = result.children.map((c) => c.sd_key);
        expect(keys).not.toContain('SD-CHILD-FENCED-001');
        expect(keys).toContain('SD-CHILD-NORMAL-A');
        expect(keys).toContain('SD-CHILD-NORMAL-B');
      });

      it('sequential mode (parallelEnabled: false): skips a higher-priority fenced child and selects the next normal one', async () => {
        const children = [FENCED, NORMAL_A];
        stubDagAsIndependent(children);

        const result = await getReadyChildren(mockAllChildren(children), 'parent-1', { parallelEnabled: false });

        expect(result.children).toHaveLength(1);
        expect(result.children[0].sd_key).toBe('SD-CHILD-NORMAL-A');
      });

      it('[FAIL-OPEN REGRESSION GUARD] a fenced child that is ALSO sd_type=orchestrator is still refused in parallel mode', async () => {
        const fencedNestedOrchestrator = { ...FENCED, id: 'child-fenced-orch', sd_key: 'SD-CHILD-FENCED-ORCH-001', sd_type: 'orchestrator' };
        const children = [fencedNestedOrchestrator, NORMAL_A];
        stubDagAsIndependent(children);

        const result = await getReadyChildren(mockAllChildren(children), 'parent-1', { parallelEnabled: true });

        const keys = result.children.map((c) => c.sd_key);
        expect(keys).not.toContain('SD-CHILD-FENCED-ORCH-001');
        expect(keys).toContain('SD-CHILD-NORMAL-A');
      });

      it('[STATIC] getReadyChildren uses the all-match classifier form (classifyAllDispatchIneligibility), never the first-match form alone', () => {
        const src = getReadyChildren.toString();
        expect(src).toMatch(/\bclassifyAllDispatchIneligibility\b/);
        expect(src).not.toMatch(/\bclassifyDispatchIneligibility\b/);
      });
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
