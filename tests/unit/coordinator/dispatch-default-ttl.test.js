/**
 * QF-20260728-642 — insertCoordinationRow's fill-if-absent expires_at default.
 *
 * Without an explicit expires_at, the session_coordination.expires_at column DEFAULT is only
 * 60 minutes (`now() + '01:00:00'::interval`) -- measured live: a directed WORK_ASSIGNMENT
 * whose own body said it was the only delivery path for the item expired unread in one hour,
 * twice. The advisory lane (scripts/adam-advisory.cjs advisoryExpiresAt) has used a 24h durable
 * TTL since SD-LEO-INFRA-ADAM-ADVISORY-COMMS-001; this pins the same 24h floor at the dispatch
 * choke point, per the QF's own suggested negative test: "insert a row through the dispatch
 * path with no explicit expires_at and ASSERT the TTL is >= 24h."
 *
 * Follows the same lightweight chain-stub mocking convention as
 * tests/unit/coordinator/dispatch-topic-id.test.js (same lib/coordinator/dispatch.cjs choke
 * point).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../../lib/coordinator/dispatch.cjs');

const silentLog = { warn() {}, error() {}, log() {} };
// Sentinel target short-circuits assertValidTarget (no claude_sessions lookup needed), and a
// non-WORK_ASSIGNMENT message_type short-circuits assertSdDispatchable / assertWorkerTierAllowed
// / stampEffortRecommendation -- so the fake below only needs to model the session_coordination
// table itself.
const TARGET = 'broadcast-coordinator';

/** Minimal fake supabase client modeling only session_coordination insert. */
function createFakeSupabase() {
  const rows = [];
  let counter = 0;
  return {
    _rows: rows,
    from(table) {
      if (table !== 'session_coordination') {
        const generic = {
          select() { return generic; },
          eq() { return generic; },
          limit() { return generic; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        };
        return generic;
      }
      const chain = {
        insert(row) {
          const stored = { id: `row-${++counter}`, created_at: row.created_at || new Date().toISOString(), ...row };
          rows.push(stored);
          chain._result = stored;
          return chain;
        },
        select() { return chain; },
        then(resolve, reject) {
          return Promise.resolve({ data: chain._result, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: default expires_at TTL (QF-20260728-642)', () => {
  it('a row inserted with no explicit expires_at gets a TTL of at least 24h, not the 60-minute column default', async () => {
    const sb = createFakeSupabase();
    const before = Date.now();

    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      subject: 'no explicit TTL', payload: { body: 'x' },
    }, { logger: silentLog });

    const stored = sb._rows[0];
    expect(stored.expires_at).toBeTruthy();
    const ttlMs = new Date(stored.expires_at).getTime() - before;
    expect(ttlMs).toBeGreaterThanOrEqual(24 * 60 * 60_000 - 5000); // small tolerance for test wall-clock
  });

  it('never overwrites a caller-supplied expires_at, matching this choke point\'s own fill-if-absent precedent', async () => {
    const sb = createFakeSupabase();
    const explicit = '2020-01-01T00:00:00.000Z';

    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      subject: 'explicit TTL', payload: { body: 'x' }, expires_at: explicit,
    }, { logger: silentLog });

    expect(sb._rows[0].expires_at).toBe(explicit);
  });
});
