/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-3) — the backfill must retire the current open signal
 * population WITHOUT corrupting the answered-rate ledger's measurement integrity (VALIDATION HIGH
 * finding, sub_agent_execution_results eb009c8e-0ec1-49ec-bef7-b8cc2ff20d01). Per TESTING's
 * PLAN-TO-EXEC correction (fd168314), this asserts on computeAnsweredRate()'s OUTPUT — the metric
 * that would actually be corrupted — not a hand-rolled raw row count.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { fetchOpenSignalRows, backfillRow, runBackfill, WRITER_IDENTITY } =
  require_('../../../scripts/one-off/signal-lane-backfill-001.mjs');
const { computeAnsweredRate } = require_('../../../lib/coordination/answered-rate.cjs');

/** Reads a plain column or a "payload->>key" JSONB-arrow path off a row. */
function readPath(row, col) {
  const m = /^payload->>(\w+)$/.exec(col);
  if (m) return row.payload ? row.payload[m[1]] : undefined;
  return row[col];
}

/**
 * Fake session_coordination + coordination_receipts store, PostgREST-shaped, that APPLIES its
 * recorded filters at read time rather than hardcoding the expected result. TESTING found the
 * original version of this fake stubbed `.not()`/`.is()` as no-ops and hardcoded `!r.acknowledged_at`
 * directly inside `range()` — so deleting either real filter from fetchOpenSignalRows (e.g. the
 * `.not('payload->>signal_type', 'is', null)` scope, or `.is('acknowledged_at', null)` itself,
 * which is where FR-3's entire idempotency guarantee actually lives) would still pass every test
 * here. This version cannot pass that way.
 */
function fakeClient(rows) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const receipts = [];
  return {
    receipts,
    getRow: (id) => store.get(id),
    from(table) {
      if (table === 'session_coordination') {
        const filters = [];
        const builder = {
          select() { return builder; },
          not(col, op, val) {
            filters.push(val === null && op === 'is'
              ? (row) => readPath(row, col) != null
              : (row) => readPath(row, col) !== val);
            return builder;
          },
          is(col, val) {
            filters.push(val === null
              ? (row) => readPath(row, col) == null
              : (row) => readPath(row, col) === val);
            return builder;
          },
          order() { return builder; },
          async range(from, to) {
            const all = [...store.values()].filter((r) => filters.every((f) => f(r)));
            return { data: all.slice(from, to + 1), error: null };
          },
          update(patch) {
            return { eq: async (col, val) => { Object.assign(store.get(val), patch); return { error: null }; } };
          },
        };
        return builder;
      }
      if (table === 'coordination_receipts') {
        return { async insert(row) { receipts.push(row); return { error: null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const NEVER_TOUCHED = { id: 'sig-1', created_at: '2026-08-20T10:00:00Z', payload: { signal_type: 'harness-bug' }, acknowledged_at: null };
const HAND_STAMPED = { id: 'sig-2', created_at: '2026-08-20T11:00:00Z', payload: { signal_type: 'feedback', disposition: 'informational/liveness — no per-item action owed', actioned_at: '2026-08-23T18:48:15Z' }, acknowledged_at: null };
const ALREADY_CANONICAL = { id: 'sig-3', created_at: '2026-08-20T12:00:00Z', payload: { signal_type: 'harness-bug' }, acknowledged_at: '2026-08-23T09:00:00Z' };

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-3: fetchOpenSignalRows is live-queried, never a frozen list', () => {
  it('only returns rows with acknowledged_at IS NULL, paginated to completion', async () => {
    const c = fakeClient([NEVER_TOUCHED, HAND_STAMPED, ALREADY_CANONICAL]);
    const rows = await fetchOpenSignalRows(c);
    expect(rows.map((r) => r.id).sort()).toEqual(['sig-1', 'sig-2']);
    // MUTATION: hardcode a hand-picked list of IDs -> a row that accrued after this test was
    // written would never be picked up, reintroducing the exact "162 is a frozen snapshot" defect.
  });
});

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-3: backfillRow (TS-4 primary regression test)', () => {
  it('a never-touched row gets acknowledged_at + a retention-flagged receipt, disposition unspecified', async () => {
    const c = fakeClient([NEVER_TOUCHED]);
    const result = await backfillRow(c, NEVER_TOUCHED, { nowIso: '2026-08-24T12:00:00Z' });
    expect(result.ok).toBe(true);
    expect(result.handStamped).toBe(false);
    expect(c.getRow('sig-1').acknowledged_at).toBe('2026-08-24T12:00:00Z');
    const receipt = c.receipts[0];
    expect(receipt.is_retention).toBe(true);
    expect(receipt.disposition).toBeNull();
    expect(receipt.metadata.backfill_reason).toBe('never_touched_prior_to_FR-1');
    expect(receipt.metadata.original_hand_stamped_disposition).toBeNull();
    expect(receipt.metadata.writer_identity).toBe(WRITER_IDENTITY);
  });

  it('an already-hand-stamped row PRESERVES its original disposition text verbatim, not flattened', async () => {
    const c = fakeClient([HAND_STAMPED]);
    const result = await backfillRow(c, HAND_STAMPED, { nowIso: '2026-08-24T12:00:00Z' });
    expect(result.handStamped).toBe(true);
    const receipt = c.receipts[0];
    expect(receipt.metadata.backfill_reason).toBe('hand_stamped_prior_to_FR-1');
    expect(receipt.metadata.original_hand_stamped_disposition).toBe(
      'informational/liveness — no per-item action owed'
    );
    // MUTATION: flatten every backfilled row to disposition:'actioned' (reusing FR-1's writer
    // unmodified) -> this specific text disappears, which is exactly the corruption VALIDATION found.
    expect(receipt.disposition).not.toBe('actioned');
  });

  it('THE PRIMARY REGRESSION TEST: computeAnsweredRate() output is unchanged by a backfill run', async () => {
    // A pre-existing GENUINE answer (is_retention:false) must remain the only thing counted.
    const genuineReceipt = { coordination_id: 'sig-genuine', lane: 'signal', state: 'disposed', is_retention: false, created_at: '2026-08-20T09:00:00Z' };
    const signalsPopulation = [
      { id: 'sig-genuine', created_at: '2026-08-19T09:00:00Z' },
      { id: 'sig-1', created_at: NEVER_TOUCHED.created_at },
      { id: 'sig-2', created_at: HAND_STAMPED.created_at },
    ];
    const before = computeAnsweredRate({ receipts: [genuineReceipt], signals: signalsPopulation });
    expect(before.answered).toBe(1);
    expect(before.total).toBe(3);

    const c = fakeClient([NEVER_TOUCHED, HAND_STAMPED]);
    await runBackfill(c, { nowIso: '2026-08-24T12:00:00Z' });

    // The backfill's own retention-flagged receipts join the SAME ledger the genuine one lives in.
    const allReceiptsAfter = [genuineReceipt, ...c.receipts];
    const after = computeAnsweredRate({ receipts: allReceiptsAfter, signals: signalsPopulation });

    expect(after.answered).toBe(before.answered); // THE regression test: still exactly 1, not 3.
    expect(after.total).toBe(before.total);
    expect(after.rate).toBe(before.rate);
    // MUTATION: write backfill receipts with is_retention:false (or reuse FR-1's writer, which
    // hardcodes it) -> after.answered becomes 3, a ~200% inflation in this fixture's tiny
    // denominator (and the measured ~9% inflation on the real 2,864-row ledger). This is the test
    // that actually observes the VALIDATION HIGH finding, not a raw row count.
  });

  it('IDEMPOTENT: re-running backfill against an already-backfilled fixture is a no-op', async () => {
    const c = fakeClient([NEVER_TOUCHED]);
    await runBackfill(c, { nowIso: '2026-08-24T12:00:00Z' });
    expect(c.receipts).toHaveLength(1);

    const secondRunResults = await runBackfill(c, { nowIso: '2026-08-24T13:00:00Z' });
    expect(secondRunResults).toHaveLength(0); // nothing left open -- fetchOpenSignalRows returns []
    expect(c.receipts).toHaveLength(1); // no duplicate receipt
    expect(c.getRow('sig-1').acknowledged_at).toBe('2026-08-24T12:00:00Z'); // not re-stamped
  });

  it('a row already canonically acknowledged before this backfill exists is untouched', async () => {
    const c = fakeClient([ALREADY_CANONICAL]);
    const rows = await fetchOpenSignalRows(c);
    expect(rows).toHaveLength(0);
  });

  it('--dry-run performs no writes', async () => {
    const c = fakeClient([NEVER_TOUCHED]);
    const result = await backfillRow(c, NEVER_TOUCHED, { dryRun: true });
    expect(result.ok).toBe(true);
    expect(c.getRow('sig-1').acknowledged_at).toBeNull();
    expect(c.receipts).toHaveLength(0);
  });
});
