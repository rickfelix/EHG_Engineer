/**
 * QF-20260728-944 (chairman-approved 2026-07-28) — insertCoordinationRow now REFUSES a role-scoped
 * message whose payload declares an addressee role that confirmably differs from the target
 * session's resolved role. Chairman-widened scope after three coordinator_reminder-lane
 * occurrences (solomon_responsibilities routed to an Adam session) plus a solomon_consult-lane
 * mis-delivery in the same window (a two-part consult Solomon never received).
 *
 * ACCEPTANCE (per the ticket, verbatim): blocked_mismatches / attempted_mismatches == 1 where
 * attempted_mismatches > 0, asserted by injecting a deliberate mismatch — an assertion that "no
 * mismatches occurred" is explicitly called out as INVALID (a quiet period would pass it exactly
 * as a working fence does). Cover BOTH lanes, asserted PER-LANE. Assert a correctly-addressed
 * message is UNAFFECTED (no false blocking).
 *
 * Mirrors the stub pattern in tests/unit/coordinator-dispatch-drain-registry-warn.test.js — drives
 * insertCoordinationRow (the actual choke point) directly, using opts.targetRoleHint to pin
 * resolveTargetRole deterministically without touching the identity-resolution internals.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow, declaredAddresseeRole } = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';

function stubSupabase() {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq(_col, val) { chain._eq = val; return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: chain._eq === LIVE_TARGET ? { session_id: LIVE_TARGET, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(r) { chain._inserted = r; return chain; },
        then(res, rej) {
          if (table === 'role_drain_sets') return Promise.resolve({ data: [], error: null }).then(res, rej);
          return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

const silentLogger = { warn() {}, error() {}, log() {} };

describe('declaredAddresseeRole() — pure (QF-20260728-944)', () => {
  it('declares solomon for payload.topic=solomon_responsibilities', () => {
    expect(declaredAddresseeRole({ topic: 'solomon_responsibilities' })).toBe('solomon');
  });
  it('declares adam for payload.topic=adam_responsibilities', () => {
    expect(declaredAddresseeRole({ topic: 'adam_responsibilities' })).toBe('adam');
  });
  it('declares solomon for payload.kind=solomon_consult', () => {
    expect(declaredAddresseeRole({ kind: 'solomon_consult' })).toBe('solomon');
  });
  it('declares nothing for an unrelated payload', () => {
    expect(declaredAddresseeRole({ kind: 'coordinator_directive' })).toBeNull();
    expect(declaredAddresseeRole(null)).toBeNull();
  });
});

describe('insertCoordinationRow: addressee-role precondition (QF-20260728-944)', () => {
  it('LANE 1 (coordinator_reminder/topic): REFUSES a solomon_responsibilities reminder addressed to a session resolving to adam — attempted=1, blocked=1', async () => {
    let attempted = 0, blocked = 0;
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'coordinator_reminder', topic: 'solomon_responsibilities' },
    };
    attempted++;
    await expect(
      insertCoordinationRow(stubSupabase(), row, { logger: silentLogger, targetRoleHint: 'adam' })
    ).rejects.toMatchObject({ code: 'DISPATCH_ROLE_TOPIC_MISMATCH' });
    blocked++;
    expect(blocked / attempted).toBe(1);
  });

  it('LANE 1 (coordinator_reminder/topic): REFUSES an adam_responsibilities reminder addressed to a session resolving to solomon', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'coordinator_reminder', topic: 'adam_responsibilities' },
    };
    await expect(
      insertCoordinationRow(stubSupabase(), row, { logger: silentLogger, targetRoleHint: 'solomon' })
    ).rejects.toMatchObject({ code: 'DISPATCH_ROLE_TOPIC_MISMATCH' });
  });

  it('LANE 2 (solomon_consult/kind): REFUSES a solomon_consult message addressed to a session resolving to adam — the measured live specimen (2-part consult, both parts landed on Adam)', async () => {
    let attempted = 0, blocked = 0;
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'solomon_consult', subject: '[COORD->SOLOMON 1/2] OOB path' },
    };
    attempted++;
    await expect(
      insertCoordinationRow(stubSupabase(), row, { logger: silentLogger, targetRoleHint: 'adam' })
    ).rejects.toMatchObject({ code: 'DISPATCH_ROLE_TOPIC_MISMATCH' });
    blocked++;
    expect(blocked / attempted).toBe(1);
  });

  it('a correctly-addressed solomon_responsibilities reminder to a session resolving to solomon is UNAFFECTED (no false blocking)', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'coordinator_reminder', topic: 'solomon_responsibilities' },
    };
    const res = await insertCoordinationRow(stubSupabase(), row, { logger: silentLogger, targetRoleHint: 'solomon' });
    expect(res.data.payload.topic).toBe('solomon_responsibilities');
  });

  it('a correctly-addressed solomon_consult to a session resolving to solomon is UNAFFECTED (no false blocking)', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'solomon_consult' },
    };
    const res = await insertCoordinationRow(stubSupabase(), row, { logger: silentLogger, targetRoleHint: 'solomon' });
    expect(res.data.payload.kind).toBe('solomon_consult');
  });

  it('a message with no addressee-role declaration is UNAFFECTED regardless of target role', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'coordinator_directive' },
    };
    const res = await insertCoordinationRow(stubSupabase(), row, { logger: silentLogger, targetRoleHint: 'adam' });
    expect(res.data.payload.kind).toBe('coordinator_directive');
  });

  it('fails OPEN (does not block) when the target role is unresolvable — precision over recall', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      payload: { kind: 'coordinator_reminder', topic: 'solomon_responsibilities' },
    };
    // No targetRoleHint, and the stub's claude_sessions/getActive* resolution path returns
    // null for identity lookups it doesn't recognize — resolveTargetRole falls through to null.
    const res = await insertCoordinationRow(stubSupabase(), row, { logger: silentLogger });
    expect(res.data.payload.topic).toBe('solomon_responsibilities');
  });
});
