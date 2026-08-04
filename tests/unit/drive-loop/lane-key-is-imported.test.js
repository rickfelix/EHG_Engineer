// FR-1/FR-2 — the lane key is IMPORTED from the shared contract, not inlined.
// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
//
// WHY THIS NEEDS ITS OWN FILE AND A MODULE SUBSTITUTION.
// The mutant worth killing is "someone writes 'coordinator' inline instead of importing
// DRIVE_REPORT_LANES.COORDINATOR". That mutant CANNOT be killed by asserting the receipt key,
// because the literal and the constant hold the SAME VALUE — an expectation that coincides with the
// implementation's own value can never detect a hard-coded constant. It also cannot be killed by a
// source-text grep, which proves the characters are present, not that they are what runs.
//
// The only assertion that discriminates is: SUBSTITUTE the constants module with a sentinel value
// and prove the substitution reaches the receipt. An inlined literal ignores the substitution.
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const SENTINEL_LANE = 'sentinel-lane-not-a-real-key';

vi.mock('../../../lib/drive-loop/lanes.cjs', () => ({
  default: {
    DRIVE_REPORT_LANES: { COORDINATOR: SENTINEL_LANE, ADAM: 'adam', CHAIRMAN_BRIEF: 'chairman-brief' },
    ALL_DRIVE_REPORT_LANES: [SENTINEL_LANE, 'adam', 'chairman-brief'],
  },
}));

const { runDriveReportConsumeCore } = await import('../../../scripts/coordinator-drive-report-consume.mjs');

function makeDb(rows) {
  const store = JSON.parse(JSON.stringify(rows));
  return {
    rows: store,
    from() {
      const q = {
        _payload: null, _id: null,
        select() { return q; },
        order() { return q; },
        limit() { return Promise.resolve({ data: store.slice(0, 1), error: null }); },
        update(p) { q._payload = p; return q; },
        eq(_c, v) { q._id = v; return q; },
        is() { return q; },
        then(resolve) {
          const row = store.find((r) => r.id === q._id);
          if (!row) return resolve({ data: [], error: null });
          Object.assign(row, q._payload);
          return resolve({ data: [{ id: row.id }], error: null });
        },
      };
      return q;
    },
  };
}

describe('the coordinator lane key comes from the shared module, not a literal', () => {
  it('stamps under the SUBSTITUTED lane key — an inlined literal would ignore the substitution', async () => {
    const db = makeDb([{ id: 'r-1', consumption_receipts: {}, generated_at: '2026-08-04T00:00:00Z' }]);
    await runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: { log() {}, error() {} } });

    const receipts = db.rows[0].consumption_receipts;
    expect(Object.keys(receipts)).toEqual([SENTINEL_LANE]);
    // Both arms: the sentinel is present AND the real key is absent. Asserting only the sentinel
    // would pass an implementation that wrote BOTH.
    expect(receipts.coordinator).toBeUndefined();
  });
});
