/**
 * QF-20260831-560 — real send backpressure inside insertCoordinationRow, replacing the
 * copy-pasted-x7 scratch-script conditional (Solomon disposition: heuristic sound, substitute not).
 *
 * TWO describe blocks, matching the disposition-lock precedent (tests/unit/coordinator/
 * disposition-lock.test.js): testing the exported assert alone proves the guard CAN refuse, never
 * that the choke CALLS it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  assertSendBackpressure, insertCoordinationRow, BACKPRESSURE_EXEMPT_KINDS, BACKPRESSURE_UNANSWERED_LIMIT,
} = require('../../../lib/coordinator/dispatch.cjs');
const { CORRECTION_KINDS, DISPOSITION_KIND } = require('../../../lib/coordinator/message-kinds.cjs');

const TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

/** Stub supabase: the backpressure query selects `id, payload` rows; `rows` supplies the raw
 *  candidate population directly, or `unanswered` is a shorthand for that many neutral
 *  (non-exempt, non-reply) rows. Every other query (claude_sessions liveness, etc.) resolves
 *  benign-empty so insertCoordinationRow's other guards pass through untouched. */
function stubSupabase({ unanswered = 0, rows = null, throwOnCount = false, liveSessions = [TARGET] } = {}) {
  const inserted = [];
  const countCalls = [];
  const candidateRows = rows || Array.from({ length: unanswered }, (_, i) => ({ id: `neutral-${i}`, payload: {} }));
  const sb = {
    from(table) {
      const chain = {
        _table: table, _isBackpressureSelect: false, _eq: null,
        select(cols) { chain._isBackpressureSelect = table === 'session_coordination' && cols === 'id, payload'; return chain; },
        eq(col, val) { chain._eq = val; return chain; },
        is() { return chain; },
        gt() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: liveSessions.includes(chain._eq) ? { session_id: chain._eq, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() { return Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }); },
        insert(r) { inserted.push(r); return chain; },
        then(res, rej) {
          if (table === 'session_coordination' && chain._isBackpressureSelect) {
            countCalls.push(true);
            const out = throwOnCount ? { data: null, error: { message: 'transient boom' } } : { data: candidateRows, error: null };
            return Promise.resolve(out).then(res, rej);
          }
          return Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted, countCalls };
}

describe('assertSendBackpressure (unit)', () => {
  it('refuses at the limit — the 4th unanswered directed row', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });

  it('allows below the limit', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT - 1 });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  it('every exempt kind bypasses the limit even when choked', async () => {
    for (const kind of BACKPRESSURE_EXEMPT_KINDS) {
      const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT + 5 });
      await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: { kind } }, silentLog)).resolves.toBeUndefined();
    }
  });

  it('an exempt-kind bypass logs loudly (never a quiet exemption)', async () => {
    const { sb } = stubSupabase({ unanswered: 99 });
    const lines = [];
    await assertSendBackpressure(sb, { target_session: TARGET, payload: { kind: 'collision_warning' } }, { warn: (m) => lines.push(m) });
    expect(lines.join('\n')).toMatch(/BACKPRESSURE_EXEMPT/);
  });

  it('fails open on a count-query error (never blocks a real send on a transient fault)', async () => {
    const { sb } = stubSupabase({ throwOnCount: true });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  it('is a no-op with no target_session', async () => {
    const { sb } = stubSupabase({ unanswered: 999 });
    await expect(assertSendBackpressure(sb, { payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  // QF-20260831-769: exempt-kind rows in the COUNTED population must not count as
  // "unanswered" — they were previously counted despite the exemption existing, which let
  // a target's own exempt sends (e.g. Adam's routine roll_call/collision traffic to the
  // coordinator) permanently occupy the cap and choke every OTHER sender's routine lane.
  it('does not count exempt-kind rows in the candidate population', async () => {
    const rows = [...BACKPRESSURE_EXEMPT_KINDS].slice(0, BACKPRESSURE_UNANSWERED_LIMIT + 2)
      .map((kind, i) => ({ id: `exempt-${i}`, payload: { kind } }));
    const { sb } = stubSupabase({ rows });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  // A solicited correlated reply IS an answer, not a fresh unanswered ask — must not count.
  it('does not count solicited correlated reply rows in the candidate population', async () => {
    const rows = Array.from({ length: BACKPRESSURE_UNANSWERED_LIMIT + 2 }, (_, i) => ({
      id: `reply-${i}`, payload: { kind: 'coordinator_update', reply_to: `corr-${i}` },
    }));
    const { sb } = stubSupabase({ rows });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  // QF-20260901-023: a refused send previously vanished with no queryable trace. It must now
  // be durably parked (readable by the recipient) instead of discarded.
  it('parks the refused row instead of discarding it', async () => {
    const { sb, inserted } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    const row = { target_session: TARGET, payload: { kind: 'coordinator_update', body: 'do not lose me' } };
    await expect(assertSendBackpressure(sb, row, silentLog)).rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].target_session).toBe(TARGET);
    expect(inserted[0].payload.body).toBe('do not lose me');
    expect(inserted[0].payload.backpressure_parked).toBe(true);
    expect(inserted[0].payload.backpressure_parked_at).toEqual(expect.any(String));
  });

  // A parked row is queued-for-later, not live pressure -- it must not count toward the cap
  // itself, or a capped target could never clear once its own parked backlog outnumbers the limit.
  it('does not count parked rows in the candidate population', async () => {
    const rows = Array.from({ length: BACKPRESSURE_UNANSWERED_LIMIT + 2 }, (_, i) => ({
      id: `parked-${i}`, payload: { kind: 'coordinator_update', backpressure_parked: true },
    }));
    const { sb } = stubSupabase({ rows });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  // QF-20260901-047: advisory-lane corrections carry the discriminator as payload.message_kind
  // (payload.kind is force-stamped to 'adam_advisory'), so they never matched the kind-keyed
  // exemption above and were parked behind the cap like a routine send.
  it('every correction message_kind bypasses the limit even when choked (message_kind exemption)', async () => {
    for (const messageKind of CORRECTION_KINDS) {
      const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT + 5 });
      await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: { kind: 'adam_advisory', message_kind: messageKind } }, silentLog)).resolves.toBeUndefined();
    }
  });

  it('a plain advisory (kind=adam_advisory, no message_kind) is still refused at the cap', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: { kind: 'adam_advisory' } }, silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });

  // 'disposition' is NOT a correction (message-kinds.cjs's own documented trap: it must never
  // exempt itself from a guard it exists to be locked by) — it stays refused at the cap.
  it('message_kind=disposition is NOT exempt — still refused at the cap', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: { kind: 'adam_advisory', message_kind: DISPOSITION_KIND } }, silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });

  it('does not count correction message_kind rows in the candidate population', async () => {
    const rows = CORRECTION_KINDS.map((messageKind, i) => ({ id: `corr-${i}`, payload: { kind: 'adam_advisory', message_kind: messageKind } }))
      .concat(Array.from({ length: BACKPRESSURE_UNANSWERED_LIMIT - 1 }, (_, i) => ({ id: `neutral-${i}`, payload: {} })));
    const { sb } = stubSupabase({ rows });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  it('still refuses when the NON-exempt, non-reply population meets the limit', async () => {
    const rows = [
      { id: 'exempt-1', payload: { kind: 'collision_warning' } },
      { id: 'reply-1', payload: { kind: 'coordinator_update', reply_to: 'corr-1' } },
      ...Array.from({ length: BACKPRESSURE_UNANSWERED_LIMIT }, (_, i) => ({ id: `real-${i}`, payload: {} })),
    ];
    const { sb } = stubSupabase({ rows });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });
});

describe('wired into insertCoordinationRow (choke-guard fixture — capability-not-use)', () => {
  it('a routine send is refused when the target is choked', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    await expect(insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'routine', payload: { kind: 'coordinator_update' },
    }, { logger: silentLog })).rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });

  it('an exempt-class send passes through a choked target', async () => {
    const { sb, inserted } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT + 2 });
    await insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'collision', payload: { kind: 'collision_warning' },
    }, { logger: silentLog });
    expect(inserted).toHaveLength(1);
  });
});
