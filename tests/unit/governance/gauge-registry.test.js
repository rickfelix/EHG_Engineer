/**
 * Unit tests for lib/governance/gauge-registry.js's shape and the pure gauge-runner helpers.
 *
 * SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-1/FR-2, TS-1/TS-2/TS-3.
 *
 * @module tests/unit/governance/gauge-registry.test.js
 */

import { describe, it, expect } from 'vitest';
import { GAUGE_REGISTRY } from '../../../lib/governance/gauge-registry.js';
import { selectEnabledEntries, tripsThreshold, buildFindingRow } from '../../../scripts/gauge-runner.mjs';

// feedback.type is constrained by feedback_type_check (database/migrations/391_quality_lifecycle_schema.sql)
// to these values -- mirrored here (not imported) so this test independently guards the insert
// shape rather than trusting the same constant the code under test might drift from.
const VALID_FEEDBACK_TYPES = ['issue', 'enhancement'];

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

describe('buildFindingRow (FR-3 alerting row shape)', () => {
  it('produces a type value that satisfies the feedback_type_check constraint', () => {
    const entry = { id: 'unranked-claimable-leaves', name: 'Unranked claimable leaf SDs', ownerRole: 'coordinator', remediation: 'x', prevent: 'y' };
    const row = buildFindingRow(entry, { count: 3, keys: ['SD-A'] });
    expect(VALID_FEEDBACK_TYPES).toContain(row.type);
  });

  it('carries the gauge discriminator in category/metadata, not in type', () => {
    const entry = { id: 'unranked-claimable-leaves', name: 'Unranked claimable leaf SDs', ownerRole: 'coordinator', remediation: 'x', prevent: 'y' };
    const row = buildFindingRow(entry, { count: 3, keys: ['SD-A'] });
    expect(row.category).toBe('invariant_gauge_finding');
    expect(row.metadata.gauge_id).toBe('unranked-claimable-leaves');
    expect(row.metadata.owner_role).toBe('coordinator');
  });

  it('title and description reference the entry name/id/remediation', () => {
    const entry = { id: 'gid', name: 'Gauge Name', ownerRole: 'adam', remediation: 'do the thing', prevent: 'p' };
    const row = buildFindingRow(entry, { count: 1 });
    expect(row.title).toContain('Gauge Name');
    expect(row.title).toContain('adam');
    expect(row.description).toContain('gid');
    expect(row.description).toContain('do the thing');
  });
});
