/**
 * Unit tests for lib/governance/gauge-registry.js's shape and the pure gauge-runner helpers.
 *
 * SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-1/FR-2, TS-1/TS-2/TS-3.
 *
 * @module tests/unit/governance/gauge-registry.test.js
 */

import { describe, it, expect } from 'vitest';
import { GAUGE_REGISTRY } from '../../../lib/governance/gauge-registry.js';
import { selectEnabledEntries, tripsThreshold } from '../../../scripts/gauge-runner.mjs';

describe('GAUGE_REGISTRY shape', () => {
  it('exports exactly 3 seed entries', () => {
    expect(GAUGE_REGISTRY).toHaveLength(3);
  });

  it('has exactly 1 live entry and 2 stub entries', () => {
    const live = GAUGE_REGISTRY.filter((e) => e.enabled === true);
    const stubs = GAUGE_REGISTRY.filter((e) => e.enabled === false);
    expect(live).toHaveLength(1);
    expect(stubs).toHaveLength(2);
  });

  it('the live entry has a non-null detectorFn key', () => {
    const live = GAUGE_REGISTRY.find((e) => e.enabled === true);
    expect(typeof live.detectorFn).toBe('string');
    expect(live.detectorFn.length).toBeGreaterThan(0);
  });

  it('both stub entries have detectorFn:null', () => {
    const stubs = GAUGE_REGISTRY.filter((e) => e.enabled === false);
    for (const stub of stubs) {
      expect(stub.detectorFn).toBeNull();
    }
  });

  it('every entry has the required fields', () => {
    for (const entry of GAUGE_REGISTRY) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('ownerRole');
      expect(entry).toHaveProperty('remediation');
      expect(entry).toHaveProperty('prevent');
      expect(entry).toHaveProperty('enabled');
    }
  });

  it('stub entries name the sibling SD that owns their detector in the prevent field', () => {
    const relayDrop = GAUGE_REGISTRY.find((e) => e.id === 'relay-drop');
    const staleTree = GAUGE_REGISTRY.find((e) => e.id === 'stale-tree');
    expect(relayDrop.prevent).toContain('SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001');
    expect(staleTree.prevent).toContain('SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001');
  });
});

describe('selectEnabledEntries (TS-1/TS-2)', () => {
  it('TS-1: selects only entries with enabled:true and a non-null detectorFn', () => {
    const registry = [
      { id: 'a', enabled: true, detectorFn: 'x' },
      { id: 'b', enabled: false, detectorFn: null },
      { id: 'c', enabled: true, detectorFn: 'y' },
    ];
    const selected = selectEnabledEntries(registry);
    expect(selected.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('TS-2: an enabled entry with a null detectorFn is still excluded (malformed stub guard)', () => {
    const registry = [{ id: 'a', enabled: true, detectorFn: null }];
    expect(selectEnabledEntries(registry)).toEqual([]);
  });

  it('handles an empty/undefined registry defensively', () => {
    expect(selectEnabledEntries([])).toEqual([]);
    expect(selectEnabledEntries(undefined)).toEqual([]);
  });

  it('the real GAUGE_REGISTRY selects exactly the 1 live entry', () => {
    const selected = selectEnabledEntries(GAUGE_REGISTRY);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('unranked-claimable-leaves');
  });
});

describe('tripsThreshold', () => {
  it('returns true when tripWhen(result) is true', () => {
    const entry = { thresholdConfig: { tripWhen: (r) => r.count > 0 } };
    expect(tripsThreshold(entry, { count: 5 })).toBe(true);
    expect(tripsThreshold(entry, { count: 0 })).toBe(false);
  });

  it('returns false when tripWhen is not a function (stub entries)', () => {
    const entry = { thresholdConfig: { tripWhen: null } };
    expect(tripsThreshold(entry, {})).toBe(false);
  });

  it('TS-3: a throwing tripWhen is caught and returns false, not an uncaught error', () => {
    const entry = { thresholdConfig: { tripWhen: () => { throw new Error('boom'); } } };
    expect(() => tripsThreshold(entry, {})).not.toThrow();
    expect(tripsThreshold(entry, {})).toBe(false);
  });
});
