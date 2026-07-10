// SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001 — the Adam inbox must drain ALL directed Adam classes, not
// just the reply lane + the shared DIRECTIVE_KINDS that FULL-LANE covered. These tests exercise the
// REAL classification (isAdamInboxRow / ADAM_INBOX_KINDS) + drainInbox's AND-only fetch + JS filter,
// and PIN that the shared DIRECTIVE_KINDS is NOT mutated (workers consume it) and that responder-owned
// + untyped rows are never scooped.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { drainInbox, isAdamInboxRow, isDirectiveRow, ADAM_INBOX_KINDS } = require('../../../scripts/adam-advisory.cjs');
const { DIRECTIVE_KINDS } = require('../../../lib/fleet/worker-status.cjs');

const NEW_ADAM_KINDS = ['chairman_heads_up', 'chairman_handoff', 'coordinator_advisory', 'coordinator_adam_feedback', 'assist_request', 'reconcile_consult'];
const EXCLUDED_KINDS = ['canary_request', 'comms_check', 'ack', 'coordinator_ack'];

describe('ADAM_INBOX_KINDS allowlist', () => {
  it('is a SUPERSET of the shared DIRECTIVE_KINDS', () => {
    for (const k of DIRECTIVE_KINDS) expect(ADAM_INBOX_KINDS).toContain(k);
  });
  it('adds the 6 Adam-directed classes the live data showed undrained', () => {
    for (const k of NEW_ADAM_KINDS) expect(ADAM_INBOX_KINDS).toContain(k);
  });
  it('does NOT contain responder-owned / terminal kinds', () => {
    for (const k of EXCLUDED_KINDS) expect(ADAM_INBOX_KINDS).not.toContain(k);
  });
  it('does NOT mutate the shared DIRECTIVE_KINDS (workers consume it)', () => {
    for (const k of NEW_ADAM_KINDS) expect(DIRECTIVE_KINDS).not.toContain(k);
  });
});

describe('isAdamInboxRow predicate', () => {
  it('matches every DIRECTIVE_KIND and every new Adam-directed class', () => {
    for (const k of [...DIRECTIVE_KINDS, ...NEW_ADAM_KINDS]) {
      expect(isAdamInboxRow({ payload: { kind: k } })).toBe(true);
    }
  });
  it('does NOT match excluded kinds, untyped rows, or null', () => {
    for (const k of EXCLUDED_KINDS) expect(isAdamInboxRow({ payload: { kind: k } })).toBe(false);
    expect(isAdamInboxRow({ payload: {} })).toBe(false);   // untyped (roll_call etc.)
    expect(isAdamInboxRow({})).toBe(false);
    expect(isAdamInboxRow(null)).toBe(false);
  });
  it('a new Adam class is NOT a DIRECTIVE row (it is the new lane)', () => {
    expect(isDirectiveRow({ payload: { kind: 'chairman_heads_up' } })).toBe(false);
    expect(isAdamInboxRow({ payload: { kind: 'chairman_heads_up' } })).toBe(true);
  });
});

// AND-only fetch + JS-filter stub (mirrors adam-advisory-full-lane.test.js).
// SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: drainInbox now window-scopes (gte), runs an
// advisory older-rows head-count (terminal .lt), and records the UPDATE payload so the stamp
// matrix (read_at interactive / delivered_at background / acknowledged_at never) is pinned.
function stub(rows) {
  const captured = { eq: {}, isNull: [], updatedIds: null, usedOr: false, updatePayloads: [] };
  const selectChain = {
    select() { return selectChain; },
    eq(col, val) { captured.eq[col] = val; return selectChain; },
    or() { captured.usedOr = true; return selectChain; },
    is(col) { captured.isNull.push(col); return selectChain; },
    gte() { return selectChain; },
    lt() { return Promise.resolve({ count: 0, error: null }); },
    order() { return selectChain; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  const updateChain = {
    update(payload) { captured.updatePayloads.push(payload); return updateChain; },
    in(_col, ids) { captured.updatedIds = ids; return updateChain; },
    is() { return Promise.resolve({ error: null }); },
    eq() { return Promise.resolve({ error: null }); }, // QF-20260702-414: orphan_seen_at per-row stamp
  };
  const supabase = { from() { return new Proxy({}, { get(_t, p) { return (p in selectChain) ? selectChain[p] : updateChain[p]; } }); } };
  return { supabase, captured };
}

describe('drainInbox (all-classes drain)', () => {
  it('surfaces+consumes reply + DIRECTIVE_KINDS + new Adam classes, but NOT excluded/untyped', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date().toISOString();
    const rows = [
      { id: 'reply', payload: { kind: 'coordinator_reply', body: 'r' }, created_at: now },
      { id: 'directive', payload: { kind: 'work_assignment', body: 'd' }, created_at: now },
      { id: 'heads_up', payload: { kind: 'chairman_heads_up', body: 'chairman' }, created_at: now },
      { id: 'handoff', payload: { kind: 'chairman_handoff', body: 'handoff' }, created_at: now },
      { id: 'advisory', payload: { kind: 'coordinator_advisory', body: 'adv' }, created_at: now },
      { id: 'adam_fb', payload: { kind: 'coordinator_adam_feedback', body: 'fb' }, created_at: now },
      { id: 'assist', payload: { kind: 'assist_request', body: 'assist' }, created_at: now },
      { id: 'reconcile', payload: { kind: 'reconcile_consult', body: 'rec' }, created_at: now },
      // must NOT be drained:
      { id: 'canary', payload: { kind: 'canary_request' }, created_at: now },
      { id: 'comms', payload: { kind: 'comms_check' }, created_at: now },
      { id: 'ack', payload: { kind: 'ack' }, created_at: now },
      { id: 'untyped', payload: {}, created_at: now },
    ];
    const { supabase, captured } = stub(rows);
    await drainInbox(supabase, 'adam-session');
    expect(captured.eq.target_session).toBe('adam-session');
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-4): the recoverable filter is
    // acknowledged_at IS NULL — read_at is a stamp, never a server filter, so a
    // read-stamped-but-unactioned row can never be hidden.
    expect(captured.isNull).toContain('acknowledged_at');
    expect(captured.isNull).not.toContain('read_at');
    expect(captured.usedOr).toBe(false); // AND-only — no PostgREST .or() trap
    expect(captured.updatedIds).toEqual(['reply', 'directive', 'heads_up', 'handoff', 'advisory', 'adam_fb', 'assist', 'reconcile']);
    // none of the excluded/untyped ids consumed
    for (const bad of ['canary', 'comms', 'ack', 'untyped']) expect(captured.updatedIds).not.toContain(bad);
    // Stamp matrix: interactive surfacing stamps read_at; acknowledged_at is NEVER written by a drain.
    const surfaceStamp = captured.updatePayloads.find(p => 'read_at' in p);
    expect(surfaceStamp).toBeTruthy();
    expect(captured.updatePayloads.some(p => 'acknowledged_at' in p)).toBe(false);
    logSpy.mockRestore();
  });

  it('reports cleanly when only excluded/untyped rows are present (nothing drained)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date().toISOString();
    const { supabase, captured } = stub([
      { id: 'canary', payload: { kind: 'canary_request' }, created_at: now },
      { id: 'untyped', payload: {}, created_at: now },
    ]);
    await drainInbox(supabase, 'adam-session');
    expect(captured.updatedIds).toBeNull();
    logSpy.mockRestore();
  });
});
