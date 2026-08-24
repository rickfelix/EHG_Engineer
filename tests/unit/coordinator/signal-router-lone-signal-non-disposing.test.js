/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-4) — signal-router.cjs's lone-signal path.
 *
 * TESTING's PLAN-TO-EXEC review (fd168314) confirmed loadRecentSignals's select omitted
 * acknowledged_at, making stampRoutedToCoordinator's idempotency guard unconditionally
 * unreachable (re-stamping every tick) and degrading ackAndRouteLoneSignal's unacked-filter to
 * routed_to_coordinator-only. Both are fixed here by (a) adding acknowledged_at to the select and
 * (b) making stampRoutedToCoordinator non-disposing (mirrors stampRouted's already-fixed shape),
 * which makes acknowledged_at irrelevant to ITS OWN idempotency rather than merely present.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { ackAndRouteLoneSignal } = require_('../../../lib/coordinator/signal-router.cjs');

/** Records every select/update call so the test can assert on the ACTUAL query, not just output. */
function fakeClient(rows) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const updates = [];
  let capturedSelect = null;
  return {
    updates,
    getRow: (id) => store.get(id),
    from(table) {
      if (table !== 'session_coordination') throw new Error(`unexpected table ${table}`);
      return {
        select(cols) { capturedSelect = cols; return this; },
        gte() { return this; },
        not() { return this; },
        order() { return this; },
        // fetchAllPaginated (lib/db/fetch-all-paginated.mjs) calls queryFactory().range(from, to)
        // directly -- it does not settle at .order() the way some other fakes in this repo do.
        async range() { return { data: [...store.values()], error: null }; },
        update(patch) {
          return { eq: async (col, val) => { updates.push({ id: val, patch }); Object.assign(store.get(val), patch); return { error: null }; } };
        },
      };
    },
    getCapturedSelect: () => capturedSelect,
  };
}

const now = new Date().toISOString();
const loneSignal = (id, overrides = {}) => ({
  id,
  sender_session: 'sess-1',
  target_session: 'coord-1',
  payload: { signal_type: 'feedback', severity: 'high', sender_callsign: 'Golf-4' },
  body: 'a high-severity lone signal',
  created_at: now,
  acknowledged_at: null,
  ...overrides,
});

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-4: stampRoutedToCoordinator is now NON-DISPOSING', () => {
  it('marks routed_to_coordinator but NEVER writes acknowledged_at (mirrors stampRouted, avoids the 9-critical-signal-vanish regression)', async () => {
    const c = fakeClient([loneSignal('sig-1')]);
    await ackAndRouteLoneSignal(c);
    expect(c.getRow('sig-1').payload.routed_to_coordinator).toBe(true);
    // THE regression test for the VALIDATION HIGH finding: an automated route-to-coordinator
    // action must never itself close the row -- only a human via coordinator-ack-signal.cjs may.
    expect(c.updates.every((u) => u.patch.acknowledged_at === undefined)).toBe(true);
  });

  it('is idempotent keyed PURELY on routed_to_coordinator, independent of acknowledged_at', async () => {
    const alreadyRouted = loneSignal('sig-1', { payload: { signal_type: 'feedback', severity: 'high', sender_callsign: 'Golf-4', routed_to_coordinator: true } });
    const c = fakeClient([alreadyRouted]);
    const result = await ackAndRouteLoneSignal(c);
    // Already routed and still unacknowledged -> the unacked filter finds it (acknowledged_at is
    // null), but stampRoutedToCoordinator's OWN idempotency check must still skip the write.
    expect(c.updates).toHaveLength(0);
    expect(result.routed).toBe(0); // no NEW group routed (all rows in the group already routed)
  });

  it('excludes a signal that ALREADY has an FR-1 canonical disposition (acknowledged_at set) — a human already handled it', async () => {
    const dispositioned = loneSignal('sig-1', { acknowledged_at: '2026-08-24T10:00:00Z' });
    const c = fakeClient([dispositioned]);
    await ackAndRouteLoneSignal(c);
    // Confirms loadRecentSignals' fixed select (now includes acknowledged_at) actually reaches
    // this filter -- against the OLD, unfixed select this row would read as unacked and be
    // re-routed pointlessly.
    expect(c.updates).toHaveLength(0);
  });

  it("loadRecentSignals' select includes acknowledged_at (the fixture-blind bug's root cause)", async () => {
    const c = fakeClient([loneSignal('sig-1')]);
    await ackAndRouteLoneSignal(c);
    expect(c.getCapturedSelect()).toContain('acknowledged_at');
    // MUTATION: drop acknowledged_at from the select string -> this fails directly, rather than
    // only failing indirectly through a behavior that happened to be observable elsewhere.
  });
});
