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
  DIGEST_KIND,
  RESURFACE_KINDS,
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

  // ── SD-LEO-INFRA-RESURFACE-DIGEST-BATCHING-001 (FR-4) ─────────────────────────────────────
  // The producer now writes ONE digest row per run carrying payload.ledger_ids[] instead of one
  // row per item with a scalar payload.ledger_id.
  //
  // WHY THESE TESTS ARE SHAPED THIS WAY: the pre-change core read `payload.ledger_id` and did
  // `continue` on falsy, so EVERY digest row was skipped and drift read 0 forever. Live drift is
  // legitimately 0 today, so that regression would have been indistinguishable from a healthy
  // reading by observation alone. Only an assertion that goes RED against the old code can see
  // it — so each test below was verified to FAIL pre-change. A "two digest rows sharing nothing
  // => 0" assertion was deliberately REJECTED: it passes both before and after, proving nothing.
  function digestRow(ledgerIds, acknowledged) {
    return {
      id: 'd-' + Math.random().toString(36).slice(2),
      payload: { kind: DIGEST_KIND, ledger_ids: ledgerIds, items: ledgerIds.map((id) => ({ ledger_id: id })) },
      acknowledged_at: acknowledged ? new Date().toISOString() : null,
    };
  }

  it('FR-4: a ledger id in TWO unacked DIGEST rows counts as drift (RED against the pre-change singular read)', () => {
    const rows = [digestRow(['l1', 'l2'], false), digestRow(['l1', 'l3'], false)];
    expect(computeResurfaceDedupDrift(rows)).toBe(1); // only l1 is doubled
  });

  it('FR-4: a MIXED legacy + digest pair sharing one ledger id counts as drift (the real 30-day window state)', () => {
    const rows = [resurfaceRow('l1', false), digestRow(['l1', 'l2'], false)];
    expect(computeResurfaceDedupDrift(rows)).toBe(1);
  });

  it('FR-4 AC-3: an id repeated WITHIN one digest row contributes at most 1, so it is not drift', () => {
    // Guards the naive post-change implementation: flattening ledger_ids without a per-row Set
    // would report a false-positive drift of 1 from a single row.
    const rows = [digestRow(['l1', 'l1', 'l1'], false)];
    expect(computeResurfaceDedupDrift(rows)).toBe(0);
  });

  it('FR-4: an acknowledged digest row is excluded from drift, exactly as an acknowledged legacy row is', () => {
    const rows = [digestRow(['l1'], true), digestRow(['l1'], false)];
    expect(computeResurfaceDedupDrift(rows)).toBe(0);
  });

  it('FR-4: falls back to items[].ledger_id when ledger_ids[] is absent', () => {
    const rowA = { id: 'a', payload: { kind: DIGEST_KIND, items: [{ ledger_id: 'l1' }] }, acknowledged_at: null };
    const rowB = { id: 'b', payload: { kind: DIGEST_KIND, items: [{ ledger_id: 'l1' }] }, acknowledged_at: null };
    expect(computeResurfaceDedupDrift([rowA, rowB])).toBe(1);
  });

  it('FR-4: legacy singular rows still behave identically (no regression)', () => {
    expect(computeResurfaceDedupDrift([resurfaceRow('l1', false), resurfaceRow('l1', false)])).toBe(1);
    expect(computeResurfaceDedupDrift([resurfaceRow('l1', false), resurfaceRow('l2', false)])).toBe(0);
  });

  // FR-4 AC-1. The gauge's kind filter is applied SERVER-SIDE and this module is fail-open, so
  // dropping the legacy kind here would silently stop counting the legacy rows that populate the
  // 30-day window during cutover -- with no test failure and no observable symptom. Pinning the
  // array contents is the only thing that kills that mutant.
  it('FR-4 AC-1: RESURFACE_KINDS spans BOTH the legacy and the digest kind', () => {
    expect(RESURFACE_KINDS).toContain(RESURFACE_KIND);
    expect(RESURFACE_KINDS).toContain(DIGEST_KIND);
    expect(RESURFACE_KINDS).toHaveLength(2);
  });

  // GAP-1: DIGEST_KIND is a duplicated string literal in the PRODUCER
  // (scripts/solomon-ledger-pending-resurface.cjs) and this CONSUMER. Asserting the constant
  // against itself is tautological -- editing the producer's literal would leave every suite
  // green while the server-side, fail-open filter silently reads drift 0 forever, which is
  // precisely the hazard FR-4 exists to close. This pins the two modules to each other.
  it('GAP-1: the producer and the gauge agree on the digest kind string (cross-module pin)', () => {
    const producer = require('../../../scripts/solomon-ledger-pending-resurface.cjs');
    expect(DIGEST_KIND).toBe(producer.DIGEST_KIND);
    expect(RESURFACE_KIND).toBe(producer.RESURFACE_KIND);
    expect(DIGEST_KIND).toBe('solomon_ledger_pending_digest'); // literal, so BOTH sides moving is still caught
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
      from(_table) {
        return {
          select() {
            return {
              gte() {
                return {
                  ...page(windowRows),
                  eq: () => ({ gte: () => page(resurfaceRows) }),
                  in: () => ({ gte: () => page(resurfaceRows) }),
                };
              },
              eq() {
                return { gte: () => page(resurfaceRows) };
              },
              // SD-LEO-INFRA-RESURFACE-DIGEST-BATCHING-001: loadResurfaceRows moved from
              // .eq('payload->>kind', …) to .in(…, RESURFACE_KINDS) so it spans the legacy and
              // digest kinds. Without this stub the builder call THROWS and loadResurfaceRows'
              // catch (:176-178) fail-opens to [] — which reads as drift 0, i.e. exactly the
              // silent false-green this SD exists to prevent. Keeping the stub in lockstep with
              // the real query shape is what makes the assertion below meaningful.
              in() {
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

// SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 (FR-7b) — the six writer shapes this SD fixed,
// with a mandatory RED control (PLAN-phase testing-agent review, 3e0331d8-68ac-4027-a43f-8c795e07d1c):
// an all-zero assertion alone would pass identically before and after the fix and prove nothing.
describe('FR-7(b) fixture — the six fixed machine-writer shapes', () => {
  /** The six now-clean writer shapes, one row each. */
  function cleanFixedShapeRows() {
    return [
      // scripts/assign-fleet-identities.cjs SET_IDENTITY
      cleanRow({
        sender_type: 'coordinator',
        sender_session: 'coord-session-1',
        message_type: 'SET_IDENTITY',
        payload: { kind: 'SET_IDENTITY', color: 'blue', callsign: 'Charlie', display_name: 'Charlie | idle', tier_rank: 4 },
        body: 'The coordinator assigned you callsign "Charlie" with color "blue".',
      }),
      // scripts/worker-signal.cjs
      cleanRow({
        sender_type: 'worker',
        sender_session: 'worker-session-1',
        payload: { kind: 'worker_signal', signal_type: 'stuck', body: 'stuck on gate X' },
        body: 'stuck on gate X',
      }),
      // scripts/stale-session-sweep.cjs signal_resolved
      cleanRow({
        sender_type: 'coordinator',
        sender_session: 'stale-session-sweep',
        payload: { kind: 'signal_resolved', signal_resolved: true },
        body: 'Your earlier signal has been dispositioned by the coordinator.',
      }),
      // scripts/periodic-liveness-watcher.mjs
      cleanRow({
        sender_type: 'periodic-liveness-watcher',
        sender_session: 'periodic-liveness-watcher',
        payload: { kind: 'periodic_liveness_flag', process_key: 'p1', state: 'OVERDUE' },
        body: 'P1 is OVERDUE.',
      }),
      // lib/npm-install-lock.cjs — sender_type='system' is ALREADY exempt via
      // LEGITIMATE_EMPTY_SENDER_TYPES; this row has no sender_session by design.
      cleanRow({
        sender_type: 'system',
        sender_session: null,
        payload: { kind: 'node_modules_lock', lock_type: 'NODE_MODULES', status: 'locked' },
        body: 'Session abcd1234 is running npm install',
      }),
      // scripts/fleet-dashboard.cjs STALE_WARNING
      cleanRow({
        sender_type: 'dashboard',
        sender_session: 'fleet-dashboard',
        message_type: 'STALE_WARNING',
        payload: { kind: 'stale_heartbeat_warning', session_id: 's1', heartbeat_age: 300 },
        body: 'Your session on SD-FOO-001 has not heartbeated in 5m.',
      }),
    ];
  }

  it('GREEN: all six fixed shapes read as zero violations', () => {
    const result = computeRowViolationCounts(cleanFixedShapeRows());
    expect(result).toEqual({ untyped_row: 0, bodyless_row: 0, empty_sender_row: 0 });
  });

  it('RED CONTROL: the same six rows with their stamps stripped are NOT all-zero — proves the assertion above is discriminating, not vacuous', () => {
    const stripped = cleanFixedShapeRows().map((row, i) => {
      const payload = { ...row.payload };
      delete payload.kind;
      // sender_session is stripped on every row EXCEPT the npm-install-lock row (index 4),
      // whose sender_type='system' is exempt regardless — stripping only its kind must show
      // up as untyped_row, never empty_sender_row (the exact distinction TESTING flagged).
      const sender_session = i === 4 ? row.sender_session : null;
      return { ...row, payload, sender_session };
    });
    const result = computeRowViolationCounts(stripped);
    // All six lose their kind -> untyped_row = 6. Five of six (all but npm-install-lock) also
    // lose sender_session with a non-exempt sender_type -> empty_sender_row = 5.
    expect(result.untyped_row).toBe(6);
    expect(result.empty_sender_row).toBe(5);
    expect(result).not.toEqual({ untyped_row: 0, bodyless_row: 0, empty_sender_row: 0 });
  });
});
