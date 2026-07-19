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
  staleSelfScoreDetector, DEFAULT_SELF_SCORE_STALE_HOURS,
  buildPlanDriftAdvisoryRows, pushPlanDriftAdvisory,
} from '../../../scripts/gauge-runner.mjs';

// feedback.type is constrained by feedback_type_check (database/migrations/391_quality_lifecycle_schema.sql)
// to these values -- mirrored here (not imported) so this test independently guards the insert
// shape rather than trusting the same constant the code under test might drift from.
const VALID_FEEDBACK_TYPES = ['issue', 'enhancement'];

describe('GAUGE_REGISTRY shape', () => {
  it('exports exactly 25 seed entries (8 original + venture-capture-completeness, SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 + 6 loop-health-*, SD-LEO-INFRA-009-LEAF-PER-001 + 3 self-score-age stubs, SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-4 + expired-premise-tags, SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 + operator-cash-attestation-missing, QF-20260705-915 + plan-drift-coverage/plan-drift-mix, SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001 + ghost-ceo, SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001 + hold-state-overdue, SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 + fw3-cmv-rejecter-fake-separation, SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-D)', () => {
    expect(GAUGE_REGISTRY).toHaveLength(25);
  });

  it('22 entries are activated; the 3 self-score-age entries ship as stubs (writers default-OFF)', () => {
    const live = GAUGE_REGISTRY.filter((e) => e.enabled === true);
    const stubs = GAUGE_REGISTRY.filter((e) => e.enabled === false);
    expect(live).toHaveLength(22);
    expect(stubs.map((e) => e.id).sort()).toEqual(['adam_self_score_age', 'coordinator_self_score_age', 'solomon_self_score_age']);
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

  it('SD-LEO-INFRA-REWARD-SPINE-ONE-001-C: every entry carries a tracesToLayer field (not undefined)', () => {
    for (const entry of GAUGE_REGISTRY) {
      expect(entry).toHaveProperty('tracesToLayer');
      expect(['L1', 'L2', 'L3', null]).toContain(entry.tracesToLayer);
    }
  });

  it('SD-LEO-INFRA-REWARD-SPINE-ONE-001-C: entries that read a real outcome-layer carrier are classified non-null', () => {
    const shipWitness = GAUGE_REGISTRY.find((e) => e.id === 'ship-witness-unwitnessed-merge');
    const ventureCapture = GAUGE_REGISTRY.find((e) => e.id === 'venture-capture-completeness');
    const loopHealth = GAUGE_REGISTRY.find((e) => e.id === 'loop-health-A_applied_rate');
    expect(shipWitness.tracesToLayer).toBe('L1');
    expect(ventureCapture.tracesToLayer).toBe('L3');
    expect(loopHealth.tracesToLayer).toBe('L2');
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

  it('the real GAUGE_REGISTRY selects all 22 enabled entries', () => {
    const selected = selectEnabledEntries(GAUGE_REGISTRY);
    expect(selected).toHaveLength(22);
    expect(selected.map((e) => e.id).sort()).toEqual([
      'adam-claimed-or-built-sd',
      'coordinator-sourced-sd',
      'expired-premise-tags',
      'fw3-cmv-rejecter-fake-separation',
      'ghost-ceo',
      'hold-state-overdue',
      'loop-health-A_applied_rate',
      'loop-health-B_signal_aggregation',
      'loop-health-C_retro_learn',
      'loop-health-D_convergence_clone',
      'loop-health-E_role_self_review',
      'loop-health-F_pat_registry',
      'operator-cash-attestation-missing',
      'plan-drift-coverage',
      'plan-drift-mix',
      'recursion-governor-ratio',
      'relay-drop',
      'ship-witness-unwitnessed-merge',
      'solomon-dispatched-sd',
      'stale-tree',
      'unranked-claimable-leaves',
      'venture-capture-completeness',
    ]);
  });

  it('SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001: the two new entries have resolvable detectorFns, ownerRole coordinator, and honest-gauge tripWhen conventions', () => {
    const coverage = GAUGE_REGISTRY.find((e) => e.id === 'plan-drift-coverage');
    const mix = GAUGE_REGISTRY.find((e) => e.id === 'plan-drift-mix');
    expect(coverage).toBeTruthy();
    expect(coverage.detectorFn).toBe('plan-drift-coverage');
    expect(coverage.ownerRole).toBe('coordinator');
    expect(coverage.thresholdConfig.tripWhen({ starved: true })).toBe(true);
    expect(coverage.thresholdConfig.tripWhen({ starved: false })).toBe(false);
    expect(mix).toBeTruthy();
    expect(mix.detectorFn).toBe('plan-drift-mix');
    expect(mix.ownerRole).toBe('coordinator');
    expect(mix.thresholdConfig.tripWhen({ sustainedBreach: true })).toBe(true);
    expect(mix.thresholdConfig.tripWhen({ sustainedBreach: false })).toBe(false);
  });

  it('QF-20260705-915: operator-cash-attestation-missing has a resolvable detectorFn, ownerRole chairman, and the >0-count tripWhen convention', () => {
    const entry = GAUGE_REGISTRY.find((e) => e.id === 'operator-cash-attestation-missing');
    expect(entry).toBeTruthy();
    expect(entry.detectorFn).toBe('operator-cash-attestation-missing');
    expect(entry.ownerRole).toBe('chairman');
    expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
    expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
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

  it('SD-LEO-INFRA-009-LEAF-RECURSION-001: the recursion-governor entry has a resolvable detectorFn, ownerRole chairman, and the >0-count tripWhen convention', () => {
    const entry = GAUGE_REGISTRY.find((e) => e.id === 'recursion-governor-ratio');
    expect(entry).toBeTruthy();
    expect(entry.detectorFn).toBe('recursion-governor-ratio');
    expect(entry.ownerRole).toBe('chairman');
    expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
    expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
  });

  it('SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001: the venture-capture-completeness entry has a resolvable detectorFn, ownerRole coordinator, and the >0-count tripWhen convention', () => {
    const entry = GAUGE_REGISTRY.find((e) => e.id === 'venture-capture-completeness');
    expect(entry).toBeTruthy();
    expect(entry.detectorFn).toBe('venture-capture-completeness');
    expect(entry.ownerRole).toBe('coordinator');
    expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
    expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
  });

  it('SD-LEO-INFRA-HOLD-STATE-CONTRACT-001: the hold-state-overdue entry has a resolvable detectorFn, ownerRole coordinator, and the >0-count tripWhen convention', () => {
    const entry = GAUGE_REGISTRY.find((e) => e.id === 'hold-state-overdue');
    expect(entry).toBeTruthy();
    expect(entry.detectorFn).toBe('hold-state-overdue');
    expect(entry.ownerRole).toBe('coordinator');
    expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
    expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
  });

  it('SD-LEO-INFRA-009-LEAF-PER-001: all 6 loop-health entries have a resolvable detectorFn, ownerRole coordinator, and the >0-count tripWhen convention', () => {
    for (const loopId of ['A_applied_rate', 'B_signal_aggregation', 'C_retro_learn', 'D_convergence_clone', 'E_role_self_review', 'F_pat_registry']) {
      const id = `loop-health-${loopId}`;
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

describe('staleSelfScoreDetector (SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-4)', () => {
  const fakeSupabase = (rows, err = null) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: err }),
          }),
        }),
      }),
    }),
  });

  it('trips (count:1) when no self-score row exists for the category', async () => {
    const detect = staleSelfScoreDetector(fakeSupabase([]), 'adam_self_assessment');
    const result = await detect();
    expect(result.count).toBe(1);
    expect(result.reason).toMatch(/no self-score row/);
  });

  it('does not trip for a fresh row well within the cadence window', async () => {
    const fresh = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2h old
    const detect = staleSelfScoreDetector(fakeSupabase([{ created_at: fresh }]), 'coordinator_self_assessment', 48);
    const result = await detect();
    expect(result.count).toBe(0);
  });

  it('trips for a row older than the cadence window', async () => {
    const stale = new Date(Date.now() - 72 * 3600 * 1000).toISOString(); // 72h old
    const detect = staleSelfScoreDetector(fakeSupabase([{ created_at: stale }]), 'solomon_self_assessment', 48);
    const result = await detect();
    expect(result.count).toBe(1);
    expect(result.cadenceHours).toBe(48);
  });

  it('defaults to DEFAULT_SELF_SCORE_STALE_HOURS when no cadence is given', async () => {
    const stale = new Date(Date.now() - (DEFAULT_SELF_SCORE_STALE_HOURS + 1) * 3600 * 1000).toISOString();
    const detect = staleSelfScoreDetector(fakeSupabase([{ created_at: stale }]), 'adam_self_assessment');
    const result = await detect();
    expect(result.count).toBe(1);
  });

  it('throws on a query error (caught non-fatally by the runner loop, not swallowed here)', async () => {
    const detect = staleSelfScoreDetector(fakeSupabase(null, { message: 'boom' }), 'adam_self_assessment');
    await expect(detect()).rejects.toThrow(/boom/);
  });
});

describe('the 3 self-score-age registry entries (FR-4)', () => {
  it('each has a detectorFn key resolvable in gauge-runner.mjs\'s buildDetectorResolvers map', () => {
    const ids = ['adam_self_score_age', 'coordinator_self_score_age', 'solomon_self_score_age'];
    const detectorFns = ['adam-self-score-age', 'coordinator-self-score-age', 'solomon-self-score-age'];
    ids.forEach((id, i) => {
      const entry = GAUGE_REGISTRY.find((e) => e.id === id);
      expect(entry).toBeTruthy();
      expect(entry.detectorFn).toBe(detectorFns[i]);
      expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
      expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
      expect(entry.enabled).toBe(false); // ships alongside the writers' default-OFF cadence flags
    });
  });
});

describe('buildPlanDriftAdvisoryRows / pushPlanDriftAdvisory (SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001 FR-6, TS-5)', () => {
  const sampleResult = { streak: 2, mix: { activeRungPct: 12.5, mix: { now: 1, next: 7 } } };

  it('builds a coordinator row targeting the resolved coordinator id', () => {
    const { coordinatorRow } = buildPlanDriftAdvisoryRows(sampleResult, { coordinatorId: 'coord-123', adamId: null });
    expect(coordinatorRow.target_session).toBe('coord-123');
    expect(coordinatorRow.payload.kind).toBe('coordinator_advisory');
    expect(coordinatorRow.payload.gauge_id).toBe('plan-drift-mix');
    expect(coordinatorRow.subject).toContain('[PLAN-DRIFT]');
  });

  it('falls back to the broadcast-coordinator sentinel when no coordinator is resolved', () => {
    const { coordinatorRow } = buildPlanDriftAdvisoryRows(sampleResult, { coordinatorId: null, adamId: null });
    expect(coordinatorRow.target_session).toBe('broadcast-coordinator');
  });

  it('builds an Adam row only when an Adam session id is resolved (TS-8 typed-kind contract)', () => {
    const withAdam = buildPlanDriftAdvisoryRows(sampleResult, { coordinatorId: 'coord-1', adamId: 'adam-1' });
    expect(withAdam.adamRow).not.toBeNull();
    expect(withAdam.adamRow.target_session).toBe('adam-1');
    expect(withAdam.adamRow.payload.kind).toBe('coordinator_advisory'); // registered ADAM_INBOX_KINDS entry -- never orphaned

    const withoutAdam = buildPlanDriftAdvisoryRows(sampleResult, { coordinatorId: 'coord-1', adamId: null });
    expect(withoutAdam.adamRow).toBeNull();
  });

  it('pushPlanDriftAdvisory inserts exactly one coordinator row and one Adam row when both are resolved', async () => {
    const inserted = [];
    const fakeSupabase = {
      from: () => ({
        insert: (row) => { inserted.push(row); return Promise.resolve({ error: null }); },
      }),
    };
    await pushPlanDriftAdvisory(fakeSupabase, sampleResult, { coordinatorId: 'coord-1', adamId: 'adam-1' });
    expect(inserted).toHaveLength(2);
    expect(inserted[0].target_session).toBe('coord-1');
    expect(inserted[1].target_session).toBe('adam-1');
  });

  it('pushPlanDriftAdvisory inserts only the coordinator row when no Adam session resolves (never blocks on it)', async () => {
    const inserted = [];
    const fakeSupabase = {
      from: () => ({
        insert: (row) => { inserted.push(row); return Promise.resolve({ error: null }); },
      }),
    };
    await pushPlanDriftAdvisory(fakeSupabase, sampleResult, { coordinatorId: 'coord-1', adamId: null });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].target_session).toBe('coord-1');
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
