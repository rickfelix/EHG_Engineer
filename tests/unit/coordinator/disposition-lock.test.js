/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-2 — the disposition lock.
 *
 * A correlation that already carries a terminal disposition must not accept another answer. PLAN's
 * review found this FR, as first written, was a SAFETY REGRESSION that no test in the repo would have
 * caught, so the exemptions below are not edge cases — each one prevents a specific documented
 * incident, and the tests asserting them are the point of the file.
 *
 * TWO describe blocks are REQUIRED and the second is the one that matters: testing the exported
 * assert alone proves the guard CAN refuse, never that the choke CALLS it. That is the
 * capability-not-use trap, and this suite would pass with the guard defined and never wired.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertCorrelationNotDisposed, insertCoordinationRow } = require('../../../lib/coordinator/dispatch.cjs');
const { CORRECTION_KINDS, MESSAGE_KINDS, DISPOSITION_KIND } = require('../../../lib/coordinator/message-kinds.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const CORR = 'corr-disposed-1';
const silentLog = { warn() {}, error() {}, log() {} };

/**
 * Stub supabase. `disposed` seeds the disposition lookup; `filters` records the query shape so we can
 * assert the guard reads payload->>, not the bare column — a column-keyed lookup would find nothing
 * and the guard would be inert while reading as enforced.
 */
function stubSupabase({ disposed = [], throwOnLookup = false, liveSessions = [LIVE_TARGET] } = {}) {
  const inserted = [];
  const filters = [];
  const sb = {
    from(table) {
      const chain = {
        _table: table, _eq: null, _isSelect: false,
        select() { chain._isSelect = true; return chain; },
        eq(col, val) { filters.push({ table, col, val }); chain._eq = val; return chain; },
        is() { return chain; },
        in() { return chain; },
        order() { return chain; },
        // limit() must stay CHAINABLE, not resolve: insertCoordinationRow's other guards call
        // .limit(...).maybeSingle(). The guard under test awaits the chain directly, which the
        // `then` below serves.
        limit() { return chain; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: liveSessions.includes(chain._eq) ? { session_id: chain._eq, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() { return Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }); },
        insert(r) { inserted.push(r); chain._isSelect = false; return chain; },
        then(res, rej) {
          if (table === 'session_coordination' && chain._isSelect) {
            const out = throwOnLookup
              ? { data: null, error: { message: 'transient boom' } }
              : { data: disposed, error: null };
            return Promise.resolve(out).then(res, rej);
          }
          return Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted, filters };
}

const disposedRow = [{ id: 'row-disposition-1' }];
const answer = (extra = {}) => ({
  target_session: LIVE_TARGET,
  message_type: 'INFO',
  payload: { kind: 'adam_advisory', correlation_id: CORR, body: 'another answer', ...extra },
});

describe('FR-2: assertCorrelationNotDisposed refuses a second answer', () => {
  it('throws DISPATCH_CORRELATION_DISPOSED when the correlation is already disposed', async () => {
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, answer(), silentLog)).rejects.toThrow(/DISPATCH_CORRELATION_DISPOSED/);
  });

  it('allows the answer when no disposition exists', async () => {
    const { sb } = stubSupabase({ disposed: [] });
    await expect(assertCorrelationNotDisposed(sb, answer(), silentLog)).resolves.toBeUndefined();
  });

  it('ignores a row with no correlation at all', async () => {
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, { payload: { kind: 'x' } }, silentLog)).resolves.toBeUndefined();
  });

  it('reads payload->>correlation_id, NOT the bare column', async () => {
    // The column is populated on 6.5% of rows and written by nothing in the repo. A column-keyed
    // lookup would match nothing, so the guard would never fire while every "it refuses" test above
    // still passed — the lock would be decorative. Pin the query shape.
    const { sb, filters } = stubSupabase({ disposed: [] });
    await assertCorrelationNotDisposed(sb, answer(), silentLog);
    const cols = filters.filter((f) => f.table === 'session_coordination').map((f) => f.col);
    expect(cols).toContain('payload->>correlation_id');
    expect(cols).toContain('payload->>message_kind');
    expect(cols).not.toContain('correlation_id');
  });
});

describe('FR-2: the three exemptions, each guarding a documented incident', () => {
  it('EXEMPTS the originator-CC leg — QF-20260705-488', async () => {
    // ensureOriginatorCc re-enters the same choke with the same correlation AFTER the primary insert.
    // Refuse it and its own catch swallows the throw while main() still prints success and exits 0:
    // a disposition that reports delivered while the originator never receives it. That incident
    // ended with the chairman hand-relaying a verdict.
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, answer({ via: 'cc_originator' }), silentLog)).resolves.toBeUndefined();
  });

  it('EXEMPTS every correction kind — a wrong disposition must stay retractable', async () => {
    const { sb } = stubSupabase({ disposed: disposedRow });
    for (const kind of CORRECTION_KINDS) {
      await expect(assertCorrelationNotDisposed(sb, answer({ message_kind: kind }), silentLog)).resolves.toBeUndefined();
    }
  });

  it('EXEMPTS in-flight parts — FR-1 and FR-2 contradict, and FR-1 yields first', async () => {
    // FR-1 makes ordered parts share ONE correlation. Without this the lock refuses part 2 onward and
    // cancels FR-1 outright.
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, answer({ part_index: 2, part_total: 3 }), silentLog)).resolves.toBeUndefined();
  });

  it('does NOT exempt a lone part_index with no total — that is not a series', async () => {
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, answer({ part_index: 2 }), silentLog)).rejects.toThrow(/DISPATCH_CORRELATION_DISPOSED/);
  });

  it('does NOT exempt a disposition from its own lock', async () => {
    // THE SELF-EXEMPTION TRAP. CORRECTION_KINDS and MESSAGE_KINDS were the SAME list until this FR
    // added 'disposition' to the latter. Keying the exemption on MESSAGE_KINDS instead — a natural
    // looking simplification — makes 'disposition' exempt itself, so the lock never fires on the one
    // thing it exists to lock, and every exemption test above still passes. Silent and total.
    expect(MESSAGE_KINDS).toContain(DISPOSITION_KIND);
    expect(CORRECTION_KINDS).not.toContain(DISPOSITION_KIND);
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, answer({ message_kind: DISPOSITION_KIND }), silentLog))
      .rejects.toThrow(/DISPATCH_CORRELATION_DISPOSED/);
  });
});

describe('FR-2: fail posture — closed on a real match, open on the guard\'s own error', () => {
  it('fails OPEN when the lookup itself errors — a guard bug must never block a send', async () => {
    const { sb } = stubSupabase({ throwOnLookup: true });
    await expect(assertCorrelationNotDisposed(sb, answer(), silentLog)).resolves.toBeUndefined();
  });

  it('fails OPEN when supabase throws outright', async () => {
    const exploding = { from() { throw new Error('client exploded'); } };
    await expect(assertCorrelationNotDisposed(exploding, answer(), silentLog)).resolves.toBeUndefined();
  });

  it('fails CLOSED on a confirmed match — the refusal is not swallowed by its own catch', async () => {
    // The catch that implements fail-open must re-throw the guard's own verdict, or the lock is inert.
    const { sb } = stubSupabase({ disposed: disposedRow });
    await expect(assertCorrelationNotDisposed(sb, answer(), silentLog)).rejects.toThrow(/DISPATCH_CORRELATION_DISPOSED/);
  });
});

describe('FR-2: the CHOKE calls the guard (not merely that the guard exists)', () => {
  it('insertCoordinationRow REFUSES an answer on a disposed correlation', async () => {
    // Block 1 proves the guard can refuse. Only this proves it is wired: delete the call at the
    // choke and every test above still passes.
    const { sb, inserted } = stubSupabase({ disposed: disposedRow });
    await expect(insertCoordinationRow(sb, answer(), { logger: silentLog })).rejects.toThrow(/DISPATCH_CORRELATION_DISPOSED/);
    expect(inserted).toHaveLength(0); // refused BEFORE the write, not after
  });

  it('insertCoordinationRow still lands the originator-CC leg on a disposed correlation', async () => {
    // The regression test for QF-20260705-488, driven through the real choke rather than the assert.
    const { sb, inserted } = stubSupabase({ disposed: disposedRow });
    await insertCoordinationRow(sb, answer({ via: 'cc_originator' }), { logger: silentLog });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.via).toBe('cc_originator');
  });

  it('insertCoordinationRow inserts normally when nothing is disposed', async () => {
    const { sb, inserted } = stubSupabase({ disposed: [] });
    await insertCoordinationRow(sb, answer(), { logger: silentLog });
    expect(inserted).toHaveLength(1);
  });
});
