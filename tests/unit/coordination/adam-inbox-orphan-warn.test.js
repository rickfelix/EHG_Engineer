// SD-FDBK-INFRA-ADAM-INBOX-ADAM-001 — drainInbox must SURFACE (WARN, not consume) orphaned
// Adam-directed rows: untyped (payload.kind null) or unknown typed kinds (e.g. coordinator_alert)
// that no drain lane covers, MINUS the handler-owned EXCLUDED_KINDS. The deliberate non-consume
// invariant (untyped never read_at-stamped) is preserved.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { drainInbox, isOrphanedAdamRow, EXCLUDED_KINDS } = require('../../../scripts/adam-advisory.cjs');

// AND-only fetch + JS-filter stub (mirrors adam-inbox-all-classes.test.js).
function stub(rows) {
  const captured = { eq: {}, isNull: [], updatedIds: null, usedOr: false, orphanSeenUpdates: [] };
  const selectChain = {
    select() { return selectChain; },
    eq(col, val) { captured.eq[col] = val; return selectChain; },
    or() { captured.usedOr = true; return selectChain; },
    is(col) { captured.isNull.push(col); return selectChain; },
    order() { return selectChain; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  const updateChain = {
    _payload: null,
    update(body) { updateChain._payload = body; return updateChain; },
    in(_col, ids) { captured.updatedIds = ids; return updateChain; },
    is() { return Promise.resolve({ error: null }); },
    eq(_col, id) {
      captured.orphanSeenUpdates.push({ id, payload: updateChain._payload && updateChain._payload.payload });
      return Promise.resolve({ error: null });
    },
  };
  const supabase = { from() { return new Proxy({}, { get(_t, p) { return (p in selectChain) ? selectChain[p] : updateChain[p]; } }); } };
  return { supabase, captured };
}

describe('isOrphanedAdamRow predicate', () => {
  it('matches untyped rows and unknown typed kinds (real deliveries no lane covers)', () => {
    expect(isOrphanedAdamRow({ payload: {} })).toBe(true);                              // untyped
    expect(isOrphanedAdamRow({ payload: { kind: 'coordinator_alert' } })).toBe(true);   // unknown typed
    expect(isOrphanedAdamRow({ payload: { kind: 'some_new_unregistered_kind' } })).toBe(true);
  });
  it('does NOT match reply rows, ADAM_INBOX_KINDS rows, or handler-owned denylist kinds', () => {
    expect(isOrphanedAdamRow({ payload: { kind: 'coordinator_reply' } })).toBe(false);  // reply lane
    expect(isOrphanedAdamRow({ payload: { reply_to: 'corr-1' } })).toBe(false);          // reply via correlation
    expect(isOrphanedAdamRow({ payload: { kind: 'chairman_heads_up' } })).toBe(false);   // adam-inbox lane
    for (const k of EXCLUDED_KINDS) expect(isOrphanedAdamRow({ payload: { kind: k } })).toBe(false);
  });
  it('EXCLUDED_KINDS contains the four handler-owned kinds', () => {
    expect(EXCLUDED_KINDS).toEqual(expect.arrayContaining(['canary_request', 'comms_check', 'ack', 'coordinator_ack']));
  });
});

describe('drainInbox orphan WARN lane', () => {
  it('WARNs about untyped + unknown-typed Adam-directed rows but does NOT consume them', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date().toISOString();
    const rows = [
      { id: 'reply', payload: { kind: 'coordinator_reply', body: 'r' }, created_at: now },
      { id: 'untyped', payload: { body: 'enforcer verdict' }, created_at: now },          // untyped delivery
      { id: 'alert', payload: { kind: 'coordinator_alert', body: 'masked stall' }, created_at: now }, // unknown typed
      { id: 'canary', payload: { kind: 'canary_request' }, created_at: now },             // handler-owned
    ];
    const { supabase, captured } = stub(rows);
    await drainInbox(supabase, 'adam-session');

    // orphans surfaced via WARN
    const warned = warnSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(warned).toContain('untyped');
    expect(warned).toContain('coordinator_alert');
    // handler-owned canary NOT warned as orphan
    expect(warned).not.toContain('canary_request');

    // consume set: only the real reply lane — orphans + canary NOT consumed (invariant preserved)
    expect(captured.updatedIds).toEqual(['reply']);
    for (const bad of ['untyped', 'alert', 'canary']) expect(captured.updatedIds).not.toContain(bad);
    warnSpy.mockRestore(); logSpy.mockRestore();
  });

  it('emits NO orphan WARN when only handler-owned denylist rows are present', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date().toISOString();
    const { supabase, captured } = stub([
      { id: 'canary', payload: { kind: 'canary_request' }, created_at: now },
      { id: 'ack', payload: { kind: 'ack' }, created_at: now },
    ]);
    await drainInbox(supabase, 'adam-session');
    expect(warnSpy.mock.calls.length).toBe(0); // no orphan warning
    expect(captured.updatedIds).toBeNull();    // nothing consumed
    warnSpy.mockRestore(); logSpy.mockRestore();
  });

  // QF-20260702-414: an orphan recirculated on EVERY tick before this fix (28 rows unchanged
  // across 6+ drains). Each orphan must WARN once, stamp orphan_seen_at, then stay silent.
  it('WARNs a fresh orphan once and stamps orphan_seen_at (not read_at)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date().toISOString();
    const { supabase, captured } = stub([
      { id: 'fresh', payload: { kind: 'coordinator_alert', body: 'first sighting' }, created_at: now },
    ]);
    await drainInbox(supabase, 'adam-session');
    expect(warnSpy.mock.calls.map(c => c.join(' ')).join('\n')).toContain('fresh');
    expect(captured.orphanSeenUpdates).toHaveLength(1);
    expect(captured.orphanSeenUpdates[0].id).toBe('fresh');
    expect(captured.orphanSeenUpdates[0].payload.orphan_seen_at).toBeTruthy();
    expect(captured.updatedIds).toBeNull(); // read_at NEVER stamped — still recoverable
    warnSpy.mockRestore(); logSpy.mockRestore();
  });

  it('stays SILENT on an orphan already stamped orphan_seen_at (no re-print)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date().toISOString();
    const { supabase, captured } = stub([
      { id: 'already-seen', payload: { kind: 'coordinator_alert', orphan_seen_at: now }, created_at: now },
    ]);
    await drainInbox(supabase, 'adam-session');
    expect(warnSpy.mock.calls.length).toBe(0);
    expect(captured.orphanSeenUpdates).toHaveLength(0); // no re-stamp of an already-seen row
    warnSpy.mockRestore(); logSpy.mockRestore();
  });
});
