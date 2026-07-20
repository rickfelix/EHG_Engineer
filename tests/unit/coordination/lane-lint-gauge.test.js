/**
 * SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-6 — lane-lint observability gauge.
 *
 * lib/coordination/lane-lint-gauge.cjs — read-only, four independent violation-class counts.
 * No live DB calls in these tests (rows/resurfaceRows injected directly into the pure core).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isUntypedRow,
  isBodylessRow,
  isEmptySenderRow,
  computeRowViolationCounts,
  computeResurfaceDedupDrift,
  runLaneLintGauge,
  RESURFACE_KIND,
} = require('../../../lib/coordination/lane-lint-gauge.cjs');

function cleanRow(overrides = {}) {
  return {
    id: 'row-' + Math.random().toString(36).slice(2),
    sender_session: '11111111-1111-4111-8111-111111111111',
    sender_type: 'worker',
    payload: { kind: 'adam_advisory', body: 'a real authored message' },
    body: null,
    acknowledged_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('isUntypedRow / isBodylessRow / isEmptySenderRow — pure detectors', () => {
  it('isUntypedRow: true for missing/null/empty payload.kind', () => {
    expect(isUntypedRow({ payload: {} })).toBe(true);
    expect(isUntypedRow({ payload: { kind: null } })).toBe(true);
    expect(isUntypedRow({ payload: { kind: '' } })).toBe(true);
    expect(isUntypedRow({ payload: null })).toBe(true);
    expect(isUntypedRow({ payload: { kind: 'adam_advisory' } })).toBe(false);
  });

  it('isBodylessRow: true only for a TYPED, non-mechanical, non-fence row with no canonical body', () => {
    expect(isBodylessRow({ payload: { kind: 'adam_advisory' }, body: null })).toBe(true);
    expect(isBodylessRow({ payload: { kind: 'adam_advisory', body: 'x' } })).toBe(false);
    expect(isBodylessRow({ payload: { kind: 'adam_advisory' }, body: 'x' })).toBe(false); // column fallback
    expect(isBodylessRow({ payload: {} })).toBe(false); // untyped -- counted separately, no double-count
    expect(isBodylessRow({ payload: { kind: 'canary_request' } })).toBe(false); // mechanical, legitimately bodyless
    expect(isBodylessRow({ payload: { kind: 'fence_notice' } })).toBe(false); // legitimately bodyless
  });

  it('isEmptySenderRow: true for a missing sender_session UNLESS sender_type is legitimately senderless', () => {
    expect(isEmptySenderRow({ sender_session: null, sender_type: 'worker' })).toBe(true);
    expect(isEmptySenderRow({ sender_session: '', sender_type: 'coordinator' })).toBe(true);
    expect(isEmptySenderRow({ sender_session: null, sender_type: 'sweep' })).toBe(false); // resurfaceStalePending's own legitimate pattern
    expect(isEmptySenderRow({ sender_session: 's1', sender_type: 'worker' })).toBe(false);
  });
});

describe('computeRowViolationCounts — AC-1: independent per-class counts', () => {
  it('reports zero for a clean window (AC-2)', () => {
    const rows = [cleanRow(), cleanRow(), cleanRow()];
    expect(computeRowViolationCounts(rows)).toEqual({ untyped_row: 0, bodyless_row: 0, empty_sender_row: 0 });
  });

  it('counts each class independently, not conflated into one number', () => {
    const rows = [
      cleanRow(),
      cleanRow({ payload: {} }), // untyped
      cleanRow({ payload: { kind: 'adam_advisory' }, body: null }), // bodyless
      cleanRow({ sender_session: null, sender_type: 'worker' }), // empty sender
      cleanRow({ sender_session: null, sender_type: 'worker' }), // empty sender (2nd)
    ];
    expect(computeRowViolationCounts(rows)).toEqual({ untyped_row: 1, bodyless_row: 1, empty_sender_row: 2 });
  });

  it('AC-3: a fixture reproducing ONLY the untyped-row class reports non-zero for that class only', () => {
    const rows = [cleanRow(), cleanRow(), cleanRow({ payload: { kind: '' } })];
    expect(computeRowViolationCounts(rows)).toEqual({ untyped_row: 1, bodyless_row: 0, empty_sender_row: 0 });
  });

  it('AC-3: a fixture reproducing ONLY the bodyless-row class reports non-zero for that class only', () => {
    const rows = [cleanRow(), cleanRow(), cleanRow({ payload: { kind: 'coordinator_request' }, body: null })];
    expect(computeRowViolationCounts(rows)).toEqual({ untyped_row: 0, bodyless_row: 1, empty_sender_row: 0 });
  });

  it('AC-3: a fixture reproducing ONLY the empty-sender-row class reports non-zero for that class only', () => {
    const rows = [cleanRow(), cleanRow(), cleanRow({ sender_session: '', sender_type: 'coordinator' })];
    expect(computeRowViolationCounts(rows)).toEqual({ untyped_row: 0, bodyless_row: 0, empty_sender_row: 1 });
  });
});

describe('computeResurfaceDedupDrift — instance 9', () => {
  function resurfaceRow(ledgerId, acknowledged) {
    return {
      id: 'r-' + Math.random().toString(36).slice(2),
      payload: { kind: RESURFACE_KIND, ledger_id: ledgerId },
      acknowledged_at: acknowledged ? new Date().toISOString() : null,
    };
  }

  it('reports zero when every ledger item has at most one unacked resurface (AC-2 clean window)', () => {
    const rows = [resurfaceRow('l1', false), resurfaceRow('l2', false), resurfaceRow('l3', true)];
    expect(computeResurfaceDedupDrift(rows)).toBe(0);
  });

  it('AC-3: a fixture reproducing ONLY the resurface-dedup-drift class reports non-zero for that class only', () => {
    // l1 has TWO concurrently-unacked resurfaces (yesterday's stale one + today's fresh one) — drift.
    const rows = [resurfaceRow('l1', false), resurfaceRow('l1', false), resurfaceRow('l2', false)];
    expect(computeResurfaceDedupDrift(rows)).toBe(1);
  });

  it('an acknowledged prior resurface does not count toward drift for its ledger item', () => {
    const rows = [resurfaceRow('l1', true), resurfaceRow('l1', false)]; // only 1 concurrently-unacked
    expect(computeResurfaceDedupDrift(rows)).toBe(0);
  });

  it('rows of a different kind are ignored (server-side kind filter is trusted, but pure core is defensive)', () => {
    const rows = [
      { id: 'x', payload: { kind: 'adam_advisory' }, acknowledged_at: null },
      resurfaceRow('l1', false),
    ];
    expect(computeResurfaceDedupDrift(rows)).toBe(0);
  });
});

describe('runLaneLintGauge — tick entry point, fail-open, read-only', () => {
  function makeSupabase({ windowRows = [], resurfaceRows = [] } = {}) {
    // FR-6 batch 8 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): the loaders now paginate
    // via fetchAllPaginated (.order() then .range()) instead of a single .limit(2000) fetch —
    // extend the builder stub with slice-based .range() so a short page terminates the loop.
    const page = (rows) => ({
      order: () => ({ range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }) }),
    });
    return {
      from(table) {
        return {
          select() {
            return {
              gte() {
                return {
                  ...page(windowRows),
                  eq: () => ({ gte: () => page(resurfaceRows) }),
                };
              },
              eq() {
                return { gte: () => page(resurfaceRows) };
              },
            };
          },
        };
      },
    };
  }

  it('never throws even if the supabase client itself throws (fail-soft at the loader layer, matching relay-drop-gauge.cjs precedent)', async () => {
    const throwingSupabase = { from() { throw new Error('DB unavailable'); } };
    const result = await runLaneLintGauge(throwingSupabase);
    expect(result).toEqual({ untyped_row: 0, bodyless_row: 0, empty_sender_row: 0, resurface_dedup_drift: 0, windowRows: 0 });
  });

  it('composes the row-level counts and the resurface-drift count into one report', async () => {
    const windowRows = [cleanRow(), cleanRow({ payload: {} })]; // 1 untyped
    const resurfaceRows = [
      { payload: { kind: RESURFACE_KIND, ledger_id: 'l1' }, acknowledged_at: null },
      { payload: { kind: RESURFACE_KIND, ledger_id: 'l1' }, acknowledged_at: null },
    ]; // drift=1
    const supabase = makeSupabase({ windowRows, resurfaceRows });
    const result = await runLaneLintGauge(supabase);
    expect(result.untyped_row).toBe(1);
    expect(result.resurface_dedup_drift).toBe(1);
    expect(result.windowRows).toBe(2);
    expect(result.error).toBeUndefined();
  });
});
