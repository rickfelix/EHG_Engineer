/**
 * Tests for TTLMap iterator interop
 * SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 (PR3)
 *
 * Native Map exposes [Symbol.iterator] aliasing entries(), which makes
 * `for...of map` and `[...map]` work without calling .entries() explicitly.
 * TTLMap is a drop-in replacement for Map and must match this contract —
 * eva-master-scheduler iterates _jobRegistry / _roundRegistry via for...of
 * directly, and was failing 36 tests until this was added.
 */

import { describe, it, expect } from 'vitest';
import { TTLMap } from './ttl-map.js';

describe('TTLMap iterator', () => {
  it('supports for...of iteration like a native Map', () => {
    const m = new TTLMap();
    m.set('a', 1);
    m.set('b', 2);

    const seen = [];
    for (const [k, v] of m) {
      seen.push([k, v]);
    }
    expect(seen).toEqual([['a', 1], ['b', 2]]);
  });

  it('supports spread into array (Array.from)', () => {
    const m = new TTLMap();
    m.set('x', 'foo');
    m.set('y', 'bar');

    expect(Array.from(m)).toEqual([['x', 'foo'], ['y', 'bar']]);
  });

  it('skips expired entries during iteration', () => {
    const m = new TTLMap({ defaultTTLMs: 1000 });
    m.set('keep', 'now');
    m.set('expired', 'past', -1);

    const keys = [];
    for (const [k] of m) {
      keys.push(k);
    }
    expect(keys).toEqual(['keep']);
  });
});
