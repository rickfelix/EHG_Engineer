// The coordinator drive-report consumer, EXECUTED.
// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
//
// REWRITTEN against the real contract. The previous suite was thorough and entirely wrong: it
// asserted a read-merge-write against drive_reports.consumption_receipts, a jsonb column sibling -B
// DELETED by coordinator ruling two minutes after those tests were last edited. Every assertion
// passed, against a schema that no longer exists. Receipts are now ROWS in drive_report_receipts
// with UNIQUE(report_id, lane), so first-writer-wins is a property of the SCHEMA and the two
// idempotency guards the old suite worked so hard to isolate are gone with the mechanism.
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  runDriveReportConsumeCore,
  resolveActorSessionId,
  isCoordinatorSeat,
  recordOutcome,
  COORDINATOR_LANE,
  FAILURE_BREADCRUMB,
} from '../../../scripts/coordinator-drive-report-consume.mjs';

const silent = { log() {}, error() {} };
const REPORT_ID = 'ffffffff-1111-2222-3333-444444444444';

/** Records what was upserted so assertions are about the PAYLOAD, not the call shape. */
function makeDb({ reports = [{ id: REPORT_ID }], readError = null, writeError = null } = {}) {
  const db = { upserts: [], upsertOpts: [] };
  db.from = (table) => {
    if (table === 'drive_reports') {
      return { select: () => ({ order: () => ({ limit: async () => ({ data: readError ? null : reports, error: readError }) }) }) };
    }
    if (table === 'drive_report_receipts') {
      return {
        upsert: async (payload, opts) => {
          db.upserts.push(payload); db.upsertOpts.push(opts);
          return { data: null, error: writeError };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  };
  return db;
}

const seat = (id) => ({ sessionId: id, coordinatorId: id, logger: silent });

describe('the receipt names the LIVE session, asserted by VALUE IDENTITY', () => {
  it('stamps the exact session id it was given', async () => {
    // A uuid-SHAPE regex is not sufficient — a hard-coded uuid literal passes it, and that is the
    // WORSE defect because it is indistinguishable from a real id at read time. The killing
    // assertion is identity with a value generated here, which cannot exist in the source.
    const id = randomUUID();
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(id));
    expect(db.upserts[0].metadata.actor_session).toBe(id);
  });

  it('a second run carries a DIFFERENT id — kills a memoised or hard-coded actor', async () => {
    const a = randomUUID(); const b = randomUUID();
    const d1 = makeDb(); await runDriveReportConsumeCore(d1, seat(a));
    const d2 = makeDb(); await runDriveReportConsumeCore(d2, seat(b));
    expect(d1.upserts[0].metadata.actor_session).toBe(a);
    expect(d2.upserts[0].metadata.actor_session).toBe(b);
    expect(d1.upserts[0].metadata.actor_session).not.toBe(d2.upserts[0].metadata.actor_session);
  });
});

describe('the lane key', () => {
  it('is the UNDERSCORE vocabulary the producer CHECK constraint enforces', async () => {
    // -B's SQL is CHECK (lane IN ('coordinator','adam','chairman_brief')). The first version of
    // this SD wrote 'chairman-brief' with a hyphen — which would have INSERTED CLEANLY and
    // satisfied UNIQUE(report_id, lane) SEPARATELY from the real lane, leaving a receipt nobody
    // reads while the real lane still looked unconsumed.
    expect(COORDINATOR_LANE).toBe('coordinator');
    expect(COORDINATOR_LANE).not.toContain('-');
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.upserts[0].lane).toBe('coordinator');
  });
});

describe('the write is a single native upsert — first-writer-wins comes from the SCHEMA', () => {
  it('targets the unique constraint and does NOT rewrite an existing receipt', async () => {
    // ignoreDuplicates preserves the ORIGINAL consumed_at. The whole value of the receipt is WHEN
    // the lane first saw the report, so a re-run that refreshed the timestamp would destroy the
    // only fact it records.
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.upsertOpts[0]).toEqual({ onConflict: 'report_id,lane', ignoreDuplicates: true });
  });

  it('writes exactly one row, for the newest report, and touches no sibling lane', async () => {
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].report_id).toBe(REPORT_ID);
    // No sibling lane is even reachable from this statement — that is the point of the row shape.
    expect(Object.keys(db.upserts[0]).sort()).toEqual(['consumed_at', 'lane', 'metadata', 'report_id']);
  });
});

describe('the coordinator-seat check — the premise that it was unnecessary was FALSE', () => {
  it('writes nothing when the executing seat is not the coordinator', async () => {
    // A security review ran the previous version from a WORKER seat and with a FORGED session id:
    // exit 0, no complaint. Because the first receipt for a lane wins, one incidental run
    // permanently makes a starving binding read as fed.
    const db = makeDb();
    const out = await runDriveReportConsumeCore(db, { sessionId: randomUUID(), coordinatorId: randomUUID(), logger: silent });
    expect(db.upserts).toHaveLength(0);
    expect(out.reason).toBe('not_coordinator_seat');
  });

  it('FAILS CLOSED when the coordinator cannot be resolved', async () => {
    const db = makeDb();
    await runDriveReportConsumeCore(db, { sessionId: randomUUID(), coordinatorId: null, logger: silent });
    expect(db.upserts).toHaveLength(0);
  });

  it('the predicate discriminates in both directions', () => {
    const id = randomUUID();
    expect(isCoordinatorSeat(id, id)).toBe(true);              // and the positive arm, so a
    expect(isCoordinatorSeat(id, randomUUID())).toBe(false);   // constant-false cannot pass
    expect(isCoordinatorSeat(null, null)).toBe(false);
  });
});

describe('identity precedence: the EXECUTING seat beats the BELIEVED seat', () => {
  it('prefers CLAUDE_SESSION_ID when the two disagree', async () => {
    const executing = randomUUID(); const believed = randomUUID();
    expect(await resolveActorSessionId({ env: { CLAUDE_SESSION_ID: executing }, resolveCoordinatorId: async () => believed })).toBe(executing);
  });
  it('falls back to the resolver when the env var is absent — both arms', async () => {
    const believed = randomUUID();
    expect(await resolveActorSessionId({ env: {}, resolveCoordinatorId: async () => believed })).toBe(believed);
  });
  it('returns null rather than throwing when neither is available', async () => {
    expect(await resolveActorSessionId({ env: {}, resolveCoordinatorId: async () => { throw new Error('down'); } })).toBe(null);
  });
});

describe('failures are SURFACED, not swallowed — the defect that sank the first version', () => {
  it('a read failure reports status failed rather than a quiet no-op', async () => {
    // The previous version logged a no-op and returned success on a missing column, so the tick
    // would have printed drive-report-consume:ok forever having written nothing.
    const db = makeDb({ readError: { message: 'column drive_reports.consumption_receipts does not exist' } });
    const out = await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(out.status).toBe('failed');
    expect(out.reason).toMatch(/read:/);
  });

  it('a write failure reports status failed and names the report', async () => {
    const db = makeDb({ writeError: { message: 'permission denied' } });
    const out = await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(out.status).toBe('failed');
    expect(out.reportId).toBe(REPORT_ID);
  });

  it('an absent report is NOT a failure — it is nothing to consume', async () => {
    // Both arms matter: a version that called everything a failure would pass the two tests above.
    const db = makeDb({ reports: [] });
    expect((await runDriveReportConsumeCore(db, seat(randomUUID()))).status).toBe('nothing_to_consume');
  });

  it('a client that throws degrades to failed rather than escaping', async () => {
    const db = { from: () => { throw new Error('connection refused'); } };
    const out = await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(out.status).toBe('failed');
  });
});

describe('the failure breadcrumb is the channel the host does not give us', () => {
  // runCoresFailSoft records key:status and DROPS detail, and the core must exit 0 or the host
  // reports a failed tick it cannot explain. Without this file a genuine write failure would be
  // completely unobservable.
  const files = new Map();
  const fakeFs = {
    mkdirSync() {},
    writeFileSync(p, c) { files.set(p, c); },
    existsSync(p) { return files.has(p); },
    rmSync(p) { files.delete(p); },
  };

  it('writes on failure and CLEARS on the next success — a stale breadcrumb cannot accumulate', () => {
    files.clear();
    expect(recordOutcome({ status: 'failed', reason: 'write: boom' }, { root: '/r', fsImpl: fakeFs })).toBe('written');
    expect([...files.keys()][0]).toContain(FAILURE_BREADCRUMB.replace(/\\/g, '/').split('/').pop());
    expect(recordOutcome({ status: 'ok' }, { root: '/r', fsImpl: fakeFs })).toBe('cleared');
    expect(files.size).toBe(0);
  });

  it('never throws, even when the filesystem refuses', () => {
    const hostileFs = { mkdirSync() { throw new Error('readonly'); }, writeFileSync() { throw new Error('readonly'); }, existsSync() { return false; }, rmSync() {} };
    expect(() => recordOutcome({ status: 'failed' }, { root: '/r', fsImpl: hostileFs })).not.toThrow();
  });
});

describe('registry pairing', () => {
  it('is registered in COMPOSED_CORES and NOT quiescent-skipped', async () => {
    const { COMPOSED_CORES } = await import('../../../scripts/coordinator-quiet-tick.mjs');
    const entry = COMPOSED_CORES.find((c) => c.key === 'drive-report-consume');
    expect(entry).toBeDefined();
    // quiescentSkip:true would reproduce this SD's own target defect — silent during exactly the
    // quiet period when a starving binding is most likely to go unnoticed.
    expect(entry.quiescentSkip).toBe(false);
  });
});
