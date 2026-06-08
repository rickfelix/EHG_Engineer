// Tests for SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-2
// scripts/worker-checkin.cjs — the deterministic worker check-in handshake.
// Proves the handshake ALWAYS resolves to exactly one action and never hangs
// on a human, across resume / claimed_assignment / self_claimed / idle.

import { describe, it, expect, vi } from 'vitest';

const { extractSdFromAssignment, runCheckin, selfClaimQuickFix, isAutoStartableQF, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS } = require('./worker-checkin.cjs');

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
      if (table === 'quick_fixes') {
        if (cfg.quickFixesThrow) return Promise.reject(new Error('quick_fixes query failed'));
        return Promise.resolve({ data: cfg.quickFixes || [], error: null });
      }
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

  it('resume on a self-claimed QF routes to /quick-fix, NOT sd-start', async () => {
    const sb = makeStub({ session: { metadata: {}, sd_key: 'QF-20260607-583' } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume');
    expect(r.sd).toBe('QF-20260607-583');
    expect(r.message).toMatch(/quick-fix/i);
    expect(r.message).toMatch(/read-quick-fix\.js QF-20260607-583/);
    // must NOT use the SD-resume phrasing (which tells the worker to sd-start/re-attach a worktree)
    expect(r.message).not.toMatch(/re\)?attach the worktree/i);
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

// SD-LEO-INFRA-MAKE-OPEN-QFS-001: open quick_fixes are self-claimable below the SD tier.
const DAY = 24 * 60 * 60 * 1000;
const freshQF = (id, over = {}) => ({ id, status: 'open', pr_url: null, commit_sha: null, created_at: new Date(Date.now() - 1 * DAY).toISOString(), ...over });

describe('QF self-claim: isAutoStartableQF predicate (FR-2)', () => {
  it('accepts an open, fresh, no-pr/commit QF', () => {
    expect(isAutoStartableQF(freshQF('QF-1'), Date.now())).toBe(true);
  });
  it('rejects a non-open QF', () => {
    expect(isAutoStartableQF(freshQF('QF-1', { status: 'in_progress' }), Date.now())).toBe(false);
  });
  it('rejects a QF that already has a pr_url or commit_sha (verify-first / merge-race guard)', () => {
    expect(isAutoStartableQF(freshQF('QF-1', { pr_url: 'http://x' }), Date.now())).toBe(false);
    expect(isAutoStartableQF(freshQF('QF-1', { commit_sha: 'abc123' }), Date.now())).toBe(false);
  });
  it('rejects a stale QF older than STALE_QF_DAYS', () => {
    const old = freshQF('QF-1', { created_at: new Date(Date.now() - (STALE_QF_DAYS + 1) * DAY).toISOString() });
    expect(isAutoStartableQF(old, Date.now())).toBe(false);
  });
  it('rejects a persisted Tier-3 QF (routing_tier>=3 -> full SD, not auto-QF)', () => {
    expect(isAutoStartableQF(freshQF('QF-1', { routing_tier: 3 }), Date.now())).toBe(false);
    expect(isAutoStartableQF(freshQF('QF-1', { routing_tier: 1 }), Date.now())).toBe(true);
  });
  it('rejects a risk-keyword title (untriaged Tier-3 drift), accepts a benign one', () => {
    expect(isAutoStartableQF(freshQF('QF-1', { title: 'Fix the auth token migration' }), Date.now())).toBe(false);
    expect(isAutoStartableQF(freshQF('QF-1', { title: 'rotate payment credentials' }), Date.now())).toBe(false);
    expect(isAutoStartableQF(freshQF('QF-1', { title: 'Tidy a docs typo' }), Date.now())).toBe(true);
  });
  it('rejects a QF with a missing/invalid created_at', () => {
    expect(isAutoStartableQF(freshQF('QF-1', { created_at: null }), Date.now())).toBe(false);
    expect(isAutoStartableQF(null, Date.now())).toBe(false);
  });
});

describe('QF self-claim: runCheckin QF tier (FR-1/3/4/6)', () => {
  const base = { session: { metadata: {}, sd_key: null }, messages: [] };

  it('self-claims an open fresh QF when no SD is claimable, routing to the /quick-fix workflow', async () => {
    const sb = makeStub({ ...base, candidates: [], quickFixes: [freshQF('QF-20260601-001')], claimResults: { 'QF-20260601-001': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed_qf');
    expect(r.qf).toBe('QF-20260601-001');
    expect(r.message).toMatch(/read-quick-fix\.js/);
    expect(r.message).toMatch(/complete-quick-fix\.js/);
    expect(r.message).toMatch(/Do NOT run sd-start\.js/i);  // explicit guard: never route a QF into sd-start
  });

  it('ALWAYS prefers a claimable SD over a QF (QF tier never reached)', async () => {
    const sb = makeStub({ ...base, candidates: [{ sd_id: 'SD-TOP-001', track: 'A' }], quickFixes: [freshQF('QF-20260601-001')], claimResults: { 'SD-TOP-001': true, 'QF-20260601-001': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-TOP-001');
    expect(r.qf).toBeUndefined();
  });

  it('skips stale and pr/commit QFs, then idles', async () => {
    const sb = makeStub({ ...base, candidates: [], quickFixes: [
      freshQF('QF-OLD', { created_at: new Date(Date.now() - (STALE_QF_DAYS + 2) * DAY).toISOString() }),
      freshQF('QF-HASPR', { pr_url: 'http://pr' }),
    ] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
  });

  it('skips a foreign-held QF (claim_sd refuses) to the next claimable QF', async () => {
    const sb = makeStub({ ...base, candidates: [], quickFixes: [freshQF('QF-HELD'), freshQF('QF-FREE')], claimResults: { 'QF-HELD': false, 'QF-FREE': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed_qf');
    expect(r.qf).toBe('QF-FREE');
  });

  it('skips a persisted Tier-3 / risk-keyword QF and idles (re-triage parity)', async () => {
    const sb = makeStub({ ...base, candidates: [], quickFixes: [
      freshQF('QF-T3', { routing_tier: 3 }),
      freshQF('QF-RISK', { title: 'rotate database credentials' }),
    ] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
  });

  it('fails open to idle when the quick_fixes query throws (SD/idle contract intact)', async () => {
    const sb = makeStub({ ...base, candidates: [], quickFixesThrow: true });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
    expect(r.ok).toBe(true);
  });

  it('claims the first eligible QF in the returned (created_at ascending) order', async () => {
    const sb = makeStub({ ...base, candidates: [], quickFixes: [freshQF('QF-OLDEST'), freshQF('QF-NEWER')], claimResults: { 'QF-OLDEST': true, 'QF-NEWER': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.qf).toBe('QF-OLDEST');
  });
});
