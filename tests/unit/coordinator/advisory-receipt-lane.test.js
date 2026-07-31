/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-1) — the ADVISORY lane of the one receipt contract.
 *
 * *** THE CONTRACT THAT EXISTS TO PREVENT SINGLE-LANE REMEDIES WAS ITSELF SINGLE-LANE. ***
 * receipt-ledger.cjs enumerates four lanes (signal, work_assignment, advisory, resolves_files)
 * precisely so "a remedy scoped to one lane cannot silently leave the others open" — its own words.
 * It shipped with exactly ONE writer (coordinator-ack-signal.cjs). Measured on the live ledger
 * before this change: 4 rows, every one lane='signal'. An advisory answered-rate of zero was
 * indistinguishable from advisories never being actioned, because nothing wrote a receipt either way.
 *
 * These tests drive the REAL stampActioned against a fake client, so they assert behaviour rather
 * than the presence of a call.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { stampActioned, stampActionedGroup } = require_('../../../lib/coordinator/adam-advisory-store.cjs');

/** Minimal PostgREST-shaped fake. Records every insert so we can assert on the receipt. */
function fakeClient({ updateError = null, insertError = null } = {}) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return {
        update() { return { eq: async () => ({ error: updateError }) }; },
        async insert(row) { inserts.push({ table, row }); return { error: insertError }; },
      };
    },
  };
}

const ROW = {
  id: 'adv-1',
  created_at: '2026-07-31T10:00:00Z',
  payload: { kind: 'adam_advisory', action_required: true },
};
const NOW = '2026-07-31T10:05:00Z';

describe('FR-1: retiring an advisory writes an ADVISORY-lane receipt', () => {
  it('writes exactly one receipt, on the advisory lane, disposed/actioned', async () => {
    const c = fakeClient();
    const { error } = await stampActioned(c, ROW, NOW);
    expect(error).toBeNull();

    const receipts = c.inserts.filter((i) => i.table === 'coordination_receipts');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].row).toMatchObject({
      coordination_id: 'adv-1',
      lane: 'advisory',
      state: 'disposed',
      disposition: 'actioned',
      is_retention: false,
    });

    // MUTATION: drop the recordReceipt call -> zero receipts, fails. That was the shipped state.
  });

  it('captures time-to-answer, which cannot be recovered later', async () => {
    // The source row is deleted at created+24h, so source_age_ms is unrecoverable unless captured
    // at the transition. 10:00 -> 10:05 is five minutes.
    const c = fakeClient();
    await stampActioned(c, ROW, NOW);
    const receipt = c.inserts.find((i) => i.table === 'coordination_receipts').row;
    expect(receipt.source_age_ms).toBe(5 * 60 * 1000);

    // MUTATION: stop passing sourceCreatedAt (or drop created_at from fetchAdvisory's select) ->
    // source_age_ms becomes null and this fails. That omission was live in one of the three
    // selects in adam-advisory-store.cjs and would have written a null age with nothing erroring.
  });

  it('a LEDGER failure does not break the retirement — measurement never blocks operation', async () => {
    // The advisory is retired by payload.actioned_at. If the ledger write fails, the retirement
    // must still stand; a lost receipt under-counts answers, which is the safe direction.
    const c = fakeClient({ insertError: { message: 'ledger down' } });
    const { error } = await stampActioned(c, ROW, NOW);
    expect(error).toBeNull();

    // MUTATION: make the receipt failure fatal -> a measurement outage becomes an operational one.
  });

  it('does NOT write a receipt when the stamp itself failed', async () => {
    // A receipt claims a transition happened. If actioned_at never landed, there was no transition,
    // and recording one would inflate the answered-rate — the exact direction this SD exists to stop.
    const c = fakeClient({ updateError: { message: 'update failed' } });
    const { error } = await stampActioned(c, ROW, NOW);
    expect(error).toBeTruthy();
    expect(c.inserts.filter((i) => i.table === 'coordination_receipts')).toHaveLength(0);

    // MUTATION: write the receipt unconditionally -> a failed stamp reports as an answer. Fails.
  });

  it('a multi-part series gets a receipt PER MEMBER, never half a series', async () => {
    // stampActionedGroup routes every member through stampActioned, so the never-retire-half-a-
    // series rule (SD-LEO-FIX-SOLOMON-MULTI-PART-001 FR-3) extends to receipts for free. Asserted
    // rather than assumed, because "for free" is how a lane goes unwired in the first place.
    const c = fakeClient();
    const group = { rows: [{ ...ROW, id: 'p1' }, { ...ROW, id: 'p2' }, { ...ROW, id: 'p3' }] };
    await stampActionedGroup(c, group, NOW);
    const ids = c.inserts.filter((i) => i.table === 'coordination_receipts').map((i) => i.row.coordination_id);
    expect(ids).toEqual(['p1', 'p2', 'p3']);
  });
});
