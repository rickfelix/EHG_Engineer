/**
 * Dependency DAG Resolver - Unit Tests
 *
 * Covers: DAG construction, cycle detection, runnable set computation,
 * reference validation, failure propagation.
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B (FR-2)
 */

import { describe, it, expect } from 'vitest';
import {
  buildDependencyDAG,
  detectCycles,
  computeRunnableSet,
  validateDependencies
} from '../../lib/orchestrator/dependency-dag.js';

// Helper to create mock child SDs
function makeChild(id, sdKey, blockedBy = []) {
  return {
    id,
    sd_key: sdKey,
    metadata: blockedBy.length > 0 ? { blocked_by: blockedBy } : {}
  };
}

describe('buildDependencyDAG', () => {
  it('builds DAG with no dependencies', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const { dag, errors } = buildDependencyDAG(children);

    expect(errors).toHaveLength(0);
    expect(dag.nodes.size).toBe(3);
    expect(dag.rootIds).toEqual(['a', 'b', 'c']);
  });

  it('builds DAG with linear dependencies', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['b'])
    ];

    const { dag, errors } = buildDependencyDAG(children);

    expect(errors).toHaveLength(0);
    expect(dag.rootIds).toEqual(['a']);
    expect(dag.nodes.get('a').blocks).toEqual(['b']);
    expect(dag.nodes.get('b').blocks).toEqual(['c']);
    expect(dag.nodes.get('c').blocks).toEqual([]);
  });

  it('builds DAG with diamond dependencies', () => {
    // A -> B, A -> C, B -> D, C -> D
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a']),
      makeChild('d', 'SD-D', ['b', 'c'])
    ];

    const { dag, errors } = buildDependencyDAG(children);

    expect(errors).toHaveLength(0);
    expect(dag.rootIds).toEqual(['a']);
    expect(dag.nodes.get('d').blockedBy).toEqual(['b', 'c']);
  });

  it('reports errors for unknown blocker references', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['nonexistent'])
    ];

    const { errors } = buildDependencyDAG(children);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('nonexistent');
    expect(errors[0]).toContain('SD-B');
  });

  it('handles children with null/undefined metadata', () => {
    const children = [
      { id: 'a', sd_key: 'SD-A', metadata: null },
      { id: 'b', sd_key: 'SD-B', metadata: undefined },
      { id: 'c', sd_key: 'SD-C' }
    ];

    const { dag, errors } = buildDependencyDAG(children);

    expect(errors).toHaveLength(0);
    expect(dag.nodes.size).toBe(3);
    expect(dag.rootIds).toEqual(['a', 'b', 'c']);
  });

  it('handles empty children array', () => {
    const { dag, errors } = buildDependencyDAG([]);

    expect(errors).toHaveLength(0);
    expect(dag.nodes.size).toBe(0);
    expect(dag.rootIds).toEqual([]);
  });
});

// TS-3: Cycle detection prevents unsafe execution
describe('detectCycles', () => {
  it('detects no cycles in acyclic graph', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { hasCycles, cyclePath } = detectCycles(dag);

    expect(hasCycles).toBe(false);
    expect(cyclePath).toEqual([]);
  });

  it('detects direct cycle between two nodes', () => {
    const children = [
      makeChild('a', 'SD-A', ['b']),
      makeChild('b', 'SD-B', ['a'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { hasCycles, cyclePath } = detectCycles(dag);

    expect(hasCycles).toBe(true);
    expect(cyclePath.length).toBeGreaterThanOrEqual(2);
    expect(cyclePath).toContain('a');
    expect(cyclePath).toContain('b');
  });

  it('detects cycle in three-node graph', () => {
    const children = [
      makeChild('a', 'SD-A', ['c']),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['b'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { hasCycles } = detectCycles(dag);

    expect(hasCycles).toBe(true);
  });

  it('handles self-reference as cycle', () => {
    const children = [
      makeChild('a', 'SD-A', ['a'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { hasCycles } = detectCycles(dag);

    expect(hasCycles).toBe(true);
  });

  it('returns no cycles for empty graph', () => {
    const { dag } = buildDependencyDAG([]);
    const { hasCycles } = detectCycles(dag);

    expect(hasCycles).toBe(false);
  });

  it('returns no cycles for single node', () => {
    const { dag } = buildDependencyDAG([makeChild('a', 'SD-A')]);
    const { hasCycles } = detectCycles(dag);

    expect(hasCycles).toBe(false);
  });
});

describe('computeRunnableSet', () => {
  it('returns all roots when nothing is completed', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C', ['a'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { runnable, blocked } = computeRunnableSet(
      dag, new Set(), new Set()
    );

    expect(runnable).toContain('a');
    expect(runnable).toContain('b');
    expect(runnable).not.toContain('c');
    expect(blocked).toContain('c');
  });

  it('unlocks dependents when blocker completes', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { runnable } = computeRunnableSet(
      dag, new Set(['a']), new Set()
    );

    expect(runnable).toContain('b');
    expect(runnable).toContain('c');
    expect(runnable).not.toContain('a'); // already completed
  });

  // TS-5: Failure propagation - dependent children are skipped when a blocker fails
  it('marks dependents as terminal when blocker fails', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a'])
    ];

    const { dag } = buildDependencyDAG(children);
    const { runnable, terminal } = computeRunnableSet(
      dag, new Set(), new Set(['a'])
    );

    expect(runnable).toHaveLength(0);
    expect(terminal).toHaveLength(1);
    expect(terminal[0].id).toBe('b');
    expect(terminal[0].reason).toContain('blocker_failed');
  });

  it('excludes running children from runnable set', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const { dag } = buildDependencyDAG(children);
    const { runnable } = computeRunnableSet(
      dag, new Set(), new Set(), new Set(['a'])
    );

    expect(runnable).not.toContain('a');
    expect(runnable).toContain('b');
    expect(runnable).toContain('c');
  });

  it('handles diamond dependency correctly', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a']),
      makeChild('d', 'SD-D', ['b', 'c'])
    ];

    const { dag } = buildDependencyDAG(children);

    // After A completes: B and C runnable, D still blocked
    const r1 = computeRunnableSet(dag, new Set(['a']), new Set());
    expect(r1.runnable).toContain('b');
    expect(r1.runnable).toContain('c');
    expect(r1.blocked).toContain('d');

    // After A and B complete: C runnable, D still blocked (needs C too)
    const r2 = computeRunnableSet(dag, new Set(['a', 'b']), new Set());
    expect(r2.runnable).toContain('c');
    expect(r2.blocked).toContain('d');

    // After A, B, C complete: D runnable
    const r3 = computeRunnableSet(dag, new Set(['a', 'b', 'c']), new Set());
    expect(r3.runnable).toContain('d');
  });

  it('propagates failure through dependency chain', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['b'])
    ];

    const { dag } = buildDependencyDAG(children);

    // A fails -> B terminal
    const r1 = computeRunnableSet(dag, new Set(), new Set(['a']));
    expect(r1.terminal.find(t => t.id === 'b')).toBeTruthy();

    // B is now effectively failed -> C should also be terminal
    const r2 = computeRunnableSet(dag, new Set(), new Set(['a', 'b']));
    expect(r2.terminal.find(t => t.id === 'c')).toBeTruthy();
  });
});

describe('validateDependencies', () => {
  it('validates clean dependency graph', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a'])
    ];

    const { valid, errors } = validateDependencies(children);

    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('reports self-reference', () => {
    const children = [
      makeChild('a', 'SD-A', ['a'])
    ];

    const { valid, errors } = validateDependencies(children);

    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('self-reference'))).toBe(true);
  });

  it('reports cycle', () => {
    const children = [
      makeChild('a', 'SD-A', ['b']),
      makeChild('b', 'SD-B', ['a'])
    ];

    const { valid, errors } = validateDependencies(children);

    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('reports missing reference', () => {
    const children = [
      makeChild('a', 'SD-A', ['missing-id'])
    ];

    const { valid, errors } = validateDependencies(children);

    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('missing-id'))).toBe(true);
  });

  it('validates with no children', () => {
    const { valid, errors } = validateDependencies([]);

    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });
});
