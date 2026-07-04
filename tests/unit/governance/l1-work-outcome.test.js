/**
 * SD-LEO-INFRA-REWARD-SPINE-ONE-001-D — unit coverage for computeL1Outcome's 3-state coverage
 * model (witnessed / unwitnessed / no_data), using injected-stub Supabase clients so the pure
 * decision logic is exercised without a live DB.
 */
import { describe, it, expect } from 'vitest';
import { computeL1Outcome } from '../../../lib/governance/l1-work-outcome.js';

function fakeSupabase({ telemetryRow = null, telemetryError = null, patternRows = [], patternError = null } = {}) {
  return {
    from(table) {
      if (table === 'merge_witness_telemetry') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: telemetryRow ? [telemetryRow] : [], error: telemetryError }),
              }),
            }),
          }),
        };
      }
      if (table === 'issue_patterns') {
        return {
          select: () => ({
            or: () => ({
              eq: () => ({
                not: () => Promise.resolve({ data: patternRows, error: patternError }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('computeL1Outcome: witnessed lanes', () => {
  it('a ship-auto-merge row with all-pass rungs is shipped_clean/witnessed', async () => {
    const sb = fakeSupabase({
      telemetryRow: { lane: 'ship-auto-merge', overall: 'observe-only', rungs: [{ id: 'P3', status: 'pass' }, { id: 'P4', status: 'pass' }] },
    });
    const result = await computeL1Outcome(sb, 'QF-TEST-001');
    expect(result.outcome).toBe('shipped_clean');
    expect(result.coverage).toBe('witnessed');
    expect(result.evidence.rungs).toHaveLength(2);
  });

  it('a ship-witness-retroactive-cli row with any non-pass rung is unproven/witnessed (not shipped_clean)', async () => {
    const sb = fakeSupabase({
      telemetryRow: { lane: 'ship-witness-retroactive-cli', rungs: [{ id: 'P3', status: 'pass' }, { id: 'P4', status: 'fail' }] },
    });
    const result = await computeL1Outcome(sb, 'QF-TEST-002');
    expect(result.outcome).toBe('unproven');
    expect(result.coverage).toBe('witnessed');
  });

  it('not_evaluable rungs are excluded from the pass determination, not treated as blocking (real finding: P1/P2 read not_evaluable on 139/139 sampled witnessed rows, 2026-07-04 -- a witness-ladder wiring gap, not a real check failure)', async () => {
    const sb = fakeSupabase({
      telemetryRow: {
        lane: 'ship-auto-merge',
        rungs: [
          { id: 'P1', status: 'not_evaluable', reason: 'no lookupWorkKeyReal injected' },
          { id: 'P2', status: 'not_evaluable', reason: 'no fetchReviewFinding injected' },
          { id: 'P3', status: 'pass' },
          { id: 'P4', status: 'pass' },
          { id: 'P5', status: 'pass' },
        ],
      },
    });
    const result = await computeL1Outcome(sb, 'QF-TEST-008');
    expect(result.outcome).toBe('shipped_clean');
    expect(result.coverage).toBe('witnessed');
    expect(result.evidence.evaluated_count).toBe(3);
    expect(result.evidence.not_evaluable_count).toBe(2);
  });

  it('all rungs not_evaluable (zero evaluated) is unproven, not shipped_clean by vacuous truth', async () => {
    const sb = fakeSupabase({
      telemetryRow: { lane: 'ship-auto-merge', rungs: [{ id: 'P1', status: 'not_evaluable' }, { id: 'P2', status: 'not_evaluable' }] },
    });
    const result = await computeL1Outcome(sb, 'QF-TEST-009');
    expect(result.outcome).toBe('unproven');
    expect(result.evidence.evaluated_count).toBe(0);
  });
});

describe('computeL1Outcome: unwitnessed and no_data — never silently clean', () => {
  it('a reconcile-sweep row with empty rungs is unproven/unwitnessed', async () => {
    const sb = fakeSupabase({ telemetryRow: { lane: 'reconcile-sweep', rungs: [] } });
    const result = await computeL1Outcome(sb, 'SD-TEST-003');
    expect(result.outcome).toBe('unproven');
    expect(result.coverage).toBe('unwitnessed');
    expect(result.evidence.reason).toMatch(/no rung-level verdicts/);
  });

  it('no telemetry row at all is unproven/no_data (distinct from unwitnessed)', async () => {
    const sb = fakeSupabase({ telemetryRow: null });
    const result = await computeL1Outcome(sb, 'SD-TEST-004');
    expect(result.outcome).toBe('unproven');
    expect(result.coverage).toBe('no_data');
  });

  it('a telemetry query error is fail-safe to unproven/no_data, not a thrown exception', async () => {
    const sb = fakeSupabase({ telemetryError: { message: 'transient db error' } });
    const result = await computeL1Outcome(sb, 'SD-TEST-005');
    expect(result.outcome).toBe('unproven');
    expect(result.coverage).toBe('no_data');
    expect(result.evidence.error).toMatch(/transient db error/);
  });
});

describe('computeL1Outcome: recurrence degrades the outcome', () => {
  it('a reopened (resolution_date set, status active) issue_patterns row degrades a witnessed-clean merge to caused_rework', async () => {
    const sb = fakeSupabase({
      telemetryRow: { lane: 'ship-auto-merge', rungs: [{ id: 'P3', status: 'pass' }] },
      patternRows: [{ id: 'pat-1', dedup_fingerprint: 'abc123', resolution_date: '2026-06-01T00:00:00Z' }],
    });
    const result = await computeL1Outcome(sb, 'SD-TEST-006');
    expect(result.outcome).toBe('caused_rework');
    expect(result.coverage).toBe('witnessed'); // coverage describes the telemetry signal, unaffected by recurrence
    expect(result.evidence.recurrence).toHaveLength(1);
    expect(result.evidence.recurrence[0].dedup_fingerprint).toBe('abc123');
  });

  it('no recurrence found leaves the base outcome untouched', async () => {
    const sb = fakeSupabase({
      telemetryRow: { lane: 'ship-auto-merge', rungs: [{ id: 'P3', status: 'pass' }] },
      patternRows: [],
    });
    const result = await computeL1Outcome(sb, 'SD-TEST-007');
    expect(result.outcome).toBe('shipped_clean');
    expect(result.evidence.recurrence).toBeUndefined();
  });
});
