/**
 * SD-LEO-INFRA-STAGE-VISION-DRIFT-001 (FR-5) — S19 drift-check-required backfill marker.
 * TS-5: SET-ONCE idempotency — second run is a no-op; siblings preserved; predicate is
 * lifecycle_stage=19 AND vision_drift_verdict IS NULL AND no existing marker (testing-agent C3).
 */
import { describe, it, expect } from 'vitest';
import { backfillDriftCheckMarker, MARKER_KEY } from '../../../scripts/eva/backfill-vision-drift-marker.mjs';

// Stateful Supabase mock: select().eq() reads state; update().eq('id',..) mutates the matching row.
function makeStatefulMock(rows) {
  const state = rows;
  function builder() {
    let pendingUpdate = null;
    const b = {
      select() { return b; },
      eq(col, val) {
        if (pendingUpdate) {
          const row = state.find((r) => r.id === val);
          if (row) row.advisory_data = pendingUpdate.advisory_data;
          pendingUpdate = null;
          return Promise.resolve({ error: null });
        }
        return b; // select filter (e.g. lifecycle_stage=19)
      },
      update(payload) { pendingUpdate = payload; return b; },
      then(onF, onR) { return Promise.resolve({ data: state.map((r) => ({ ...r })), error: null }).then(onF, onR); },
    };
    return b;
  }
  return { from: () => builder(), __state: state };
}

describe('backfillDriftCheckMarker (FR-5, TS-5)', () => {
  it('TS-5: SET-ONCE idempotent — marks candidates once, second run is a no-op, siblings preserved', async () => {
    const rows = [
      { id: 'sw1', venture_id: 'v1', advisory_data: {} },                                              // candidate
      { id: 'sw2', venture_id: 'v2', advisory_data: { vision_drift_verdict: { material_drift: false } } }, // already evaluated → skip
      { id: 'sw3', venture_id: 'v3', advisory_data: { vision_acceptance_verdict: { pass: true } } },       // candidate w/ sibling
    ];
    const supabase = makeStatefulMock(rows);

    const r1 = await backfillDriftCheckMarker({ supabase, apply: true, nowIso: '2026-06-03T00:00:00Z' });
    expect(r1.scanned).toBe(3);
    expect(r1.marked).toBe(2);
    expect(r1.skipped).toBe(1);

    const sw3 = supabase.__state.find((r) => r.id === 'sw3');
    expect(sw3.advisory_data.vision_acceptance_verdict).toEqual({ pass: true }); // sibling preserved
    expect(sw3.advisory_data[MARKER_KEY].reason).toBe('s19-backfill');

    // SET-ONCE: a second apply run marks nothing and does not bump the timestamp
    const r2 = await backfillDriftCheckMarker({ supabase, apply: true, nowIso: '2026-06-04T00:00:00Z' });
    expect(r2.marked).toBe(0);
    expect(r2.skipped).toBe(3);
    const sw1 = supabase.__state.find((r) => r.id === 'sw1');
    expect(sw1.advisory_data[MARKER_KEY].requested_at).toBe('2026-06-03T00:00:00Z');
  });

  it('dry-run (apply=false) reports candidates but writes nothing', async () => {
    const rows = [{ id: 'sw1', venture_id: 'v1', advisory_data: {} }];
    const supabase = makeStatefulMock(rows);
    const r = await backfillDriftCheckMarker({ supabase, apply: false });
    expect(r.candidates).toEqual(['v1']);
    expect(r.marked).toBe(0);
    expect(supabase.__state[0].advisory_data[MARKER_KEY]).toBeUndefined();
  });

  it('predicate excludes non-candidates: already-evaluated and already-marked rows are skipped', async () => {
    const rows = [
      { id: 'sw1', venture_id: 'v1', advisory_data: { vision_drift_verdict: { board_unavailable: true } } },
      { id: 'sw2', venture_id: 'v2', advisory_data: { [MARKER_KEY]: { requested_at: 'x' } } },
    ];
    const supabase = makeStatefulMock(rows);
    const r = await backfillDriftCheckMarker({ supabase, apply: true });
    expect(r.marked).toBe(0);
    expect(r.skipped).toBe(2);
  });
});
