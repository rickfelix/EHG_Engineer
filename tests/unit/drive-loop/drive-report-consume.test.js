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
  main,

  isCoordinatorSeat,
  recordOutcome,
  COORDINATOR_LANE,
  FAILURE_BREADCRUMB,
} from '../../../scripts/coordinator-drive-report-consume.mjs';

const silent = { log() {}, error() {} };
const REPORT_ID = 'ffffffff-1111-2222-3333-444444444444';

/**
 * Records what was upserted AND every query argument.
 *
 * THE FIRST VERSION OF THIS FAKE DISCARDED EVERY ARGUMENT to select/order/limit, and mutation
 * testing showed exactly what that costs: TEN mutants survived, including flipping
 * `ascending: false` to TRUE. That mutant makes the consumer stamp the OLDEST report forever while
 * every test stays green — SILENTLY REPRODUCING THE STARVING-BINDING DEFECT THIS SD EXISTS TO
 * EXPOSE. A fake that throws its arguments away cannot fail on a wrong argument, exactly as a
 * stateless fake cannot fail on a dropped predicate.
 */
function makeDb({ reports = [{ id: REPORT_ID }], readError = null, writeError = null, upsertCount = 1 } = {}) {
  const db = { upserts: [], upsertOpts: [], selects: [], orders: [], limits: [], tables: [], signals: [] };
  db.from = (table) => {
    db.tables.push(table);
    if (table === 'drive_reports') {
      return {
        select: (cols) => { db.selects.push(cols); return {
          order: (col, opts) => { db.orders.push({ col, opts }); return {
            limit: (n) => { db.limits.push(n); return {
              // MODELS abortSignal, so the timeout wiring is assertable. Without it a mutant that
              // drops the signal is invisible and the 2000ms bound stays advisory — the real
              // ceiling then being the host 90s kill, whose SIGTERM is a FALSE FAILED CORE.
              abortSignal: async (sig) => { db.signals.push(sig); return { data: readError ? null : reports, error: readError, count: null }; },
            }; },
          }; },
        }; },
      };
    }
    if (table === 'drive_report_receipts') {
      return {
        upsert: (payload, opts) => {
          db.upserts.push(payload); db.upsertOpts.push(opts);
          return {
            // MODELS `count`, which the real client returns and the previous fake did not. Without
            // it the code cannot distinguish INSERTED from IGNORED, so its success log was false on
            // every tick after the first.
            abortSignal: async (sig) => { db.signals.push(sig); return { data: null, error: writeError, count: writeError ? null : upsertCount }; },
          };
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

describe('it reads the NEWEST report — the assertion whose absence let the worst mutant live', () => {
  it('orders by generated_at DESCENDING and takes exactly one', async () => {
    // `ascending: true` would consume the OLDEST report forever: the newest would never be
    // stamped, the instrument would report a permanently starving binding, and every unit test
    // would stay green. That mutant survived until this assertion existed.
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].col).toBe('generated_at');
    expect(db.orders[0].opts).toEqual({ ascending: false });
    expect(db.limits).toEqual([1]);
  });

  it('attaches a real AbortSignal to BOTH queries, so the timeout is not merely advisory', async () => {
    // Racing a timer settles the FUNCTION but leaves the socket open, keeping the process alive
    // until the host 90s execFile kill — whose SIGTERM produces a non-zero child and therefore a
    // FALSE FAILED CORE. An availability guard that hands the host a false failure is worse than
    // none, so the signal must reach the query itself.
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.signals).toHaveLength(2);
    for (const s of db.signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  it('reads from drive_reports and writes to drive_report_receipts — not the deleted column', async () => {
    // Pins the table names. The previous version of this SD read a jsonb column on drive_reports
    // that no longer exists; nothing in its suite would have noticed the table being wrong.
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.tables).toEqual(['drive_reports', 'drive_report_receipts']);
    expect(db.selects[0]).toBe('id');
  });
});

describe('the write is a single native upsert — first-writer-wins comes from the SCHEMA', () => {
  it('distinguishes INSERTED from ALREADY-PRESENT rather than claiming a write either way', async () => {
    // ON CONFLICT DO NOTHING writes nothing on the second tick, so an unconditional
    // "receipt recorded" log is FALSE on every tick after the first. A log line asserting a write
    // that did not happen is the same class of lie the receipt itself exists to prevent.
    const fresh = makeDb({ upsertCount: 1 });
    expect((await runDriveReportConsumeCore(fresh, seat(randomUUID()))).inserted).toBe(true);
    const already = makeDb({ upsertCount: 0 });
    const out = await runDriveReportConsumeCore(already, seat(randomUUID()));
    expect(out.inserted).toBe(false);
    expect(out.status).toBe('ok');   // already-present is a correct steady state, NOT a failure
  });

  it('requests an exact count, or inserted-vs-ignored is unknowable', async () => {
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.upsertOpts[0].count).toBe('exact');
  });

  it('targets the unique constraint and does NOT rewrite an existing receipt', async () => {
    // ignoreDuplicates preserves the ORIGINAL consumed_at. The whole value of the receipt is WHEN
    // the lane first saw the report, so a re-run that refreshed the timestamp would destroy the
    // only fact it records.
    const db = makeDb();
    await runDriveReportConsumeCore(db, seat(randomUUID()));
    expect(db.upsertOpts[0]).toEqual({ onConflict: 'report_id,lane', ignoreDuplicates: true, count: 'exact' });
  });

  it('stamps consumed_at from the INJECTED clock — the nowMs seam was previously dead', async () => {
    // No test passed nowMs, so the seam existed only for the reader's benefit and mutants that
    // replaced consumed_at with the epoch or null both survived. A fixture instant that appears
    // nowhere in the implementation is what makes this discriminating.
    const db = makeDb();
    await runDriveReportConsumeCore(db, { ...seat(randomUUID()), nowMs: 1767225600000 });
    expect(db.upserts[0].consumed_at).toBe(new Date(1767225600000).toISOString());
    expect(db.upserts[0].consumed_at).toMatch(/^2026-/);   // not the epoch
    expect(db.upserts[0].consumed_at).not.toBeNull();
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

// THE THREE "identity precedence" TESTS WERE DELETED HERE, AND THE DELETION IS THE FINDING.
//
// They exercised resolveActorSessionId, which became DEAD CODE the moment the seat check moved into
// main(). Worse, the middle one — "falls back to the resolver when the env var is absent" —
// ASSERTED THE EXPLOITED VULNERABILITY AS CORRECT BEHAVIOUR. It would have outlived everyone who
// knew why it was wrong, and any future engineer restoring the fallback could have cited it.
//
// A reviewer proved the cost: re-introducing the original hole in main() with a one-token change
// left this suite 32/32 GREEN, and the mutation harness would have reported 14/14 KILLED. The tests
// and the mutant were guarding a fossil while the live path sat open. EVIDENCE THAT ARGUES FOR THE
// WRONG THING IS WORSE THAN NO EVIDENCE.
//
// The behaviour that replaced it — main() reading CLAUDE_SESSION_ID with NO fallback — is covered
// by the seat-check tests above and, for the process-level path, by running the real script.

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

describe('main() env-only seat resolution — the line the exploit turns on', () => {
  // main() previously built its own client and was therefore UNTESTABLE BY CONSTRUCTION, which is
  // how a mutant restoring the fallback (`: null;` -> `: coordinatorId;`) SURVIVED the whole suite.
  // An untestable entry point around a security-relevant decision is where a real vulnerability
  // hides behind a green score. Dependencies are now injectable so the decision is reachable.
  it('REFUSES when CLAUDE_SESSION_ID is absent — no fallback to the resolved coordinator', async () => {
    const db = makeDb();
    const coordinator = randomUUID();
    await main({ supabase: db, env: {}, resolveCoordinatorId: async () => coordinator, logger: silent });
    // The fallback is exactly the exploited hole: with no env var it compared a value to ITSELF.
    expect(db.upserts).toHaveLength(0);
  });

  it('writes when the env var MATCHES the resolved coordinator', async () => {
    // The positive arm, so a constant-refuse implementation cannot pass the test above.
    const db = makeDb();
    const coordinator = randomUUID();
    await main({ supabase: db, env: { CLAUDE_SESSION_ID: coordinator }, resolveCoordinatorId: async () => coordinator, logger: silent });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].metadata.actor_session).toBe(coordinator);
  });

  it('REFUSES when the env var names a different seat', async () => {
    const db = makeDb();
    await main({ supabase: db, env: { CLAUDE_SESSION_ID: randomUUID() }, resolveCoordinatorId: async () => randomUUID(), logger: silent });
    expect(db.upserts).toHaveLength(0);
  });

  it('always resolves to exit code 0, even when the coordinator resolver throws', async () => {
    // Exit code is the only thing the host reads; an observer that reports a failed TICK because it
    // could not observe is worse than useless.
    const db = makeDb();
    const code = await main({ supabase: db, env: {}, resolveCoordinatorId: async () => { throw new Error('db down'); }, logger: silent });
    expect(code).toBe(0);
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
