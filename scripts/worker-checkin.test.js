// Tests for SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-2
// scripts/worker-checkin.cjs — the deterministic worker check-in handshake.
// Proves the handshake ALWAYS resolves to exactly one action and never hangs
// on a human, across resume / claimed_assignment / self_claimed / idle.

import { describe, it, expect, vi } from 'vitest';

const { extractSdFromAssignment, runCheckin, selfClaimQuickFix, isAutoStartableQF, selfClaimDraftSd, draftDepsSatisfied, isSdInFlight, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS } = require('./worker-checkin.cjs');

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
      in(k, v) { state.filters[k] = v; return chain; },
      neq(k, v) { state.filters['neq_' + k] = v; return chain; },
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
      // isSdInFlight (a): SELECT current_phase ... WHERE sd_key=? .maybeSingle()
      if (table === 'strategic_directives_v2') {
        if (cfg.inFlightThrow) return Promise.reject(new Error('isSdInFlight query failed'));
        return Promise.resolve({ data: (cfg.sdRows && cfg.sdRows[state.filters.sd_key]) || null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
    function resolveList() {
      if (table === 'session_coordination') {
        // recent roll_calls dedup query (sender_session filter) vs messages query (target_session)
        if ('sender_session' in state.filters) return Promise.resolve({ data: cfg.recentRollCalls || [], error: null });
        return Promise.resolve({ data: cfg.messages || [], error: null });
      }
      if (table === 'v_sd_next_candidates') return Promise.resolve({ data: cfg.candidates || [], error: null });
      if (table === 'strategic_directives_v2') {
        // un-baselined-draft self-claim listing; honor the server-side `.neq('sd_type', …)` filter
        // so the orchestrator-parent exclusion is genuinely exercised by the stub.
        let rows = cfg.drafts || [];
        if (state.filters.neq_sd_type !== undefined) rows = rows.filter((r) => r.sd_type !== state.filters.neq_sd_type);
        return Promise.resolve({ data: rows, error: null });
      }
      if (table === 'quick_fixes') {
        if (cfg.quickFixesThrow) return Promise.reject(new Error('quick_fixes query failed'));
        return Promise.resolve({ data: cfg.quickFixes || [], error: null });
      }
      // isSdInFlight (b): live foreign session on this sd_key (eq sd_key, neq session_id, eq is_alive=true)
      if (table === 'v_active_sessions') {
        const rows = (cfg.activeSessions || []).filter((r) =>
          r.sd_key === state.filters.sd_key &&
          r.session_id !== state.filters.neq_session_id &&
          r.is_alive === true);
        return Promise.resolve({ data: rows, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }
    function resolveDefault() {
      // messages query terminates on .order() (await) — return messages
      if (table === 'session_coordination' && state.op === 'select' && 'target_session' in state.filters) {
        return { data: cfg.messages || [], error: null };
      }
      if (table === 'session_coordination' && state.op === 'update') return { data: null, error: null };
      // draftDepsSatisfied dep-check: SELECT sd_key,status WHERE sd_key IN (refKeys), awaited directly.
      if (table === 'strategic_directives_v2') return { data: cfg.depRows || [], error: null };
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

// SD-FDBK-FEAT-WORKER-CHECKIN-SELF-001: un-baselined draft SDs are self-claimable between the
// baselined view loop (step 6) and the QF tier (step 6.5). v_sd_next_candidates is built from
// sd_baseline_items, so newly-created draft SDs are invisible to step 6; this tier reads them
// directly from strategic_directives_v2, dep-checks them, and claims one.
describe('SELF-001: un-baselined draft self-claim tier', () => {
  const sess = { session: { metadata: { callsign: 'Bravo' }, sd_key: null }, messages: [] };
  const draft = (sd_key, over = {}) => ({ sd_key, status: 'draft', sd_type: 'feature', priority: 'medium', created_at: '2026-01-01T00:00:00Z', dependencies: [], ...over });

  it('self-claims an un-baselined draft when the baselined view is empty', async () => {
    const sb = makeStub({ ...sess, candidates: [], drafts: [draft('SD-DRAFT-001')], depRows: [], claimResults: { 'SD-DRAFT-001': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-DRAFT-001');
    expect(r.message).toMatch(/un-baselined draft/i);
    expect(r.message).toMatch(/sd-start\.js SD-DRAFT-001/);
  });

  it('a baselined view candidate WINS over an un-baselined draft (step 6 before 6.25)', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [{ sd_id: 'SD-VIEW-001', track: 'A' }],
      drafts: [draft('SD-DRAFT-001', { priority: 'critical' })],
      claimResults: { 'SD-VIEW-001': true, 'SD-DRAFT-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-VIEW-001');
  });

  it('a draft self-claim beats the QF tier (6.25 before 6.5)', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [],
      drafts: [draft('SD-DRAFT-001')],
      quickFixes: [freshQF('QF-X')],
      claimResults: { 'SD-DRAFT-001': true, 'QF-X': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-DRAFT-001');
  });

  it('orchestrator PARENTS are never offered (server-side neq filter), even at higher priority', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [],
      drafts: [
        draft('SD-PARENT-001', { sd_type: 'orchestrator', priority: 'critical', created_at: '2026-01-01T00:00:00Z' }),
        draft('SD-CHILD-FEAT-002', { sd_type: 'feature', priority: 'low', created_at: '2026-01-02T00:00:00Z' }),
      ],
      claimResults: { 'SD-PARENT-001': true, 'SD-CHILD-FEAT-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-CHILD-FEAT-002');
  });

  it('claims a higher-priority draft first (critical before high), regardless of created_at', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [],
      // query returns created_at-ascending; the JS priority sort must promote the critical one.
      drafts: [
        draft('SD-HIGH-001', { priority: 'high', created_at: '2026-01-01T00:00:00Z' }),
        draft('SD-CRIT-002', { priority: 'critical', created_at: '2026-01-02T00:00:00Z' }),
      ],
      claimResults: { 'SD-HIGH-001': true, 'SD-CRIT-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-CRIT-002');
  });

  it('skips a dependency-blocked draft and claims the next satisfiable one', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [],
      drafts: [
        draft('SD-BLOCKED-001', { priority: 'high', created_at: '2026-01-01T00:00:00Z', dependencies: [{ sd_id: 'SD-DEP-X' }] }),
        draft('SD-FREE-002', { priority: 'high', created_at: '2026-01-02T00:00:00Z', dependencies: [] }),
      ],
      depRows: [{ sd_key: 'SD-DEP-X', status: 'in_progress' }], // NOT completed -> blocks SD-BLOCKED-001
      claimResults: { 'SD-BLOCKED-001': true, 'SD-FREE-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-FREE-002');
  });

  it('claims a draft whose dependency IS completed', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [],
      drafts: [draft('SD-DEP-OK-001', { dependencies: [{ sd_id: 'SD-DONE-X' }] })],
      depRows: [{ sd_key: 'SD-DONE-X', status: 'completed' }],
      claimResults: { 'SD-DEP-OK-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-DEP-OK-001');
  });

  it('falls through to idle when no draft is claimable (all races lost)', async () => {
    const sb = makeStub({
      ...sess,
      candidates: [],
      drafts: [draft('SD-CONTESTED-001')],
      depRows: [],
      claimResults: { 'SD-CONTESTED-001': false }, // a peer won the claim race
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
    expect(r.ok).toBe(true);
  });
});

describe('SELF-001: draftDepsSatisfied dependency-shape handling', () => {
  it('treats an empty dependency list as satisfied (no query)', async () => {
    const sb = makeStub({ depRows: [] });
    expect(await draftDepsSatisfied(sb, { dependencies: [] })).toBe(true);
    expect(await draftDepsSatisfied(sb, {})).toBe(true); // missing/null dependencies
  });

  it('resolves text, {sd_id}, and {sd_key} dep shapes and requires ALL completed', async () => {
    const sb = makeStub({ depRows: [{ sd_key: 'SD-TEXT-001', status: 'completed' }, { sd_key: 'SD-OBJ-002', status: 'completed' }, { sd_key: 'SD-KEY-003', status: 'completed' }] });
    const deps = ['SD-TEXT-001 needs the API', { sd_id: 'SD-OBJ-002' }, { sd_key: 'SD-KEY-003' }];
    expect(await draftDepsSatisfied(sb, { dependencies: deps })).toBe(true);
  });

  it('returns false when ANY referenced dep is not completed', async () => {
    const sb = makeStub({ depRows: [{ sd_key: 'SD-A-001', status: 'completed' }, { sd_key: 'SD-B-002', status: 'in_progress' }] });
    expect(await draftDepsSatisfied(sb, { dependencies: [{ sd_id: 'SD-A-001' }, { sd_id: 'SD-B-002' }] })).toBe(false);
  });

  it('ignores the "none" sentinel and free-form non-SD notes (non-blocking)', async () => {
    const sb = makeStub({ depRows: [] }); // no SD rows; should still be satisfied
    const deps = [{ sd_key: 'none' }, { sd_key: 'None' }, { type: 'note', status: 'pending', dependency: 'design review' }];
    expect(await draftDepsSatisfied(sb, { dependencies: deps })).toBe(true);
  });
});

// SD-FDBK-FIX-SELF-CLAIM-DEDUP-001: self_claim must not duplicate an in-flight SD.
describe('FIX-DEDUP: isSdInFlight predicate', () => {
  it('true when the SD is past LEAD (started — phase only advances on an accepted handoff)', async () => {
    const sb = makeStub({ sdRows: { 'SD-X-001': { current_phase: 'EXEC' } } });
    expect(await isSdInFlight(sb, 'SD-X-001', 'me')).toBe(true);
  });
  it('false for a fresh LEAD draft with no live foreign session', async () => {
    const sb = makeStub({ sdRows: { 'SD-X-001': { current_phase: 'LEAD' } }, activeSessions: [] });
    expect(await isSdInFlight(sb, 'SD-X-001', 'me')).toBe(false);
  });
  it('false when current_phase=LEAD even though a first handoff was rejected (uses phase, not raw handoff presence)', async () => {
    const sb = makeStub({ sdRows: { 'SD-X-001': { current_phase: 'LEAD' } } });
    expect(await isSdInFlight(sb, 'SD-X-001', 'me')).toBe(false);
  });
  it('true when a LIVE foreign session already holds the SD', async () => {
    const sb = makeStub({ sdRows: { 'SD-X-001': { current_phase: 'LEAD' } }, activeSessions: [{ sd_key: 'SD-X-001', session_id: 'other', is_alive: true }] });
    expect(await isSdInFlight(sb, 'SD-X-001', 'me')).toBe(true);
  });
  it('false when only MY OWN session is live on it (not a foreign holder)', async () => {
    const sb = makeStub({ sdRows: { 'SD-X-001': { current_phase: 'LEAD' } }, activeSessions: [{ sd_key: 'SD-X-001', session_id: 'me', is_alive: true }] });
    expect(await isSdInFlight(sb, 'SD-X-001', 'me')).toBe(false);
  });
  it('false (fail-open) when the guard query throws', async () => {
    const sb = makeStub({ inFlightThrow: true });
    expect(await isSdInFlight(sb, 'SD-X-001', 'me')).toBe(false);
  });
});

describe('FIX-DEDUP: runCheckin skips in-flight SDs in BOTH self-claim tiers', () => {
  const base = { session: { metadata: {}, sd_key: null }, messages: [] };
  it('step 6 (v_sd_next_candidates): skips a past-LEAD candidate and claims the next fresh one', async () => {
    const sb = makeStub({ ...base,
      candidates: [{ sd_id: 'SD-INFLIGHT-001', track: 'A' }, { sd_id: 'SD-FRESH-002', track: 'B' }],
      sdRows: { 'SD-INFLIGHT-001': { current_phase: 'EXEC' }, 'SD-FRESH-002': { current_phase: 'LEAD' } },
      claimResults: { 'SD-INFLIGHT-001': true, 'SD-FRESH-002': true },
    });
    const r = await runCheckin(sb, 'me', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-FRESH-002'); // the claimable-but-in-flight top candidate was skipped
  });
  it('selfClaimDraftSd: skips a live-foreign-held draft and claims the next free one', async () => {
    const sb = makeStub({ ...base,
      candidates: [],
      drafts: [
        { sd_key: 'SD-DRAFT-LIVE-001', status: 'draft', sd_type: 'feature', priority: 'high', dependencies: [] },
        { sd_key: 'SD-DRAFT-FREE-002', status: 'draft', sd_type: 'feature', priority: 'high', dependencies: [] },
      ],
      sdRows: { 'SD-DRAFT-LIVE-001': { current_phase: 'LEAD' }, 'SD-DRAFT-FREE-002': { current_phase: 'LEAD' } },
      activeSessions: [{ sd_key: 'SD-DRAFT-LIVE-001', session_id: 'other', is_alive: true }],
      claimResults: { 'SD-DRAFT-LIVE-001': true, 'SD-DRAFT-FREE-002': true },
    });
    const r = await runCheckin(sb, 'me', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-DRAFT-FREE-002');
  });
});
