/**
 * SEC-1 (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D EXEC-TO-PLAN SECURITY review,
 * sub_agent_execution_results 9949b384-5863-494f-83b6-ab46902d8023): postgrest-js resolves
 * `{data:null, error}` rather than throwing, so the three try/catch blocks in resolveIdleCtx
 * were unreachable for the dominant failure mode -- a query error left each Set silently empty
 * (qf/seat-busy) or, worse, left sdHolderSessionIds as an empty-but-non-null Set instead of the
 * documented null-on-failure sentinel seatIdleVerdict's three-state axis relies on to fail OPEN
 * to the stale sd_key mirror. This pins the fixed behaviour: an `error` on the response is now
 * treated exactly like a thrown exception.
 */
import { describe, it, expect } from 'vitest';
import { resolveIdleCtx } from '../../lib/fleet/idle-ctx-population.mjs';

function tableFor(rows, { erroringTables = new Set() } = {}, tableName) {
  const resolve = (n) => {
    if (erroringTables.has(tableName)) {
      return { data: null, error: { message: `${tableName} read failed (simulated)` } };
    }
    return { data: typeof n === 'number' ? rows.slice(0, n) : rows, error: null };
  };
  const b = {
    select() { return b; },
    not() { return b; },
    in() { return b; },
    eq() { return b; },
    is() { return b; },
    gt() { return b; },
    limit(n) { return Promise.resolve(resolve(n)); },
    // quick_fixes' query ends on .in() with no .limit() -- awaiting the builder itself must
    // resolve, exactly like the real PostgREST filter-builder's own thenable.
    then(res, rej) { return Promise.resolve(resolve()).then(res, rej); },
  };
  return b;
}

function fakeClient({ qfs = [], busy = [], sds = [], erroringTables = new Set() } = {}) {
  return {
    from(name) {
      if (name === 'quick_fixes') return tableFor(qfs, { erroringTables }, 'quick_fixes');
      if (name === 'session_coordination') return tableFor(busy, { erroringTables }, 'session_coordination');
      if (name === 'strategic_directives_v2') return tableFor(sds, { erroringTables }, 'strategic_directives_v2');
      throw new Error(`unexpected table: ${name}`);
    },
  };
}

describe('resolveIdleCtx (SEC-1: PostgREST-error responses fail closed like thrown exceptions)', () => {
  it('happy path: populates all three axes from row data', async () => {
    const client = fakeClient({
      qfs: [{ claiming_session_id: 'qf-holder-1' }],
      busy: [{ target_session: 'busy-1', expires_at: new Date(Date.now() + 60_000).toISOString() }],
      sds: [{ claiming_session_id: 'sd-holder-1' }],
    });
    const ctx = await resolveIdleCtx(client);
    expect(ctx.qfHolderSessionIds).toEqual(new Set(['qf-holder-1']));
    expect(ctx.seatBusySessionIds).toEqual(new Set(['busy-1']));
    expect(ctx.sdHolderSessionIds).toEqual(new Set(['sd-holder-1']));
    expect(ctx.undeliveredReasons).toEqual([]);
  });

  it('quick_fixes read error: qfHolderSessionIds degrades to empty Set (documented) and is recorded in undeliveredReasons', async () => {
    const client = fakeClient({ erroringTables: new Set(['quick_fixes']) });
    const ctx = await resolveIdleCtx(client);
    expect(ctx.qfHolderSessionIds).toEqual(new Set());
    expect(ctx.undeliveredReasons.some((r) => r.startsWith('qf_holder_read_failed:'))).toBe(true);
  });

  it('session_coordination read error: seatBusySessionIds degrades to empty Set and is recorded', async () => {
    const client = fakeClient({ erroringTables: new Set(['session_coordination']) });
    const ctx = await resolveIdleCtx(client);
    expect(ctx.seatBusySessionIds).toEqual(new Set());
    expect(ctx.undeliveredReasons.some((r) => r.startsWith('seat_busy_read_failed:'))).toBe(true);
  });

  it('strategic_directives_v2 read error: sdHolderSessionIds STAYS NULL (not an empty Set), so seatIdleVerdict fails OPEN to the sd_key mirror', async () => {
    const client = fakeClient({ erroringTables: new Set(['strategic_directives_v2']) });
    const ctx = await resolveIdleCtx(client);
    expect(ctx.sdHolderSessionIds).toBeNull();
    expect(ctx.undeliveredReasons.some((r) => r.startsWith('sd_holder_read_failed:'))).toBe(true);
  });
});
