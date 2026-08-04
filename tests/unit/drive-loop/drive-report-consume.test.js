// FR-2..FR-5 — the coordinator drive-report consumer, EXECUTED.
// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
//
// The double below is STATE-BEARING on purpose. A stub that returns a fixed `{data: []}` cannot
// kill a dropped-idempotency-guard mutant: it returns the same thing whether or not the predicate
// is present. Only a fake that actually stores the row and evaluates the predicate can tell a
// guarded write from an unguarded one.
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  runDriveReportConsumeCore,
  resolveActorSessionId,
} from '../../../scripts/coordinator-drive-report-consume.mjs';

/** Minimal state-bearing drive_reports double: stores rows, evaluates the .is() predicate itself. */
function makeDb(initialRows) {
  const rows = JSON.parse(JSON.stringify(initialRows));
  const db = {
    rows,
    from(table) {
      if (table !== 'drive_reports') throw new Error(`unexpected table ${table}`);
      const q = {
        _mode: null, _payload: null, _id: null, _laneMustBeNull: null,
        select() { return q; },
        order() { return q; },
        limit() { return Promise.resolve({ data: rows.slice(0, 1), error: null }); },
        update(payload) { q._mode = 'update'; q._payload = payload; return q; },
        eq(col, val) { q._id = val; return q; },
        is(path, val) {
          // path looks like consumption_receipts->coordinator
          q._laneMustBeNull = val === null ? String(path).split('->')[1] : null;
          return q;
        },
        then(resolve) {
          // terminal .select('id') after update resolves here
          const row = rows.find((r) => r.id === q._id);
          if (!row) return resolve({ data: [], error: null });
          if (q._laneMustBeNull && row.consumption_receipts && row.consumption_receipts[q._laneMustBeNull]) {
            return resolve({ data: [], error: null }); // predicate no longer matches — concurrent write
          }
          Object.assign(row, q._payload);
          return resolve({ data: [{ id: row.id }], error: null });
        },
      };
      // .select('id') at the end of the update chain must be thenable, not restart a read
      q.select = (cols) => (cols === 'id' ? q : q);
      return q;
    },
  };
  return db;
}

const silent = { log() {}, error() {} };
const REPORT_ID = 'r-1';
const baseRow = (receipts = {}) => [{ id: REPORT_ID, consumption_receipts: receipts, generated_at: '2026-08-04T00:00:00Z' }];

describe('FR-3 — the receipt carries the LIVE session, asserted by VALUE IDENTITY', () => {
  it('stamps the exact session id it was given', async () => {
    // A uuid-SHAPE regex is NOT sufficient: a hard-coded uuid literal would pass it. The killing
    // assertion is identity with a value generated in this test, which cannot exist in the source.
    const sessionId = randomUUID();
    const db = makeDb(baseRow());
    await runDriveReportConsumeCore(db, { sessionId, logger: silent });
    expect(db.rows[0].consumption_receipts.coordinator.actor).toBe(sessionId);
  });

  it('stamps a DIFFERENT id on a different run — kills a memoised or hard-coded actor', async () => {
    // This is the arm that kills a hard-coded uuid LITERAL, which survives any shape check.
    const a = randomUUID(); const b = randomUUID();
    const db1 = makeDb(baseRow()); await runDriveReportConsumeCore(db1, { sessionId: a, logger: silent });
    const db2 = makeDb(baseRow()); await runDriveReportConsumeCore(db2, { sessionId: b, logger: silent });
    const got1 = db1.rows[0].consumption_receipts.coordinator.actor;
    const got2 = db2.rows[0].consumption_receipts.coordinator.actor;
    expect(got1).toBe(a);
    expect(got2).toBe(b);
    expect(got1).not.toBe(got2);
  });

  it('never stamps a module-name literal', async () => {
    const sessionId = randomUUID();
    const db = makeDb(baseRow());
    await runDriveReportConsumeCore(db, { sessionId, logger: silent });
    const actor = db.rows[0].consumption_receipts.coordinator.actor;
    expect(actor).not.toMatch(/consumer|drive-report|coordinator-drive/i);
  });
});

describe('FR-3 — precedence: the EXECUTING seat beats the BELIEVED seat', () => {
  it('prefers CLAUDE_SESSION_ID over the resolved coordinator id when they disagree', async () => {
    const executing = randomUUID(); const believed = randomUUID();
    const got = await resolveActorSessionId({
      env: { CLAUDE_SESSION_ID: executing },
      resolveCoordinatorId: async () => believed,
    });
    expect(got).toBe(executing);
  });

  it('falls back to the resolver when the env var is absent — both arms', async () => {
    // Without this arm, an implementation that ignored the resolver entirely would still pass the
    // precedence test above.
    const believed = randomUUID();
    expect(await resolveActorSessionId({ env: {}, resolveCoordinatorId: async () => believed })).toBe(believed);
  });

  it('returns null rather than throwing when neither is available', async () => {
    expect(await resolveActorSessionId({ env: {}, resolveCoordinatorId: async () => { throw new Error('down'); } })).toBe(null);
  });
});

describe('FR-4 — read-merge-write PRESERVES sibling lanes', () => {
  it('does not destroy an existing adam lane', async () => {
    // THE CRITICAL ASSERTION. PostgREST cannot express jsonb_set, so updating this column replaces
    // it WHOLE — a naive `{ [lane]: … }` write silently deletes every other consumer's receipt.
    // -C is the first writer, so this only bites once -D lands; the test is what makes it not bite.
    const adam = { actor: 'adam-session', at: '2026-08-03T00:00:00Z' };
    const db = makeDb(baseRow({ adam }));
    await runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: silent });
    expect(db.rows[0].consumption_receipts.adam).toEqual(adam);
    expect(db.rows[0].consumption_receipts.coordinator).toBeTruthy();
  });
});

describe('FR-4 — idempotency', () => {
  it('does not re-stamp an already-consumed lane', async () => {
    const db = makeDb(baseRow());
    await runDriveReportConsumeCore(db, { sessionId: randomUUID(), nowMs: 1_000_000, logger: silent });
    const first = db.rows[0].consumption_receipts.coordinator.at;
    await runDriveReportConsumeCore(db, { sessionId: randomUUID(), nowMs: 9_000_000, logger: silent });
    expect(db.rows[0].consumption_receipts.coordinator.at).toBe(first);
  });

  it('leaves a concurrent writer\'s receipt alone rather than clobbering it with a stale merge', async () => {
    // The .is() predicate is what makes read-merge-write safe. Simulate the row being stamped
    // between our read and our write.
    const db = makeDb(baseRow());
    const original = db.from;
    let reads = 0;
    db.from = function (t) {
      const q = original.call(db, t);
      const origLimit = q.limit;
      q.limit = function () {
        reads++;
        if (reads === 1) db.rows[0].consumption_receipts = { coordinator: { actor: 'someone-else', at: 'T0' } };
        return origLimit.call(q);
      };
      return q;
    };
    await runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: silent });
    expect(db.rows[0].consumption_receipts.coordinator.actor).toBe('someone-else');
  });
});

describe('FR-5 — fail-soft, and FR-4 return discipline', () => {
  it('returns falsy on the success path', async () => {
    const db = makeDb(baseRow());
    expect(await runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: silent })).toBeFalsy();
  });

  it('no-ops without throwing when the table is absent (the producer has not landed)', async () => {
    const db = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'relation "drive_reports" does not exist' } }) }) }) }) };
    await expect(runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: silent })).resolves.toBeFalsy();
  });

  it('no-ops without throwing when the client itself blows up', async () => {
    const db = { from: () => { throw new Error('connection refused'); } };
    await expect(runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: silent })).resolves.toBeFalsy();
  });

  it('no-ops when no actor could be resolved — it must not stamp a placeholder', async () => {
    const db = makeDb(baseRow());
    await runDriveReportConsumeCore(db, { sessionId: null, logger: silent });
    expect(db.rows[0].consumption_receipts.coordinator).toBeUndefined();
  });

  it('no-ops when there is no report yet', async () => {
    const db = makeDb([]);
    await expect(runDriveReportConsumeCore(db, { sessionId: randomUUID(), logger: silent })).resolves.toBeFalsy();
  });
});

describe('FR-2 — no coordinator predicate, and the registry pairing', () => {
  it('is registered in COMPOSED_CORES and NOT quiescent-skipped', async () => {
    const { COMPOSED_CORES } = await import('../../../scripts/coordinator-quiet-tick.mjs');
    const entry = COMPOSED_CORES.find((c) => c.key === 'drive-report-consume');
    expect(entry).toBeDefined();
    // quiescentSkip:true would reproduce this SD's own target defect — an unconsumed report during
    // exactly the quiet period when a starving binding is most likely to go unnoticed.
    expect(entry.quiescentSkip).toBe(false);
  });
});
