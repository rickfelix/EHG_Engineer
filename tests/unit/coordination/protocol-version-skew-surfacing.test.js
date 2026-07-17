/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C (FR-2) — the read side: Adam's and Solomon's
 * canonical `inbox` reader (drainInbox) must WARN "PROTOCOL VERSION SKEW" when a surfaced row's
 * stamped payload.protocol_comms_version differs from this process's own, instead of silently
 * misreading the row like every other kind of unrecognized mismatch.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { drainInbox: drainAdamInbox } = require('../../../scripts/adam-advisory.cjs');
const { drainInbox: drainSolomonInbox } = require('../../../scripts/solomon-advisory.cjs');
const { PROTOCOL_COMMS_VERSION } = require('../../../lib/coordinator/protocol-comms-version.cjs');

function stub(rows) {
  const captured = { updatedIds: null };
  const selectChain = {
    select() { return selectChain; },
    eq() { return selectChain; },
    // SD-LEO-INFRA-SEND-TIME-TARGET-001: Solomon drainInbox now two-lane scopes the target
    // via .in('target_session', [sessionId, 'broadcast-solomon']).
    in() { return selectChain; },
    is() { return selectChain; },
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: drainInbox now window-scopes (gte)
    // and runs an advisory older-rows head-count (terminal .lt).
    gte() { return selectChain; },
    lt() { return Promise.resolve({ count: 0, error: null }); },
    order() { return selectChain; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  const updateChain = {
    update() { return updateChain; },
    in(_col, ids) { captured.updatedIds = ids; return updateChain; },
    is() { return Promise.resolve({ error: null }); },
  };
  const supabase = {
    from() {
      return new Proxy({}, {
        get(_t, prop) {
          if (prop in selectChain) return selectChain[prop];
          if (prop in updateChain) return updateChain[prop];
          return undefined;
        },
      });
    },
  };
  return { supabase, captured };
}

describe('drainInbox (Adam): protocol-version-skew surfacing', () => {
  it('WARNs on a row stamped with a differing version', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      { id: 'skewed-1', payload: { kind: 'coordinator_directive', body: 'stale singleton read this', protocol_comms_version: PROTOCOL_COMMS_VERSION + 1 }, created_at: new Date().toISOString() },
    ];
    const { supabase } = stub(rows);
    await drainAdamInbox(supabase, 'adam-session');
    const warned = warnSpy.mock.calls.some((c) => String(c[0]).includes('PROTOCOL VERSION SKEW'));
    expect(warned).toBe(true);
    logSpy.mockRestore(); warnSpy.mockRestore();
  });

  it('does NOT warn on a row with no version stamp or a matching stamp', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      { id: 'unstamped', payload: { kind: 'coordinator_directive', body: 'no stamp' }, created_at: new Date().toISOString() },
      { id: 'matched', payload: { kind: 'coordinator_directive', body: 'same version', protocol_comms_version: PROTOCOL_COMMS_VERSION }, created_at: new Date().toISOString() },
    ];
    const { supabase } = stub(rows);
    await drainAdamInbox(supabase, 'adam-session');
    const warned = warnSpy.mock.calls.some((c) => String(c[0]).includes('PROTOCOL VERSION SKEW'));
    expect(warned).toBe(false);
    logSpy.mockRestore(); warnSpy.mockRestore();
  });
});

describe('drainInbox (Solomon): protocol-version-skew surfacing', () => {
  it('WARNs on a row stamped with a differing version', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      { id: 'skewed-2', payload: { kind: 'coordinator_directive', body: 'stale Solomon read this', protocol_comms_version: PROTOCOL_COMMS_VERSION + 1 }, created_at: new Date().toISOString() },
    ];
    const { supabase } = stub(rows);
    await drainSolomonInbox(supabase, 'solomon-session');
    const warned = warnSpy.mock.calls.some((c) => String(c[0]).includes('PROTOCOL VERSION SKEW'));
    expect(warned).toBe(true);
    logSpy.mockRestore(); warnSpy.mockRestore();
  });
});
