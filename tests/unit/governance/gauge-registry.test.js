/**
 * Unit tests for lib/governance/gauge-registry.js's shape and the pure gauge-runner helpers.
 *
 * SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-1/FR-2, TS-1/TS-2/TS-3.
 *
 * @module tests/unit/governance/gauge-registry.test.js
 */

import { describe, it, expect } from 'vitest';
import { GAUGE_REGISTRY } from '../../../lib/governance/gauge-registry.js';
import {
  selectEnabledEntries, tripsThreshold, buildFindingRow,
  shapeRelayDropResult, shapeStaleTreeResult,
} from '../../../scripts/gauge-runner.mjs';

// feedback.type is constrained by feedback_type_check (database/migrations/391_quality_lifecycle_schema.sql)
// to these values -- mirrored here (not imported) so this test independently guards the insert
// shape rather than trusting the same constant the code under test might drift from.
const VALID_FEEDBACK_TYPES = ['issue', 'enhancement'];

describe('GAUGE_REGISTRY shape', () => {
  it('exports exactly 7 seed entries (4 prior + 3 work-boundary gauges, SD-LEO-INFRA-009-LEAF-WORK-001)', () => {
    expect(GAUGE_REGISTRY).toHaveLength(7);
  });

  it('all 7 entries are activated — no stub entries remain', () => {
    const live = GAUGE_REGISTRY.filter((e) => e.enabled === true);
    const stubs = GAUGE_REGISTRY.filter((e) => e.enabled === false);
    expect(live).toHaveLength(7);
    expect(stubs).toHaveLength(0);
  });

  it('every entry has a non-null, non-empty detectorFn key', () => {
    for (const entry of GAUGE_REGISTRY) {
      expect(typeof entry.detectorFn).toBe('string');
      expect(entry.detectorFn.length).toBeGreaterThan(0);
    }
  });

  it('each entry\'s detectorFn key matches its id (the resolver map convention)', () => {
    const relayDrop = GAUGE_REGISTRY.find((e) => e.id === 'relay-drop');
    const staleTree = GAUGE_REGISTRY.find((e) => e.id === 'stale-tree');
    expect(relayDrop.detectorFn).toBe('relay-drop');
    expect(staleTree.detectorFn).toBe('stale-tree');
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

  it('the two adopted entries still name the sibling SD that shipped their detector in the prevent field', () => {
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

  it('the real GAUGE_REGISTRY selects all 7 entries now that every stub is activated', () => {
    const selected = selectEnabledEntries(GAUGE_REGISTRY);
    expect(selected).toHaveLength(7);
    expect(selected.map((e) => e.id).sort()).toEqual([
      'adam-claimed-or-built-sd',
      'coordinator-sourced-sd',
      'relay-drop',
      'ship-witness-unwitnessed-merge',
      'solomon-dispatched-sd',
      'stale-tree',
      'unranked-claimable-leaves',
    ]);
  });

  it('SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001: the new entry has a resolvable detectorFn and the >0-count tripWhen convention', () => {
    const entry = GAUGE_REGISTRY.find((e) => e.id === 'ship-witness-unwitnessed-merge');
    expect(entry).toBeTruthy();
    expect(entry.detectorFn).toBe('ship-witness-unwitnessed-merge');
    expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
    expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
  });

  it('SD-LEO-INFRA-009-LEAF-WORK-001: all 3 work-boundary entries have a resolvable detectorFn, ownerRole coordinator, and the >0-count tripWhen convention', () => {
    for (const id of ['coordinator-sourced-sd', 'adam-claimed-or-built-sd', 'solomon-dispatched-sd']) {
      const entry = GAUGE_REGISTRY.find((e) => e.id === id);
      expect(entry).toBeTruthy();
      expect(entry.detectorFn).toBe(id);
      expect(entry.ownerRole).toBe('coordinator');
      expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
      expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
    }
  });
});

describe('shapeRelayDropResult (relay-drop resolver shaping)', () => {
  it('reports count = flagged when the gauge is enabled', () => {
    expect(shapeRelayDropResult({ enabled: true, flagged: 3, ok: 1, pending: 0 })).toMatchObject({ count: 3 });
  });

  it('reports count:0 when flagged:0, even while enabled', () => {
    expect(shapeRelayDropResult({ enabled: true, flagged: 0, ok: 2, pending: 1 })).toMatchObject({ count: 0 });
  });

  it('forces count:0 when the module\'s own kill-switch (enabled) is false, regardless of flagged', () => {
    expect(shapeRelayDropResult({ enabled: false, flagged: 5 })).toMatchObject({ count: 0 });
  });

  it('preserves the original result fields alongside the added count', () => {
    const shaped = shapeRelayDropResult({ enabled: true, flagged: 2, ok: 1, pending: 0, decisions: [] });
    expect(shaped.flagged).toBe(2);
    expect(shaped.decisions).toEqual([]);
  });

  it('handles a missing/undefined result without throwing', () => {
    expect(shapeRelayDropResult(undefined)).toMatchObject({ count: 0 });
  });
});

describe('shapeStaleTreeResult (stale-tree resolver shaping)', () => {
  it('reports count:0 for a FRESH verdict', () => {
    expect(shapeStaleTreeResult({ verdict: 'FRESH', behind: 0 })).toMatchObject({ count: 0 });
  });

  it('reports count:1 for a STALE verdict', () => {
    expect(shapeStaleTreeResult({ verdict: 'STALE', behind: 4 })).toMatchObject({ count: 1 });
  });

  it('reports count:1 for a STALE-CRITICAL verdict', () => {
    expect(shapeStaleTreeResult({ verdict: 'STALE-CRITICAL', behind: 2, criticalDiff: ['CLAUDE.md'] })).toMatchObject({ count: 1 });
  });

  it('preserves the original verdict fields alongside the added count', () => {
    const shaped = shapeStaleTreeResult({ verdict: 'STALE', behind: 7, role: 'fleet-gauge-runner' });
    expect(shaped.verdict).toBe('STALE');
    expect(shaped.behind).toBe(7);
    expect(shaped.role).toBe('fleet-gauge-runner');
  });

  it('handles a missing/undefined result without throwing (fails toward count:1, not a silent 0)', () => {
    expect(shapeStaleTreeResult(undefined)).toMatchObject({ count: 1 });
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
