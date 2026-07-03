/**
 * QF-20260703-964 (THREE-WAY-COMMS FR-3 lint v2) — insertCoordinationRow (the choke point)
 * must WARN (never block) when a written "[SENDER -> RECIPIENT]" body header disagrees with
 * the resolved payload.addressee. ONE check at the choke point, not a parallel mechanism
 * duplicated per writer (adam-advisory.cjs, solomon-advisory.cjs, ...). Mirrors
 * coordinator-dispatch-protocol-version-stamp.test.js's stub pattern.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

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
        then(res, rej) { return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: addressee-vs-target divergence WARN (QF-20260703-964)', () => {
  it('WARNs when the body header disagrees with payload.addressee', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      body: '[ADAM -> solomon] fyi',
      payload: { kind: 'adam_advisory', addressee: 'coordinator' },
    };
    await insertCoordinationRow(stubSupabase(), row, { logger: { warn, error() {}, log() {} } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('ADDRESSEE MISMATCH');
    expect(warn.mock.calls[0][0]).toContain('solomon');
    expect(warn.mock.calls[0][0]).toContain('coordinator');
  });

  it('does NOT warn when the header agrees with payload.addressee (loose substring match)', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      body: '[ADAM -> Solomon] fyi',
      payload: { kind: 'adam_advisory', addressee: 'solomon' },
    };
    await insertCoordinationRow(stubSupabase(), row, { logger: { warn, error() {}, log() {} } });
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silently inert when payload has no addressee (opt-in, never invents a comparison)', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      body: '[ADAM -> solomon] fyi',
      payload: { kind: 'adam_advisory' },
    };
    await insertCoordinationRow(stubSupabase(), row, { logger: { warn, error() {}, log() {} } });
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silently inert when the body has no bracket header', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      body: 'plain message, no header',
      payload: { kind: 'adam_advisory', addressee: 'coordinator' },
    };
    await insertCoordinationRow(stubSupabase(), row, { logger: { warn, error() {}, log() {} } });
    expect(warn).not.toHaveBeenCalled();
  });

  it('is sender-agnostic — a [COORD -> X] header works the same as [ADAM -> X]', async () => {
    const warn = vi.fn();
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      body: '[COORD->Charlie] scope note',
      payload: { kind: 'coordinator_reply', addressee: 'delta' },
    };
    await insertCoordinationRow(stubSupabase(), row, { logger: { warn, error() {}, log() {} } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Charlie');
  });

  it('never blocks the insert — the row still lands even on a mismatch', async () => {
    const row = {
      message_type: 'INFO', target_session: LIVE_TARGET,
      body: '[ADAM -> solomon] fyi',
      payload: { kind: 'adam_advisory', addressee: 'coordinator' },
    };
    const res = await insertCoordinationRow(stubSupabase(), row, { logger: { warn() {}, error() {}, log() {} } });
    expect(res.data.payload.addressee).toBe('coordinator');
  });
});
