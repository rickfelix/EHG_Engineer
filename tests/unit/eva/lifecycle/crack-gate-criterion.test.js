/**
 * SD-LEO-INFRA-ARM-BINDING-EXIT-001 — unit coverage for the crack-gate evidence-sufficiency
 * mechanism (TS-3, TS-4, TS-5, TS-8). lib/eva/lifecycle/crack-gate-criterion.js is a NEW
 * module -- lib/eva/lifecycle/crack-gate-evaluator.js is untouched by this SD (FR-5).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateCrackGateCriterion,
  computeSourceBreakdown,
  fetchAllCrackGateObserveRows,
  fetchCrackGateSubstrateSignals,
  CRACK_GATE_MIN_ROWS,
  CRACK_GATE_MIN_SPAN_HOURS,
} from '../../../../lib/eva/lifecycle/crack-gate-criterion.js';
import { MIN_ROWS, MIN_SPAN_HOURS } from '../../../../lib/eva/lifecycle/bind-criterion-checker.js';

const HEALTHY_SUBSTRATE = { attestationRowCount: 1, pbnAvailable: true };
const T0 = new Date('2026-08-01T00:00:00Z').getTime();

/** N rows, newest-last, spanning exactly `spanHours`, all with the given source. */
function makeRows(n, { spanHours = 0, source = 'sweep' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    payload: { source },
    created_at: new Date(T0 + (n <= 1 ? 0 : (i * spanHours * 3600000) / (n - 1))).toISOString(),
  }));
}

describe('FR-3: reuses bind-criterion-checker.js thresholds via import, not re-typed literals', () => {
  it('CRACK_GATE_MIN_ROWS/CRACK_GATE_MIN_SPAN_HOURS equal the exported MIN_ROWS/MIN_SPAN_HOURS', () => {
    expect(CRACK_GATE_MIN_ROWS).toBe(MIN_ROWS);
    expect(CRACK_GATE_MIN_SPAN_HOURS).toBe(MIN_SPAN_HOURS);
    expect(CRACK_GATE_MIN_ROWS).toBe(25);
    expect(CRACK_GATE_MIN_SPAN_HOURS).toBe(48);
  });
});

describe('TS-3: source discrimination is load-bearing, not vacuous', () => {
  it('Dataset A (>=25 sweep rows, >=48h span, 0 chokepoint-sourced rows) is NOT_MET', () => {
    const rows = makeRows(25, { spanHours: 50, source: 'sweep' });
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.reason).toBe('missing_chokepoint_evidence');
  });

  it('Dataset B (Dataset A plus >=1 publish_gate row) behaves differently -- positive control proving discrimination is real', () => {
    const rows = [...makeRows(25, { spanHours: 50, source: 'sweep' }), { payload: { source: 'publish_gate' }, created_at: new Date(T0 + 51 * 3600000).toISOString() }];
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.verdict).toBe('MEETS_CRITERION');
  });

  it('a deploy_precondition-only chokepoint row also satisfies the check (not publish_gate-exclusive)', () => {
    const rows = [...makeRows(25, { spanHours: 50, source: 'sweep' }), { payload: { source: 'deploy_precondition' }, created_at: new Date(T0 + 51 * 3600000).toISOString() }];
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.verdict).toBe('MEETS_CRITERION');
  });
});

describe('TS-4: SUBSTRATE_EMPTY is the highest-precedence reason', () => {
  it('positive control: overrides what would otherwise be MEETS_CRITERION', () => {
    const rows = [...makeRows(25, { spanHours: 50, source: 'sweep' }), { payload: { source: 'publish_gate' }, created_at: new Date(T0 + 51 * 3600000).toISOString() }];
    const result = evaluateCrackGateCriterion(rows, { attestationRowCount: 0, pbnAvailable: true });
    expect(result.reason).toBe('SUBSTRATE_EMPTY');
    expect(result.verdict).toBe('NOT_MET');
  });

  it('negative control: attestation rows present + PBN available, but <25 rows, yields insufficient_rows, NOT SUBSTRATE_EMPTY', () => {
    const rows = makeRows(10, { spanHours: 50, source: 'sweep' });
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.reason).toBe('insufficient_rows');
  });

  it('pbnAvailable=false also fires SUBSTRATE_EMPTY, even with attestation rows present', () => {
    const rows = [...makeRows(25, { spanHours: 50, source: 'sweep' }), { payload: { source: 'publish_gate' }, created_at: new Date(T0 + 51 * 3600000).toISOString() }];
    const result = evaluateCrackGateCriterion(rows, { attestationRowCount: 5, pbnAvailable: false });
    expect(result.reason).toBe('SUBSTRATE_EMPTY');
  });

  it('fails conservatively (SUBSTRATE_EMPTY) on an unmeasured/null substrate signal', () => {
    const rows = [...makeRows(25, { spanHours: 50, source: 'sweep' }), { payload: { source: 'publish_gate' }, created_at: new Date(T0 + 51 * 3600000).toISOString() }];
    const result = evaluateCrackGateCriterion(rows, { attestationRowCount: null, pbnAvailable: null });
    expect(result.reason).toBe('SUBSTRATE_EMPTY');
  });
});

describe('TS-5: boundary correctness at exactly MIN_ROWS/MIN_SPAN_HOURS', () => {
  it('exactly 25 rows spanning exactly 48.0h, healthy substrate + chokepoint evidence, is MEETS_CRITERION (25 is not < 25; 48.0 is not < 48)', () => {
    const rows = [...makeRows(24, { spanHours: 48, source: 'sweep' }), { payload: { source: 'publish_gate' }, created_at: new Date(T0 + 48 * 3600000).toISOString() }];
    expect(rows.length).toBe(25);
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.verdict).toBe('MEETS_CRITERION');
    expect(result.reason).toBeNull();
  });

  it('24 rows (one under MIN_ROWS) is insufficient_rows', () => {
    const rows = makeRows(24, { spanHours: 50, source: 'sweep' });
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.reason).toBe('insufficient_rows');
  });

  it('a span just under 48h (with enough rows) is insufficient_span', () => {
    const rows = makeRows(25, { spanHours: 47.9, source: 'sweep' });
    const result = evaluateCrackGateCriterion(rows, HEALTHY_SUBSTRATE);
    expect(result.reason).toBe('insufficient_span');
  });
});

describe('computeSourceBreakdown (FR-2 AC1)', () => {
  it('reports count + most-recent timestamp per known source, plus an other bucket for unrecognized values', () => {
    const rows = [
      { payload: { source: 'sweep' }, created_at: '2026-08-01T00:00:00Z' },
      { payload: { source: 'sweep' }, created_at: '2026-08-02T00:00:00Z' },
      { payload: { source: 'publish_gate' }, created_at: '2026-08-03T00:00:00Z' },
      { payload: { source: 'future_source_v2' }, created_at: '2026-08-04T00:00:00Z' },
      { payload: {}, created_at: '2026-08-05T00:00:00Z' },
    ];
    const breakdown = computeSourceBreakdown(rows);
    expect(breakdown.sweep).toEqual({ count: 2, most_recent: '2026-08-02T00:00:00Z' });
    expect(breakdown.publish_gate).toEqual({ count: 1, most_recent: '2026-08-03T00:00:00Z' });
    expect(breakdown.other.count).toBe(2);
    expect(breakdown.deploy_precondition).toBeUndefined();
  });
});

describe('TS-8: error handling', () => {
  it('fetchAllCrackGateObserveRows throws (does not return a false empty result) on a page error', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            range: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
          }),
        }),
      })),
    };
    await expect(fetchAllCrackGateObserveRows(supabase)).rejects.toThrow();
  });

  it('fetchCrackGateSubstrateSignals treats a missing venture_gate_attestations relation as 0 rows (not a throw) -- unapplied chairman-gated migration is an expected state', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_gate_attestations') {
          return { select: () => Promise.resolve({ count: null, error: { code: 'PGRST205', message: 'schema cache miss' } }) };
        }
        if (table === 'venture_nursery') {
          return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
        }
        throw new Error(`unmocked table: ${table}`);
      }),
    };
    const result = await fetchCrackGateSubstrateSignals(supabase);
    expect(result.attestationRowCount).toBe(0);
    expect(result.pbnAvailable).toBe(true);
  });

  it('fetchCrackGateSubstrateSignals treats a missing pbn_verdict column as pbnAvailable=false (not a throw) -- mirrors venture-nursery.js\'s established error-message detection', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_gate_attestations') {
          return { select: () => Promise.resolve({ count: 3, error: null }) };
        }
        if (table === 'venture_nursery') {
          return { select: () => ({ limit: () => Promise.resolve({ data: null, error: { message: "Could not find the 'pbn_verdict' column of 'venture_nursery' in the schema cache" } }) }) };
        }
        throw new Error(`unmocked table: ${table}`);
      }),
    };
    const result = await fetchCrackGateSubstrateSignals(supabase);
    expect(result.attestationRowCount).toBe(3);
    expect(result.pbnAvailable).toBe(false);
  });

  it('fetchCrackGateSubstrateSignals throws (does not silently report a verdict) on a genuine, unrecognized error', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_gate_attestations') {
          return { select: () => Promise.resolve({ count: null, error: { message: 'connection reset' } }) };
        }
        if (table === 'venture_nursery') {
          return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
        }
        throw new Error(`unmocked table: ${table}`);
      }),
    };
    await expect(fetchCrackGateSubstrateSignals(supabase)).rejects.toThrow('connection reset');
  });
});
