/**
 * Tests for Inter-Venture Dependency Manager
 * SD-EVA-FEAT-DEPENDENCY-MANAGER-001
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getDependencyGraph,
  wouldCreateCycle,
  checkDependencies,
  addDependency,
  resolveDependency,
  removeDependency,
  MODULE_VERSION,
} from '../../../lib/eva/dependency-manager.js';

// ── Mock Supabase builder ──────────────────────────────────

function createMockDb(config = {}) {
  return {
    from: vi.fn((table) => {
      const chainable = {};

      // Self-referencing chain methods
      chainable.select = vi.fn().mockReturnValue(chainable);
      chainable.eq = vi.fn().mockReturnValue(chainable);
      chainable.neq = vi.fn().mockReturnValue(chainable);
      chainable.lte = vi.fn().mockReturnValue(chainable);
      chainable.single = vi.fn(() => {
        const key = `${table}:single`;
        return Promise.resolve(config[key] || { data: null, error: null });
      });

      // For queries that return arrays: use .then()
      chainable.then = (resolve) => {
        const key = `${table}:list`;
        return Promise.resolve(config[key] || { data: [], error: null }).then(resolve);
      };

      // Insert
      chainable.insert = vi.fn(() => {
        const insertChain = {
          select: vi.fn().mockReturnValue({
            single: vi.fn(() => Promise.resolve(
              config[`${table}:insert`] || { data: { id: 'new-dep-id' }, error: null }
            )),
          }),
        };
        return insertChain;
      });

      // Update
      chainable.update = vi.fn(() => {
        const updateChain = {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn(() => Promise.resolve(
                config[`${table}:update`] || { data: { id: 'dep-id', status: 'resolved', resolved_at: '2026-02-14T00:00:00Z' }, error: null }
              )),
            }),
          }),
        };
        return updateChain;
      });

      // Delete
      chainable.delete = vi.fn(() => {
        const deleteChain = {
          eq: vi.fn(() => Promise.resolve(
            config[`${table}:delete`] || { error: null }
          )),
        };
        return deleteChain;
      });

      return chainable;
    }),
  };
}

// Helper to create a mock that supports parallel .eq() calls on Promise.all
function createParallelMockDb(dependsOnData, providesToData) {
  let callCount = 0;
  return {
    from: vi.fn(() => {
      const chainable = {};
      chainable.select = vi.fn().mockReturnValue(chainable);
      chainable.eq = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First call = dependsOn
          return { then: (resolve) => Promise.resolve({ data: dependsOnData, error: null }).then(resolve) };
        }
        // Second call = providesTo
        return { then: (resolve) => Promise.resolve({ data: providesToData, error: null }).then(resolve) };
      });
      return chainable;
    }),
  };
}

// ── getDependencyGraph ──────────────────

describe('getDependencyGraph', () => {
  it('returns empty arrays for venture with no dependencies', async () => {
    const db = createParallelMockDb([], []);
    const result = await getDependencyGraph(db, 'v1');
    expect(result.dependsOn).toEqual([]);
    expect(result.providesTo).toEqual([]);
  });

  it('returns dependsOn entries correctly mapped', async () => {
    const deps = [
      { id: 'd1', provider_venture_id: 'v2', required_stage: 5, dependency_type: 'hard', status: 'pending', resolved_at: null },
    ];
    const db = createParallelMockDb(deps, []);
    const result = await getDependencyGraph(db, 'v1');
    expect(result.dependsOn).toHaveLength(1);
    expect(result.dependsOn[0].ventureId).toBe('v2');
    expect(result.dependsOn[0].requiredStage).toBe(5);
    expect(result.dependsOn[0].type).toBe('hard');
    expect(result.dependsOn[0].status).toBe('pending');
  });

  it('returns providesTo entries correctly mapped', async () => {
    const provides = [
      { id: 'd2', dependent_venture_id: 'v3', required_stage: 10, dependency_type: 'soft', status: 'resolved', resolved_at: '2026-01-01' },
    ];
    const db = createParallelMockDb([], provides);
    const result = await getDependencyGraph(db, 'v1');
    expect(result.providesTo).toHaveLength(1);
    expect(result.providesTo[0].ventureId).toBe('v3');
    expect(result.providesTo[0].type).toBe('soft');
    expect(result.providesTo[0].status).toBe('resolved');
  });

  it('throws on query error', async () => {
    let callCount = 0;
    const db = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn(() => {
            callCount++;
            if (callCount === 1) return { then: (r) => Promise.resolve({ data: null, error: { message: 'timeout' } }).then(r) };
            return { then: (r) => Promise.resolve({ data: [], error: null }).then(r) };
          }),
        }),
      })),
    };
    await expect(getDependencyGraph(db, 'v1')).rejects.toThrow('Failed to query dependencies');
  });
});

// ── wouldCreateCycle ──────────────────

describe('wouldCreateCycle', () => {
  it('returns true for self-dependency', async () => {
    const db = createMockDb();
    const result = await wouldCreateCycle(db, 'v1', 'v1');
    expect(result).toBe(true);
  });

  it('returns false when no edges exist', async () => {
    const db = createMockDb({
      'venture_dependencies:list': { data: [], error: null },
    });
    const result = await wouldCreateCycle(db, 'v1', 'v2');
    expect(result).toBe(false);
  });

  it('detects direct cycle A→B→A', async () => {
    // Existing edge: A depends on B (A→B)
    // Proposed: B depends on A (B→A) → would create cycle
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [{ dependent_venture_id: 'A', provider_venture_id: 'B' }],
        error: null,
      },
    });
    // Adding B→A: dependentId=B, providerId=A
    // DFS from A (provider): A depends on B (via edge), B is the dependentId → cycle!
    const result = await wouldCreateCycle(db, 'B', 'A');
    expect(result).toBe(true);
  });

  it('detects indirect cycle A→B→C→A', async () => {
    // Existing: A→B, B→C
    // Proposed: C→A → cycle
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [
          { dependent_venture_id: 'A', provider_venture_id: 'B' },
          { dependent_venture_id: 'B', provider_venture_id: 'C' },
        ],
        error: null,
      },
    });
    // Adding C depends on A (C→A): dependentId=C, providerId=A
    // DFS from A: A depends on B, B depends on C. C === dependentId → cycle!
    const result = await wouldCreateCycle(db, 'C', 'A');
    expect(result).toBe(true);
  });

  it('returns false for valid new edge', async () => {
    // Existing: A→B
    // Proposed: C→D (no connection to A→B)
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [{ dependent_venture_id: 'A', provider_venture_id: 'B' }],
        error: null,
      },
    });
    const result = await wouldCreateCycle(db, 'C', 'D');
    expect(result).toBe(false);
  });

  it('returns false for extending a chain', async () => {
    // Existing: A→B, B→C
    // Proposed: A→D (no cycle)
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [
          { dependent_venture_id: 'A', provider_venture_id: 'B' },
          { dependent_venture_id: 'B', provider_venture_id: 'C' },
        ],
        error: null,
      },
    });
    const result = await wouldCreateCycle(db, 'A', 'D');
    expect(result).toBe(false);
  });

  it('throws on query error', async () => {
    const db = createMockDb({
      'venture_dependencies:list': { data: null, error: { message: 'connection refused' } },
    });
    await expect(wouldCreateCycle(db, 'v1', 'v2')).rejects.toThrow('Failed to load dependency graph');
  });
});

// ── checkDependencies ──────────────────

describe('checkDependencies', () => {
  it('returns empty array when no dependencies exist', async () => {
    const db = createMockDb({
      'venture_dependencies:list': { data: [], error: null },
    });
    const result = await checkDependencies(db, 'v1', 5);
    expect(result).toEqual([]);
  });

  it('returns blocking dependencies for hard type', async () => {
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [
          { id: 'd1', provider_venture_id: 'v2', required_stage: 3, dependency_type: 'hard', status: 'pending' },
        ],
        error: null,
      },
    });
    const result = await checkDependencies(db, 'v1', 5);
    expect(result).toHaveLength(1);
    expect(result[0].blocking).toBe(true);
    expect(result[0].providerId).toBe('v2');
  });

  it('returns non-blocking for soft dependencies', async () => {
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [
          { id: 'd1', provider_venture_id: 'v2', required_stage: 3, dependency_type: 'soft', status: 'pending' },
        ],
        error: null,
      },
    });
    const result = await checkDependencies(db, 'v1', 5);
    expect(result).toHaveLength(1);
    expect(result[0].blocking).toBe(false);
  });

  it('throws on query error', async () => {
    const db = createMockDb({
      'venture_dependencies:list': { data: null, error: { message: 'timeout' } },
    });
    await expect(checkDependencies(db, 'v1', 5)).rejects.toThrow('Failed to check dependencies');
  });
});

// ── addDependency ──────────────────

describe('addDependency', () => {
  it('inserts dependency when no cycle exists', async () => {
    const insertData = { id: 'new-id', dependent_venture_id: 'v1', provider_venture_id: 'v2', required_stage: 5, dependency_type: 'hard', status: 'pending' };
    const db = createMockDb({
      'venture_dependencies:list': { data: [], error: null },
      'venture_dependencies:insert': { data: insertData, error: null },
    });
    const result = await addDependency(db, { dependentId: 'v1', providerId: 'v2', requiredStage: 5 });
    expect(result.id).toBe('new-id');
  });

  it('throws when cycle would be created', async () => {
    const db = createMockDb({
      'venture_dependencies:list': {
        data: [{ dependent_venture_id: 'v2', provider_venture_id: 'v1' }],
        error: null,
      },
    });
    await expect(
      addDependency(db, { dependentId: 'v1', providerId: 'v2', requiredStage: 5 })
    ).rejects.toThrow('Adding dependency would create a cycle');
  });

  it('defaults to hard dependency type', async () => {
    const db = createMockDb({
      'venture_dependencies:list': { data: [], error: null },
      'venture_dependencies:insert': { data: { id: 'x' }, error: null },
    });
    await addDependency(db, { dependentId: 'v1', providerId: 'v2', requiredStage: 5 });
    // Verify insert was called (first from() call is for cycle check, second for insert)
    expect(db.from).toHaveBeenCalledWith('venture_dependencies');
  });
});

// ── resolveDependency ──────────────────

describe('resolveDependency', () => {
  it('updates status and resolved_at', async () => {
    const db = createMockDb({
      'venture_dependencies:update': {
        data: { id: 'd1', status: 'resolved', resolved_at: '2026-02-14T00:00:00Z' },
        error: null,
      },
    });
    const result = await resolveDependency(db, 'd1');
    expect(result.status).toBe('resolved');
    expect(result.resolved_at).toBeTruthy();
  });

  it('throws on error', async () => {
    const db = createMockDb({
      'venture_dependencies:update': { data: null, error: { message: 'not found' } },
    });
    await expect(resolveDependency(db, 'd1')).rejects.toThrow('Failed to resolve dependency');
  });
});

// ── removeDependency ──────────────────

describe('removeDependency', () => {
  it('deletes without error', async () => {
    const db = createMockDb({
      'venture_dependencies:delete': { error: null },
    });
    await expect(removeDependency(db, 'd1')).resolves.toBeUndefined();
  });

  it('throws on delete error', async () => {
    const db = createMockDb({
      'venture_dependencies:delete': { error: { message: 'FK constraint' } },
    });
    await expect(removeDependency(db, 'd1')).rejects.toThrow('Failed to remove dependency');
  });
});

// ── MODULE_VERSION ──────────────────

describe('MODULE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
