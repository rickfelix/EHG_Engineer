/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-1) — coordinator-ack-signal.cjs's ackSignal() is the SOLE
 * CANONICAL WRITER of a signal-lane disposition + acknowledged_at together. These tests drive the
 * real ackSignal() against a fake client (per this repo's advisory-receipt-lane.test.js pattern),
 * not a restated assumption of its behavior.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { ackSignal, WRITER_IDENTITY } = require_('../../../scripts/coordinator-ack-signal.cjs');

/** Minimal PostgREST-shaped fake, seeded with one signal row. Records every insert/update. */
function fakeClient({ row, updateError = null, insertError = null } = {}) {
  const inserts = [];
  const updates = [];
  let current = { ...row };
  return {
    inserts,
    updates,
    getCurrent: () => current,
    from(table) {
      if (table === 'session_coordination') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: { ...current }, error: null }; },
          update(patch) {
            return {
              eq: async () => {
                updates.push({ table, patch });
                if (!updateError) current = { ...current, ...patch };
                return { error: updateError };
              },
            };
          },
        };
      }
      if (table === 'coordination_receipts') {
        return { async insert(r) { inserts.push({ table, row: r }); return { error: insertError }; } };
      }
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const ROW = {
  id: 'sig-1',
  sender_session: 'session-abc',
  payload: { signal_type: 'harness-bug', correlation_id: 'corr-1' },
  acknowledged_at: null,
  created_at: '2026-08-24T10:00:00Z',
};

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-1: ackSignal writes acknowledged_at + disposition atomically (TS-1)', () => {
  it('POSITIVE: stamps both acknowledged_at and a canonical disposition with writer identity', async () => {
    const c = fakeClient({ row: ROW });
    const result = await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'actioned', coordinatorSession: 'coord-1' });
    expect(result.ok).toBe(true);
    expect(result.acknowledgedAt).not.toBeNull();

    expect(c.updates).toHaveLength(1);
    expect(c.updates[0].patch.acknowledged_at).toBeTruthy();

    const receipts = c.inserts.filter((i) => i.table === 'coordination_receipts');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].row).toMatchObject({
      coordination_id: 'sig-1',
      lane: 'signal',
      state: 'disposed',
      disposition: 'actioned',
    });
    // The writer-identity stamp is what makes a hand-stamp (which carries no such key) detectable.
    expect(receipts[0].row.metadata.writer_identity).toBe(WRITER_IDENTITY);
    expect(receipts[0].row.metadata.writer_identity).toBe('coordinator-ack-signal.cjs');

    // MUTATION: drop the writer_identity stamp -> the NEGATIVE test below stops being distinguishable
    // from this one, and hand-stamp detection silently stops working.
  });

  it('NEGATIVE: a row with no writer_identity in its receipt metadata is detectable as hand-stamped, not canonical', async () => {
    // Simulates the actual live defect this SD exists to fix: 153 rows carry a hand-written
    // payload.disposition with no writer identity anywhere. A detector checking for
    // metadata.writer_identity === WRITER_IDENTITY must distinguish this from a canonical write.
    const handStampedReceiptMetadata = { signal_type: 'harness-bug', via: 'manual' };
    const isCanonical = handStampedReceiptMetadata.writer_identity === WRITER_IDENTITY;
    expect(isCanonical).toBe(false);

    // Confirm the REAL writer never produces this shape.
    const c = fakeClient({ row: ROW });
    await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'actioned', coordinatorSession: 'coord-1' });
    const canonicalMetadata = c.inserts[0].row.metadata;
    expect(canonicalMetadata.writer_identity === WRITER_IDENTITY).toBe(true);

    // MUTATION: a detector that returns "clean"/"canonical" unconditionally regardless of input
    // would pass both assertions above trivially -- this is why both a positive AND a negative
    // input are asserted against the SAME detector logic, per TESTING's TS-1 negative-arm finding.
  });

  it('IDEMPOTENT: acking an already-acknowledged row is a no-op (no double-write, no error)', async () => {
    const alreadyAcked = { ...ROW, acknowledged_at: '2026-08-24T09:00:00Z' };
    const c = fakeClient({ row: alreadyAcked });
    const result = await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'actioned', coordinatorSession: 'coord-1' });
    expect(result.ok).toBe(true);
    expect(result.alreadyAcked).toBe(true);
    expect(c.updates).toHaveLength(0);
    expect(c.inserts).toHaveLength(0);
  });

  it('REJECTED-WITH-REASON without --reason is rejected BEFORE any DB write', async () => {
    const c = fakeClient({ row: ROW });
    const result = await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'rejected-with-reason', coordinatorSession: 'coord-1' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION');
    expect(c.updates).toHaveLength(0);
    expect(c.inserts).toHaveLength(0);
    // MUTATION: skip the linkage check -> acknowledged_at gets stamped with no reason recorded, fails.
  });

  it('DEFERRED-WITH-TRIGGER with a trigger stamps acknowledged_at (dispositioned, not permanently closed by definition, but retired from the undispositioned list)', async () => {
    const c = fakeClient({ row: ROW });
    const result = await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'deferred-with-trigger', trigger: 'next EOD sweep', coordinatorSession: 'coord-1' });
    expect(result.ok).toBe(true);
    const receipt = c.inserts.find((i) => i.table === 'coordination_receipts').row;
    expect(receipt.disposition).toBe('deferred');
    expect(receipt.metadata.trigger).toBe('next EOD sweep');
  });

  it('a ledger write failure does not block the ack -- measurement outage must never become an operational one', async () => {
    const c = fakeClient({ row: ROW, insertError: { message: 'ledger down' } });
    const result = await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'actioned', coordinatorSession: 'coord-1' });
    expect(result.ok).toBe(true);
    expect(result.receipt.ok).toBe(false);
  });

  it('an update failure surfaces as a DB_ERROR and never writes a receipt for a transition that did not happen', async () => {
    const c = fakeClient({ row: ROW, updateError: { message: 'update failed' } });
    const result = await ackSignal({ supabase: c, signalId: 'sig-1', disposition: 'actioned', coordinatorSession: 'coord-1' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('DB_ERROR');
    expect(c.inserts).toHaveLength(0);
  });
});
