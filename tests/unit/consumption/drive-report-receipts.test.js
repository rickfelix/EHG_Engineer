// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-2, FR-4) — consumption receipts.
//
// THE SCENARIO THIS SUITE IS BUILT AROUND IS TS-6, THE SWALLOW TEST: force a receipt write to be
// REFUSED and assert the consumer REPORTS it as failed. Not "logs something somewhere" — reports a
// verdict a caller cannot mistake for success.
//
// WHY THAT IS THE ONE THAT MATTERS. The CHECK constraint makes a wrong lane key loud AT THE
// DATABASE, but a fail-soft consumer catches the rejection, logs a no-op, exits 0, and its runner
// records ok. Loud at the database, SILENT AT THE OBSERVER. The lane then reads as "never
// consumed", which is indistinguishable from the producer never having published — and making
// consumption observable is the entire point of this SD.
//
// NOT INTEGRATION-VERIFIED, STATED PLAINLY: the migration is chairman-gated and unapplied, so
// drive_report_receipts does not exist live. These are stub-driven unit tests. Nothing here should
// be read as evidence about production behaviour, and in particular NOTHING here says anything
// about RLS — an anon probe against an absent table returns absence, not denial.

import { describe, it, expect } from 'vitest';
import { writeConsumptionReceipt, describeReceiptOutcome, RECEIPT_OUTCOME } from '../../../lib/consumption/drive-report-receipts.js';
import { DRIVE_REPORT_LANES } from '../../../lib/drive-loop/lanes.js';

const REPORT = '11111111-2222-3333-4444-555555555555';

/** Records what reached the client so the assertions can be about the CALL, not just the verdict. */
function stubClient({ error = null, row = { id: 'receipt-1' }, onCall } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const b = {
        upsert(payload, opts) { calls.push({ table, payload, opts }); if (onCall) onCall(); return b; },
        select() { return b; },
        async maybeSingle() { return { data: error ? null : row, error }; },
      };
      return b;
    },
  };
  return client;
}

describe('FR-2/FR-4 — a receipt is written for a valid lane', () => {
  it('writes and reports written, for every lane this leg may use', async () => {
    for (const lane of ['adam', 'chairman_brief']) {
      const c = stubClient();
      const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane });
      expect(v.written).toBe(true);
      expect(v.reason).toBe(RECEIPT_OUTCOME.WRITTEN);
      expect(v.lane).toBe(lane);
    }
  });

  it('upserts ON CONFLICT (report_id, lane) — no read-merge-write, no clobber window', async () => {
    const c = stubClient();
    await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'adam' });
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].table).toBe('drive_report_receipts');
    expect(c.calls[0].opts).toEqual({ onConflict: 'report_id,lane' });
    // The payload names ONE lane. A sibling lane is not reachable from this write.
    expect(c.calls[0].payload).toMatchObject({ report_id: REPORT, lane: 'adam' });
    expect(Object.keys(c.calls[0].payload)).not.toContain('consumption_receipts');
  });
});

describe('a write with nothing returned is UNCONFIRMED, never written', () => {
  // The one shape that produces {data: null, error: null}: an RLS posture permitting the INSERT
  // while denying the returning SELECT. Unreachable under the shipped DDL (service_role FOR ALL),
  // but "no error came back" is not the same evidence as "the row is there", and this module's
  // invariant does not bend for how unlikely the path is. Found by the SECURITY sub-agent.
  it('reports not-written when the upsert returns no row and no error', async () => {
    const c = stubClient({ row: null });
    const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'adam' });
    expect(v.written).toBe(false);
    expect(v.reason).toBe(RECEIPT_OUTCOME.UNCONFIRMED);
    // A distinct reason, not folded into write_refused: the write may well have landed. Collapsing
    // the two would tell whoever reads this verdict the wrong thing about what to do next.
    expect(v.reason).not.toBe(RECEIPT_OUTCOME.WRITE_REFUSED);
    expect(describeReceiptOutcome(v)).toMatch(/NOT WRITTEN/);
  });
});

describe('an ABORTED write is unconfirmed, not refused', () => {
  // MEASURED by the SECURITY sub-agent on the live shape: with the deadline at 2s and the server
  // 1.9s slow, the POST REACHES THE SERVER. The row may be there. "write_refused" would assert the
  // database said no, which nobody observed — a different lie from the one this module was built to
  // prevent, pointing the same way.
  for (const thrown of [
    Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    new Error('AbortError: signal is aborted without reason'), // supabase-js sometimes plain-Errors it
  ]) {
    it(`reports unconfirmed for ${thrown.name}`, async () => {
      const c = stubClient({ onCall: () => { throw thrown; } });
      const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'adam' });
      expect(v.written).toBe(false);
      expect(v.reason).toBe(RECEIPT_OUTCOME.UNCONFIRMED);
      expect(v.reason).not.toBe(RECEIPT_OUTCOME.WRITE_REFUSED);
    });
  }

  it('a NON-abort throw is still a refusal — the distinction must not swallow real failures', async () => {
    const c = stubClient({ onCall: () => { throw new Error('relation "drive_report_receipts" does not exist'); } });
    const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'adam' });
    expect(v.reason).toBe(RECEIPT_OUTCOME.WRITE_REFUSED);
  });

  it('passes an abort signal through when the client supports one, and works when it does not', async () => {
    const seen = [];
    const withAbort = {
      from() {
        const b = {
          upsert() { return b; },
          select() { return b; },
          abortSignal(s) { seen.push(s); return b; },
          async maybeSingle() { return { data: { id: 'receipt-1' }, error: null }; },
        };
        return b;
      },
    };
    const ctl = new AbortController();
    expect((await writeConsumptionReceipt(withAbort, { reportId: REPORT, lane: 'adam', signal: ctl.signal })).written).toBe(true);
    expect(seen).toEqual([ctl.signal]);
    // Feature-detected: the stub clients here have no abortSignal, and passing one must not break
    // them — otherwise this module could only be tested against a live PostgREST.
    expect((await writeConsumptionReceipt(stubClient(), { reportId: REPORT, lane: 'adam', signal: ctl.signal })).written).toBe(true);
  });
});

describe('TS-6 — THE SWALLOW TEST: a refused write is never reportable as written', () => {
  it('a database refusal reports NOT WRITTEN and surfaces the cause', async () => {
    const c = stubClient({ error: { message: 'new row violates check constraint "drive_report_receipts_lane_check"' } });
    const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'adam' });
    expect(v.written).toBe(false);
    expect(v.reason).toBe(RECEIPT_OUTCOME.WRITE_REFUSED);
    expect(v.error).toMatch(/check constraint/);
  });

  it('a THROWN error is still a refusal, not a success and not an exception for the caller', async () => {
    // The table does not exist live today, so this is the CURRENT real-world path.
    const c = stubClient({ onCall: () => { throw new Error('relation "public.drive_report_receipts" does not exist'); } });
    const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'adam' });
    expect(v.written).toBe(false);
    expect(v.reason).toBe(RECEIPT_OUTCOME.WRITE_REFUSED);
    expect(v.error).toMatch(/does not exist/);
  });

  it('NO input produces a truthy result that a caller could read as success', async () => {
    // The property stated as a property rather than case-by-case: across every failure mode,
    // `written` is false. A caller that checks `written` cannot be fooled by any of them.
    const cases = [
      [stubClient(), { reportId: REPORT, lane: 'chairman-brief' }],   // the hyphen trap
      [stubClient(), { reportId: REPORT, lane: 'coordinator-x' }],
      [stubClient(), { reportId: REPORT, lane: '' }],
      [stubClient(), { reportId: REPORT }],
      [stubClient(), { lane: 'adam' }],
      [null, { reportId: REPORT, lane: 'adam' }],
      [stubClient({ error: { message: 'boom' } }), { reportId: REPORT, lane: 'adam' }],
    ];
    for (const [client, args] of cases) {
      const v = await writeConsumptionReceipt(client, args);
      expect(v.written).toBe(false);
    }
  });

  it('the hyphenated lane is refused BEFORE a round trip, and named as a lane fault', async () => {
    // Every prose message in this SD's coordination thread spelled it "chairman-brief". The only
    // correct spelling is chairman_brief. Refusing locally means the verdict says invalid_lane
    // rather than a generic write_refused, so the cause is legible without reading the DB error.
    const c = stubClient();
    const v = await writeConsumptionReceipt(c, { reportId: REPORT, lane: 'chairman-brief' });
    expect(v.reason).toBe(RECEIPT_OUTCOME.INVALID_LANE);
    expect(c.calls).toHaveLength(0);
  });

  it('distinguishes its failure reasons rather than collapsing them', async () => {
    expect((await writeConsumptionReceipt(stubClient(), { reportId: REPORT, lane: 'nope' })).reason)
      .toBe(RECEIPT_OUTCOME.INVALID_LANE);
    expect((await writeConsumptionReceipt(stubClient(), { lane: 'adam' })).reason)
      .toBe(RECEIPT_OUTCOME.MISSING_REPORT_ID);
    expect((await writeConsumptionReceipt(null, { reportId: REPORT, lane: 'adam' })).reason)
      .toBe(RECEIPT_OUTCOME.NO_CLIENT);
  });
});

describe('describeReceiptOutcome — a fail-open caller has something honest to say', () => {
  it('says NOT WRITTEN loudly on failure and names the lane on both paths', async () => {
    const ok = await writeConsumptionReceipt(stubClient(), { reportId: REPORT, lane: 'adam' });
    expect(describeReceiptOutcome(ok)).toMatch(/written for lane adam/);

    const bad = await writeConsumptionReceipt(stubClient({ error: { message: 'boom' } }), { reportId: REPORT, lane: 'adam' });
    expect(describeReceiptOutcome(bad)).toMatch(/NOT WRITTEN/);
    expect(describeReceiptOutcome(bad)).toMatch(/adam/);
    expect(describeReceiptOutcome(bad)).toMatch(/boom/);
  });

  it('treats a missing verdict as NOT written rather than as nothing to say', async () => {
    // A caller that lost the verdict must not render silence, which reads as success.
    expect(describeReceiptOutcome(undefined)).toMatch(/NOT written/i);
    expect(describeReceiptOutcome(null)).toMatch(/NOT written/i);
  });
});

describe('lane vocabulary — one authority', () => {
  it('accepts exactly the lanes the shared constant declares', async () => {
    for (const lane of DRIVE_REPORT_LANES) {
      const v = await writeConsumptionReceipt(stubClient(), { reportId: REPORT, lane });
      expect(v.written).toBe(true);
    }
    expect(DRIVE_REPORT_LANES).toContain('chairman_brief');
    expect(DRIVE_REPORT_LANES).not.toContain('chairman-brief');
  });
});
