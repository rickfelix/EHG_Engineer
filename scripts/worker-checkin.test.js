// Tests for SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-2
// scripts/worker-checkin.cjs — the deterministic worker check-in handshake.
// Proves the handshake ALWAYS resolves to exactly one action and never hangs
// on a human, across resume / claimed_assignment / self_claimed / idle.

import { describe, it, expect, vi } from 'vitest';

const { extractSdFromAssignment, runCheckin, DEFAULT_IDLE_WAKEUP_SECONDS } = require('./worker-checkin.cjs');

describe('FR-2: extractSdFromAssignment', () => {
  it('prefers payload.sd_key', () => {
    expect(extractSdFromAssignment({ payload: { sd_key: 'SD-FOO-BAR-001' } })).toBe('SD-FOO-BAR-001');
  });
  it('uses available_sds[0]', () => {
    expect(extractSdFromAssignment({ payload: { available_sds: ['SD-A-B-001', 'SD-C-D-002'] } })).toBe('SD-A-B-001');
  });
  it('parses an SD key out of the subject text', () => {
    expect(extractSdFromAssignment({ subject: 'Assignment: create+build SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001', payload: {} })).toBe('SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001');
  });
  it('returns null when nothing names an SD', () => {
    expect(extractSdFromAssignment({ subject: 'no key here', payload: {} })).toBeNull();
  });
});

// Handler-based supabase stub. Each table maps to a function returning the
// terminal value; the chainable builder records filters and forwards them.
function makeStub(cfg) {
  const claimResults = cfg.claimResults || {};
  function builder(table) {
    const state = { table, op: 'select', filters: {}, payload: null };
    const chain = {
      select() { return chain; },
      insert(p) { state.op = 'insert'; state.payload = p; return chain; },
      update(p) { state.op = 'update'; state.payload = p; return chain; },
      eq(k, v) { state.filters[k] = v; return chain; },
      gte() { return chain; },
      is() { return chain; },
      order() { return chain; },
      limit() { return resolveList(); },
      maybeSingle() { return resolveSingle(); },
      single() { return resolveSingle(); },
      then(res, rej) { return Promise.resolve(resolveDefault()).then(res, rej); },
    };
    function resolveSingle() {
      if (table === 'claude_sessions') return Promise.resolve({ data: cfg.session || null, error: null });
      if (table === 'sd_baseline_items') return Promise.resolve({ data: { track: 'STANDALONE' }, error: null });
      if (table === 'session_coordination' && state.op === 'insert') return Promise.resolve({ data: { id: 'rollcall-new' }, error: null });
      return Promise.resolve({ data: null, error: null });
    }
    function resolveList() {
      if (table === 'session_coordination') {
        // recent roll_calls dedup query (sender_session filter) vs messages query (target_session)
        if ('sender_session' in state.filters) return Promise.resolve({ data: cfg.recentRollCalls || [], error: null });
        return Promise.resolve({ data: cfg.messages || [], error: null });
      }
      if (table === 'v_sd_next_candidates') return Promise.resolve({ data: cfg.candidates || [], error: null });
      return Promise.resolve({ data: [], error: null });
    }
    function resolveDefault() {
      // messages query terminates on .order() (await) — return messages
      if (table === 'session_coordination' && state.op === 'select' && 'target_session' in state.filters) {
        return { data: cfg.messages || [], error: null };
      }
      if (table === 'session_coordination' && state.op === 'update') return { data: null, error: null };
      return { data: null, error: null };
    }
    return chain;
  }
  return {
    from: vi.fn(builder),
    rpc: vi.fn((name, args) => {
      if (name === 'claim_sd') {
        const r = claimResults[args.p_sd_id];
        if (r === undefined || r === true) return Promise.resolve({ data: { success: true }, error: null });
        return Promise.resolve({ data: { success: false, error: 'claim_rejected' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
}

const noCoord = { getCoordinator: async () => null };

describe('FR-2: runCheckin deterministic resolution', () => {
  it('resume when the session already claims an SD', async () => {
    const sb = makeStub({ session: { metadata: { callsign: 'Alpha' }, sd_key: 'SD-MINE-001' } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume');
    expect(r.sd).toBe('SD-MINE-001');
    expect(r.callsign).toBe('Alpha');
  });

  it('claims a pending WORK_ASSIGNMENT via claim_sd', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null },
      messages: [{ id: 'm1', message_type: 'WORK_ASSIGNMENT', payload: { sd_key: 'SD-ASSIGNED-001' } }],
      claimResults: { 'SD-ASSIGNED-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('claimed_assignment');
    expect(r.sd).toBe('SD-ASSIGNED-001');
  });

  it('self-claims the top sd:next candidate when no assignment', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null },
      messages: [],
      candidates: [{ sd_id: 'SD-TOP-001', track: 'A' }, { sd_id: 'SD-NEXT-002', track: 'B' }],
      claimResults: { 'SD-TOP-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-TOP-001');
  });

  it('falls through to the next candidate if the top is already claimed', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null },
      messages: [],
      candidates: [{ sd_id: 'SD-TOP-001', track: 'A' }, { sd_id: 'SD-NEXT-002', track: 'B' }],
      claimResults: { 'SD-TOP-001': false, 'SD-NEXT-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-NEXT-002');
  });

  it('idles with a recommended wakeup when nothing is claimable (never asks human)', async () => {
    const sb = makeStub({ session: { metadata: {}, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
    expect(r.recommended_wakeup_seconds).toBe(DEFAULT_IDLE_WAKEUP_SECONDS);
    expect(r.ok).toBe(true);
  });
});
