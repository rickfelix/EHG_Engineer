/**
 * QF-20260729-716 — insertCoordinationRow (the choke point) must refuse CLAIM_REMINDER/
 * STALE_WARNING: both are valid coordination_message_type enum members the choke otherwise
 * accepts without complaint, but scripts/worker-checkin.cjs's isCoordinatorPush() never surfaces
 * either, and /checkin is the ONLY path that acks — so a row sent on either type can never be
 * acked by any path, becoming permanent, unretirable residue in every "acknowledged_at IS NULL"
 * report.
 *
 * PAIRED CONTROL (mirrors the QF's own live falsification test): the SAME body sent as
 * message_type='INFO' with payload.kind='coordinator_request' must NOT be refused — that carrier
 * IS surfaced by isCoordinatorPush() and consumed via /checkin. A fix that refused everything
 * would pass a naive "CLAIM_REMINDER throws" test while breaking the actual replacement carrier;
 * this pairing is what proves the fix routes senders to a carrier that still works.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');
const { isCoordinatorPush } = require('../../scripts/worker-checkin.cjs');
const { UNDRAINABLE_WORKER_MESSAGE_TYPES } = require('../../lib/coordinator/undrainable-message-types.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

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
        then(res, rej) { return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: undrainable message-type refusal (QF-20260729-716)', () => {
  for (const mt of UNDRAINABLE_WORKER_MESSAGE_TYPES) {
    it(`refuses message_type='${mt}' with an error naming the INFO+coordinator_request carrier`, async () => {
      const sb = stubSupabase();
      const row = { message_type: mt, target_session: LIVE_TARGET, subject: 'status please', body: 'you hold a claim, please confirm' };
      await expect(insertCoordinationRow(sb, row, { logger: silentLog })).rejects.toMatchObject({
        code: 'DISPATCH_UNDRAINABLE_MESSAGE_TYPE',
        message: expect.stringContaining("payload.kind='coordinator_request'"),
      });
    });

    it(`'${mt}' is confirmed NOT surfaced by isCoordinatorPush() -- the reader-side half of the same defect`, () => {
      expect(isCoordinatorPush({ message_type: mt, payload: {} })).toBe(false);
    });
  }

  it('PAIRED CONTROL: the same body sent as INFO + payload.kind=coordinator_request is NOT refused', async () => {
    const sb = stubSupabase();
    const row = {
      message_type: 'INFO',
      target_session: LIVE_TARGET,
      subject: 'status please',
      payload: { kind: 'coordinator_request', body: 'you hold a claim, please confirm' },
    };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('coordinator_request');
  });

  it('PAIRED CONTROL, reader side: the replacement carrier (INFO + coordinator_request) IS surfaced by isCoordinatorPush()', () => {
    expect(isCoordinatorPush({ message_type: 'INFO', payload: { kind: 'coordinator_request' } })).toBe(true);
  });

  it('does not refuse unrelated message types (e.g. COACHING)', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'COACHING', target_session: LIVE_TARGET, subject: 'fyi', body: 'keep going' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.message_type).toBe('COACHING');
  });
});
