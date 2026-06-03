/**
 * Unit tests for the build sequencer.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 4 (FR-007)
 */
import { describe, it, expect } from 'vitest';
import { computeBuildSequence, isSchedulable } from '../../../lib/eva/bridge/build-sequencer.js';

describe('computeBuildSequence — ordering', () => {
  it('orders a linear chain foundational-first', () => {
    const r = computeBuildSequence([
      { key: 'C', deps: ['B'] }, { key: 'A', deps: [] }, { key: 'B', deps: ['A'] },
    ]);
    expect(r.order).toEqual(['A', 'B', 'C']);
    expect(r.waves).toEqual([['A'], ['B'], ['C']]);
    expect(r.hasCycle).toBe(false);
  });

  it('groups independent SDs into one parallel wave behind the foundation', () => {
    const r = computeBuildSequence([
      { key: 'A', deps: [] },
      { key: 'B', deps: ['A'] }, { key: 'C', deps: ['A'] }, { key: 'D', deps: ['A'] },
    ]);
    expect(r.waves[0]).toEqual(['A']);
    expect(r.waves[1]).toEqual(['B', 'C', 'D']); // parallelizable
  });

  it('produces the CORRECT engine ordering (engine after DB/schema, not before)', () => {
    // The fix for the inverted live graph: with correct edges, the engine depends on
    // the DB connection, and landing-copy depends on nothing.
    const r = computeBuildSequence([
      { key: 'db', deps: [] },
      { key: 'landing', deps: [] },
      { key: 'engine', deps: ['db'] },
    ]);
    expect(r.order.indexOf('db')).toBeLessThan(r.order.indexOf('engine'));
    expect(r.waves[0]).toEqual(['db', 'landing']); // both foundational, parallel
    expect(r.waves[1]).toEqual(['engine']);
  });
});

describe('computeBuildSequence — cycles + tolerance', () => {
  it('detects a cycle and reports the unscheduled nodes', () => {
    const r = computeBuildSequence([{ key: 'A', deps: ['B'] }, { key: 'B', deps: ['A'] }]);
    expect(r.hasCycle).toBe(true);
    expect(r.cycleNodes.sort()).toEqual(['A', 'B']);
    expect(r.order.length).toBeLessThan(2);
  });

  it('is terminal-tolerant: a dependency on a key outside the node set is ignored', () => {
    const r = computeBuildSequence([{ key: 'A', deps: ['EXTERNAL-DONE'] }]);
    expect(r.hasCycle).toBe(false);
    expect(r.order).toEqual(['A']);
  });

  it('tolerates empty / malformed input', () => {
    expect(computeBuildSequence([]).order).toEqual([]);
    expect(() => computeBuildSequence(null)).not.toThrow();
    expect(computeBuildSequence([{ deps: [] }, { key: 'A' }]).order).toEqual(['A']); // node w/o key dropped
  });
});

describe('isSchedulable', () => {
  it('is true for an acyclic graph and false for a cyclic one', () => {
    expect(isSchedulable([{ key: 'A', deps: [] }, { key: 'B', deps: ['A'] }])).toBe(true);
    expect(isSchedulable([{ key: 'A', deps: ['B'] }, { key: 'B', deps: ['A'] }])).toBe(false);
  });
});
