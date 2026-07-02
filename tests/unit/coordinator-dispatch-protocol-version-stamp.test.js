/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C (FR-2) — insertCoordinationRow (the choke point)
 * must stamp payload.protocol_comms_version on every row it inserts, so a stale long-lived-singleton
 * reader can detect a skew instead of silently misreading the row as a mystery orphan.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');
const { PROTOCOL_COMMS_VERSION } = require('../../lib/coordinator/protocol-comms-version.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

// Minimal stub: no SD/QF terminal-guard fixtures needed (non-WORK_ASSIGNMENT rows fail-open through
// assertSdDispatchable), and the target session resolves live.
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

describe('insertCoordinationRow: protocol-version stamping (FR-2)', () => {
  it('stamps protocol_comms_version onto a row with an existing payload object', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_reply', body: 'hi' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.protocol_comms_version).toBe(PROTOCOL_COMMS_VERSION);
    // Original fields preserved.
    expect(res.data.payload.kind).toBe('coordinator_reply');
    expect(res.data.payload.body).toBe('hi');
  });

  it('never overwrites a caller-supplied stamp', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_reply', protocol_comms_version: 999 } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.protocol_comms_version).toBe(999);
  });

  it('does not invent a payload object on a payload-less row', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'no payload here' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload).toBeUndefined();
  });
});
