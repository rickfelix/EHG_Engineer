// Tests for SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-2
// scripts/worker-checkin.cjs — the deterministic worker check-in handshake.
// Proves the handshake ALWAYS resolves to exactly one action and never hangs
// on a human, across resume / claimed_assignment / self_claimed / idle.

import { describe, it, expect, vi } from 'vitest';

const { extractSdFromAssignment, runCheckin, isAutoStartableQF, draftDepsSatisfied, baselinedCandidateEligible, recoverStrandedFinal, adoptOrphanInProgress, isSdInFlight, DEFAULT_IDLE_WAKEUP_SECONDS, STALE_QF_DAYS } = require('./worker-checkin.cjs');

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
      // parentLeadPending (SD-FDBK-INFRA-ORPHAN-ADOPT-RESUME-001) looks the parent up via
      // .or('id.eq.<ref>,sd_key.eq.<ref>'); capture the ref so resolveSingle can return the parent row.
      or(expr) { const m = /(?:id|sd_key)\.eq\.([^,]+)/.exec(String(expr || '')); if (m) state.filters.or_ref = m[1]; return chain; },
      lt(k, v) { state.filters['lt_' + k] = v; return chain; },
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
        // or_ref => parentLeadPending's parent lookup (keyed by parent id/sd_key); else the
        // isSdInFlight / resume-path lookup keyed by sd_key. Both read from cfg.sdRows.
        const key = state.filters.or_ref || state.filters.sd_key;
        return Promise.resolve({ data: (cfg.sdRows && cfg.sdRows[key]) || null, error: null });
      }
      // SD-LEO-INFRA-WORKER-CHECKIN-TEST-REGRESSION-001: the resume path (and confirmRowGone) reads
      // quick_fixes.status by id .maybeSingle() to verify a claimed QF is still resumable. Seed it via
      // cfg.qfRows so a QF resume test reflects an EXISTING quick-fix (an unseeded null would make the
      // #4943 hard-deleted self-heal treat it as gone -> idle). Mirrors the strategic_directives_v2 seam.
      if (table === 'quick_fixes') {
        return Promise.resolve({ data: (cfg.qfRows && cfg.qfRows[state.filters.id]) || null, error: null });
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
        // recoverStrandedFinal listing: .eq('status','pending_approval') sets a STRING filter
        // (the draft tier uses .in('status', [...]) -> an ARRAY). Distinguish on that to return
        // the stranded fixture; honor the .lt('updated_at', cutoff) staleness guard if provided.
        if (state.filters.status === 'pending_approval') {
          let rows = cfg.stranded || [];
          if (state.filters.lt_updated_at !== undefined) {
            rows = rows.filter((r) => !r.updated_at || r.updated_at < state.filters.lt_updated_at);
          }
          return Promise.resolve({ data: rows, error: null });
        }
        // adoptOrphanInProgress listing (SD-FDBK-INFRA-ORPHAN-ADOPTION-WORKER-001): a third
        // STRING discriminant (.eq('status','in_progress')) — placed ABOVE the draft fallthrough.
        // Honors the .lt('updated_at') age guard and the server-side .neq('sd_type') exclusion.
        if (state.filters.status === 'in_progress') {
          if (cfg.orphansThrow) return Promise.reject(new Error('orphan query failed'));
          let rows = cfg.orphans || [];
          if (state.filters.lt_updated_at !== undefined) {
            rows = rows.filter((r) => !r.updated_at || r.updated_at < state.filters.lt_updated_at);
          }
          if (state.filters.neq_sd_type !== undefined) rows = rows.filter((r) => r.sd_type !== state.filters.neq_sd_type);
          return Promise.resolve({ data: rows, error: null });
        }
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
    // sdRows seeds SD-MINE-001 as an EXISTING, non-terminal SD so the resumability check resumes it
    // (an unseeded SD would be treated as hard-deleted by the #4943 self-heal -> idle).
    const sb = makeStub({ session: { metadata: { callsign: 'Alpha' }, sd_key: 'SD-MINE-001' }, sdRows: { 'SD-MINE-001': { status: 'in_progress' } } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume');
    expect(r.sd).toBe('SD-MINE-001');
    expect(r.callsign).toBe('Alpha');
  });

  it('resume on a self-claimed QF routes to /quick-fix, NOT sd-start', async () => {
    // qfRows seeds the quick-fix as EXISTING + open so the QF resumability check resumes it.
    const sb = makeStub({ session: { metadata: {}, sd_key: 'QF-20260607-583' }, qfRows: { 'QF-20260607-583': { status: 'open' } } });
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
      // SD-FDBK-FIX-WORKER-SELF-CLAIM-001: step 6 now validates each candidate's sd_type +
      // dependencies (and current_phase via isSdInFlight) against strategic_directives_v2.
      sdRows: {
        'SD-TOP-001': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] },
        'SD-NEXT-002': { current_phase: 'LEAD', sd_type: 'feature', dependencies: [] },
      },
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
      sdRows: {
        'SD-TOP-001': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] },
        'SD-NEXT-002': { current_phase: 'LEAD', sd_type: 'feature', dependencies: [] },
      },
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

// SD-FDBK-FIX-WORKER-SELF-CLAIM-001: step-6 self_claim must NOT grab orchestrator PARENTS or
// dependency-blocked SDs from v_sd_next_candidates (the view surfaces both; claim_sd enforces
// neither). baselinedCandidateEligible re-checks sd_type + dependencies, mirroring step 6.25.
describe('SD-FDBK-FIX-WORKER-SELF-CLAIM-001: baselinedCandidateEligible gates step-6 candidates', () => {
  it('rejects an orchestrator parent (auto-completes on children — never worker-claim)', async () => {
    const sb = makeStub({ sdRows: { 'SD-ORCH-001': { sd_type: 'orchestrator', dependencies: [] } } });
    expect(await baselinedCandidateEligible(sb, 'SD-ORCH-001')).toBe(false);
  });

  it('rejects a dependency-blocked SD (a referenced dep is not completed)', async () => {
    const sb = makeStub({
      sdRows: { 'SD-CHILD-001': { sd_type: 'feature', dependencies: [{ sd_id: 'SD-PARENT-999' }] } },
      depRows: [{ sd_key: 'SD-PARENT-999', status: 'in_progress' }],
    });
    expect(await baselinedCandidateEligible(sb, 'SD-CHILD-001')).toBe(false);
  });

  it('accepts a non-orchestrator SD with all deps completed', async () => {
    const sb = makeStub({
      sdRows: { 'SD-OK-002': { sd_type: 'feature', dependencies: [{ sd_id: 'SD-DONE-001' }] } },
      depRows: [{ sd_key: 'SD-DONE-001', status: 'completed' }],
    });
    expect(await baselinedCandidateEligible(sb, 'SD-OK-002')).toBe(true);
  });

  it('accepts a non-orchestrator SD with no dependencies', async () => {
    const sb = makeStub({ sdRows: { 'SD-OK-001': { sd_type: 'bugfix', dependencies: [] } } });
    expect(await baselinedCandidateEligible(sb, 'SD-OK-001')).toBe(true);
  });

  it('conservatively rejects an SD that cannot be verified (row missing)', async () => {
    const sb = makeStub({ sdRows: {} });
    expect(await baselinedCandidateEligible(sb, 'SD-GONE-001')).toBe(false);
  });

  it('runCheckin SKIPS an orchestrator candidate and self-claims the next eligible one (even though claim_sd would accept the parent)', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null },
      messages: [],
      candidates: [{ sd_id: 'SD-ORCH-001', track: 'A' }, { sd_id: 'SD-GOOD-002', track: 'B' }],
      sdRows: {
        'SD-ORCH-001': { current_phase: 'LEAD', sd_type: 'orchestrator', dependencies: [] },
        'SD-GOOD-002': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] },
      },
      claimResults: { 'SD-ORCH-001': true, 'SD-GOOD-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-GOOD-002'); // the orchestrator parent was skipped BEFORE tryClaim
  });

  it('runCheckin SKIPS a dependency-blocked candidate and self-claims the clear one', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null },
      messages: [],
      candidates: [{ sd_id: 'SD-BLOCKED-001', track: 'A' }, { sd_id: 'SD-CLEAR-002', track: 'B' }],
      sdRows: {
        'SD-BLOCKED-001': { current_phase: 'LEAD', sd_type: 'feature', dependencies: [{ sd_id: 'SD-DEP-999' }] },
        'SD-CLEAR-002': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] },
      },
      depRows: [{ sd_key: 'SD-DEP-999', status: 'in_progress' }],
      claimResults: { 'SD-BLOCKED-001': true, 'SD-CLEAR-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-CLEAR-002'); // the dep-blocked child was skipped
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
    const sb = makeStub({ ...base, candidates: [{ sd_id: 'SD-TOP-001', track: 'A' }], sdRows: { 'SD-TOP-001': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] } }, quickFixes: [freshQF('QF-20260601-001')], claimResults: { 'SD-TOP-001': true, 'QF-20260601-001': true } });
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
      // SD-FDBK-FIX-WORKER-SELF-CLAIM-001: step 6 now validates the candidate (eligible: not an
      // orchestrator, no unmet deps, current_phase=LEAD so isSdInFlight passes).
      sdRows: { 'SD-VIEW-001': { current_phase: 'LEAD', sd_type: 'feature', dependencies: [] } },
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

// SD-FDBK-FIX-RECURRING-2ND-OCCURRENCE-001: recover SDs stranded at pending_approval/LEAD_FINAL with
// the claim cleared. Re-claiming lets a worker run LEAD-FINAL-APPROVAL with a valid matching claim,
// passing the claim-validity gate the coordinator-from-main path fails. Runs BEFORE self-claiming new
// work (finishing a near-shipped SD beats starting fresh).
describe('FIX-RECURRING-2ND: recover stranded pending_approval/LEAD_FINAL SDs', () => {
  const sess = { session: { metadata: { callsign: 'Bravo' }, sd_key: null }, messages: [] };
  const old = '2020-01-01T00:00:00Z'; // safely older than the staleness cutoff
  const strand = (sd_key, over = {}) => ({ sd_key, status: 'pending_approval', current_phase: 'LEAD_FINAL', updated_at: old, ...over });

  it('recovers a stranded LEAD_FINAL SD with action=resume_final and finish instructions', async () => {
    const sb = makeStub({ ...sess, stranded: [strand('SD-STRANDED-001')], candidates: [], claimResults: { 'SD-STRANDED-001': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_final');
    expect(r.sd).toBe('SD-STRANDED-001');
    expect(r.message).toMatch(/LEAD-FINAL-APPROVAL SD-STRANDED-001/);
    expect(r.message).toMatch(/sd-start\.js SD-STRANDED-001/);
  });

  it('recovery WINS over self-claiming new baselined work (step 5.7 before step 6)', async () => {
    const sb = makeStub({
      ...sess,
      stranded: [strand('SD-STRANDED-001')],
      candidates: [{ sd_id: 'SD-NEWWORK-001', track: 'A' }],
      drafts: [{ sd_key: 'SD-DRAFT-001', status: 'draft', sd_type: 'feature', priority: 'critical', created_at: '2026-01-01T00:00:00Z', dependencies: [] }],
      claimResults: { 'SD-STRANDED-001': true, 'SD-NEWWORK-001': true, 'SD-DRAFT-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_final');
    expect(r.sd).toBe('SD-STRANDED-001');
  });

  it('falls through to self-claim when no SD is stranded', async () => {
    const sb = makeStub({
      ...sess,
      stranded: [],
      candidates: [{ sd_id: 'SD-NEWWORK-001', track: 'A' }],
      sdRows: { 'SD-NEWWORK-001': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] } }, // baselinedCandidateEligible lookup
      claimResults: { 'SD-NEWWORK-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-NEWWORK-001');
  });

  it('falls through when the only stranded SD loses the claim race (peer recovered it)', async () => {
    const sb = makeStub({ ...sess, stranded: [strand('SD-CONTESTED-001')], candidates: [], claimResults: { 'SD-CONTESTED-001': false } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle'); // no stranded claimable + no other work
    expect(r.ok).toBe(true);
  });

  it('claims the OLDEST stranded SD first (returned updated_at-ascending)', async () => {
    const sb = makeStub({
      ...sess,
      stranded: [strand('SD-OLDEST-001', { updated_at: '2020-01-01T00:00:00Z' }), strand('SD-NEWER-002', { updated_at: '2020-06-01T00:00:00Z' })],
      candidates: [],
      claimResults: { 'SD-OLDEST-001': true, 'SD-NEWER-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_final');
    expect(r.sd).toBe('SD-OLDEST-001');
  });

  it('recoverStrandedFinal returns null (not throw) on a query error — fail-open', async () => {
    const throwingSb = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ lt: () => ({ order: () => ({ limit: () => Promise.reject(new Error('db down')) }) }) }) }) }) }),
      }),
    };
    const r = await recoverStrandedFinal(throwingSb, 'sess-1', { ok: true });
    expect(r).toBeNull();
  });
});

// SD-FDBK-INFRA-ORPHAN-ADOPTION-WORKER-001: adopt orphaned in_progress SDs (zero active claims,
// session reaped mid-build). Mirrors the stranded-final block: adoption happy path, every
// exclusion axis (orchestrator / fixture-key / human-action / live-held / young), tier ordering
// (stranded > orphan > all new-work tiers), claim-race fallthrough, fail-open, fleet naming.
describe('ORPHAN-ADOPTION: adopt zero-claim in_progress SDs (resume_orphan)', () => {
  const sess = { session: { metadata: { callsign: 'Bravo' }, sd_key: null }, messages: [] };
  const old = '2020-01-01T00:00:00Z'; // safely older than the 15-min age guard
  const orphan = (sd_key, over = {}) => ({
    sd_key, status: 'in_progress', sd_type: 'infrastructure', current_phase: 'EXEC',
    metadata: {}, updated_at: old, ...over,
  });

  it('adopts an eligible orphan with action=resume_orphan and re-attach instructions', async () => {
    const sb = makeStub({ ...sess, orphans: [orphan('SD-ORPHAN-001')], candidates: [], claimResults: { 'SD-ORPHAN-001': true } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
    expect(r.sd).toBe('SD-ORPHAN-001');
    expect(r.message).toMatch(/sd-start\.js SD-ORPHAN-001/);
    expect(r.message).toMatch(/EXEC/); // advisory phase context in the message
  });

  it('excludes an orchestrator parent (in_progress/no-claim BY DESIGN while children run)', async () => {
    const sb = makeStub({ ...sess, orphans: [orphan('SD-PARENT-001', { sd_type: 'orchestrator' })], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle'); // server-side .neq filter (honored by the stub) — never adopted
  });

  it('excludes test-fixture keys and requires_human_action SDs (shared classifier axes)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [
        orphan('SD-TEST-ORPHAN-001'),                                     // test_fixture_key axis
        orphan('SD-HUMAN-001', { metadata: { requires_human_action: true } }), // human_action axis
      ],
      candidates: [],
      claimResults: { 'SD-TEST-ORPHAN-001': true, 'SD-HUMAN-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle'); // both classifier-skipped despite being claimable
  });

  // SD-FDBK-INFRA-ORPHAN-ADOPT-RESUME-001: parent-lifecycle guard on orphan adoption. A CHILD
  // orphan whose orchestrator parent has not yet passed LEAD cannot enter EXEC, so adopting it
  // only burns PLAN cycles and re-orphans. parentLeadPending (the same predicate the self-claim +
  // draft tiers use) now gates the orphan-adopt path too. (The real fix also adds parent_sd_id to
  // the orphan query .select(...) so the guard sees the link; the stub returns full rows, so these
  // tests exercise the guard logic — the select projection is covered by PRD FR-2 + code review.)
  it('excludes a CHILD orphan whose orchestrator parent is still pre-LEAD (draft/LEAD)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-CHILD-PRELEAD-001', { parent_sd_id: 'SD-PARENT-PRELEAD-001' })],
      sdRows: { 'SD-PARENT-PRELEAD-001': { status: 'draft', current_phase: 'LEAD' } },
      candidates: [],
      claimResults: { 'SD-CHILD-PRELEAD-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle'); // parentLeadPending skips it despite being otherwise claimable
  });

  it('adopts a CHILD orphan whose parent has COMPLETED (parentLeadPending → false)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-CHILD-DONE-001', { parent_sd_id: 'SD-PARENT-DONE-001' })],
      sdRows: { 'SD-PARENT-DONE-001': { status: 'completed', current_phase: 'COMPLETED' } },
      candidates: [],
      claimResults: { 'SD-CHILD-DONE-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
    expect(r.sd).toBe('SD-CHILD-DONE-001');
  });

  it('still adopts a NON-child orphan (no parent_sd_id — the guard no-ops, no regression)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-STANDALONE-ORPHAN-001')], // no parent_sd_id
      candidates: [],
      claimResults: { 'SD-STANDALONE-ORPHAN-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
  });

  // SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-3): a lapsed/half-write claim's
  // live-foreign-holder probe now ALSO requires real WIP before refusing to adopt (a lapsed TTL
  // is necessary but not sufficient to steal -- see foreignClaimantBlocksSteal, unit-tested
  // directly in tests/unit/worker-checkin-live-claimant-wip-guard.test.js). This fixture has no
  // worktree/branch/PR data (a bare is_alive flag, no WIP evidence at all), so under the new
  // guard it is correctly treated as WIP-less and adoption proceeds -- this is the intentional
  // behavior change this SD ships, not a regression: a live-but-WIP-less half-write claim no
  // longer gets stuck unreclaimable forever.
  it('adopts an orphan a LIVE-but-WIP-less foreign session still points at (claim half-write, no WIP evidence)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-HELD-001')],
      activeSessions: [{ sd_key: 'SD-HELD-001', session_id: 'sess-OTHER', is_alive: true }],
      candidates: [],
      claimResults: { 'SD-HELD-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
  });

  it('skips an orphan younger than the age guard (mid-transition worker never raced)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-YOUNG-001', { updated_at: new Date().toISOString() })], // fresher than cutoff
      candidates: [],
      claimResults: { 'SD-YOUNG-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
  });

  it('stranded-final recovery (5.7) WINS over orphan adoption (5.8)', async () => {
    const sb = makeStub({
      ...sess,
      stranded: [{ sd_key: 'SD-STRANDED-001', status: 'pending_approval', current_phase: 'LEAD_FINAL', updated_at: old }],
      orphans: [orphan('SD-ORPHAN-001')],
      candidates: [],
      claimResults: { 'SD-STRANDED-001': true, 'SD-ORPHAN-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_final');
    expect(r.sd).toBe('SD-STRANDED-001');
  });

  it('orphan adoption WINS over baselined / draft / QF self-claim (5.8 before 6/6.25/6.5)', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-ORPHAN-001')],
      candidates: [{ sd_id: 'SD-NEWWORK-001', track: 'A' }],
      drafts: [{ sd_key: 'SD-DRAFT-001', status: 'draft', sd_type: 'feature', priority: 'critical', created_at: '2026-01-01T00:00:00Z', dependencies: [] }],
      quickFixes: [{ id: 'QF-20260601-001', status: 'open', created_at: new Date().toISOString() }],
      claimResults: { 'SD-ORPHAN-001': true, 'SD-NEWWORK-001': true, 'SD-DRAFT-001': true, 'QF-20260601-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
    expect(r.sd).toBe('SD-ORPHAN-001');
  });

  it('falls through to the next candidate when the first orphan loses the claim race', async () => {
    const sb = makeStub({
      ...sess,
      orphans: [orphan('SD-CONTESTED-001'), orphan('SD-ORPHAN-002', { updated_at: '2020-06-01T00:00:00Z' })],
      candidates: [],
      claimResults: { 'SD-CONTESTED-001': false, 'SD-ORPHAN-002': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
    expect(r.sd).toBe('SD-ORPHAN-002');
  });

  it('adoptOrphanInProgress returns null (not throw) on a query error — fail-open', async () => {
    const sb = makeStub({ ...sess, orphansThrow: true, candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.ok).toBe(true);
    expect(r.action).toBe('idle'); // error swallowed; resolver fell through, never action=error
    const direct = await adoptOrphanInProgress(makeStub({ orphansThrow: true }), 'sess-1', { ok: true });
    expect(direct).toBeNull();
  });

  it('runCheckin names an UNNAMED worker on resume_orphan (CLAIMED_CHECKIN_ACTIONS coverage)', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null }, messages: [],
      orphans: [orphan('SD-ORPHAN-001')], candidates: [],
      claimResults: { 'SD-ORPHAN-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume_orphan');
    expect(r.callsign).toBe('Alpha'); // named at check-in, same response
  });
});

// SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001: runCheckin names a freshly-claimed, identity-less worker
// AT check-in (closing the up-to-5-min lag before the assign-fleet-identities.cjs cron). The naming
// is a fail-open wrapper over the resolution logic, so it must (a) name across every claim path,
// (b) leave already-named workers untouched, and (c) never name an idle worker.
describe('SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001: runCheckin names a freshly-claimed worker', () => {
  it('names an UNNAMED worker on resume (live used-set empty -> Alpha)', async () => {
    const sb = makeStub({ session: { metadata: {}, sd_key: 'SD-MINE-001' }, sdRows: { 'SD-MINE-001': { status: 'in_progress' } } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume');
    expect(r.sd).toBe('SD-MINE-001');
    expect(r.callsign).toBe('Alpha'); // assigned at check-in, reported in the same response
  });

  it('does NOT rename an already-named worker (idempotent)', async () => {
    const sb = makeStub({ session: { metadata: { callsign: 'Delta' }, sd_key: 'SD-MINE-001' }, sdRows: { 'SD-MINE-001': { status: 'in_progress' } } });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('resume');
    expect(r.callsign).toBe('Delta'); // unchanged — naming branch skipped because a callsign already exists
  });

  it('names a worker that self-claims an SD on this check-in', async () => {
    const sb = makeStub({
      session: { metadata: {}, sd_key: null },
      messages: [],
      candidates: [{ sd_id: 'SD-TOP-001', track: 'A' }],
      sdRows: { 'SD-TOP-001': { current_phase: 'LEAD', sd_type: 'bugfix', dependencies: [] } },
      claimResults: { 'SD-TOP-001': true },
    });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('self_claimed');
    expect(r.sd).toBe('SD-TOP-001');
    expect(r.callsign).toBe('Alpha'); // named immediately on first claim, not one cycle later
  });

  it('names a worker on ARRIVAL even when it idles (SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 FR-1)', async () => {
    const sb = makeStub({ session: { metadata: {}, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
    expect(r.callsign).toBe('Alpha'); // FR-1: naming is an arrival property, not a reward for holding a claim
  });
});

describe('SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001: name on arrival + preserved exclusions', () => {
  it('FR-2: an already-named idle worker keeps its name (idempotent, no rename)', async () => {
    const sb = makeStub({ session: { metadata: { fleet_identity: { callsign: 'Delta', color: 'red' } }, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
    expect(r.callsign).toBe('Delta'); // surfaced by resolveCheckin -> naming branch skipped
  });

  it('FR-4: a coordinator session stays nameless on an idle check-in', async () => {
    const sb = makeStub({ session: { metadata: { is_coordinator: true }, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.action).toBe('idle');
    expect(r.callsign).toBeFalsy(); // coordinators never join the worker name pool
  });

  it('FR-4: an Adam role session stays nameless on an idle check-in', async () => {
    const sb = makeStub({ session: { metadata: { role: 'adam' }, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.callsign).toBeFalsy(); // role sessions run the fleet; they are not worker-pool members
  });

  it('FR-4: a Solomon role session stays nameless on an idle check-in', async () => {
    const sb = makeStub({ session: { metadata: { role: 'solomon' }, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'sess-1', noCoord);
    expect(r.callsign).toBeFalsy();
  });

  it('FR-4: a probe fixture id the narrow isTestSessionId misses stays nameless (isFixtureSession superset)', async () => {
    const sb = makeStub({ session: { metadata: {}, sd_key: null }, messages: [], candidates: [] });
    const r = await runCheckin(sb, 'qf-route-probe-A', noCoord);
    expect(r.callsign).toBeFalsy(); // *-probe-* is caught by the shared isFixtureSession superset, not isTestSessionId
  });
});

// ── duty-6 (operator 2026-06-10): coordinator dispatch-rank ordering in self-claim ──
const { orderByRankMap, sortByDispatchRank, DISPATCH_RANK_TTL_MS } = require('./worker-checkin.cjs');

describe('duty-6: orderByRankMap (pure) — coordinator dispatch-rank ordering', () => {
  const items = [{ sd_id: 'A' }, { sd_id: 'B' }, { sd_id: 'C' }];
  const keyOf = (x) => x.sd_id;

  it('orders by rank ascending; unranked sink below ranked, keeping relative order', () => {
    const m = new Map([['C', 1], ['A', 2]]);
    expect(orderByRankMap(items, keyOf, m).map(keyOf)).toEqual(['C', 'A', 'B']);
  });

  it('empty/absent rank map returns the original order (no-op)', () => {
    expect(orderByRankMap(items, keyOf, new Map()).map(keyOf)).toEqual(['A', 'B', 'C']);
    expect(orderByRankMap(items, keyOf, null).map(keyOf)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the input array', () => {
    const m = new Map([['C', 1]]);
    orderByRankMap(items, keyOf, m);
    expect(items.map(keyOf)).toEqual(['A', 'B', 'C']);
  });
});

describe('duty-6: sortByDispatchRank — fresh ranks honored, stale ignored, fail-open', () => {
  const mkSb = (rows) => ({
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: rows }) }) }),
  });
  const items = [{ sd_id: 'A' }, { sd_id: 'B' }];
  const keyOf = (x) => x.sd_id;

  it('orders by a FRESH dispatch_rank', async () => {
    const fresh = new Date().toISOString();
    const sb = mkSb([
      { sd_key: 'A', metadata: { dispatch_rank: 2, dispatch_rank_at: fresh } },
      { sd_key: 'B', metadata: { dispatch_rank: 1, dispatch_rank_at: fresh } },
    ]);
    expect((await sortByDispatchRank(sb, items, keyOf)).map(keyOf)).toEqual(['B', 'A']);
  });

  it('ignores a STALE rank (older than TTL) — original order stands', async () => {
    const stale = new Date(Date.now() - DISPATCH_RANK_TTL_MS - 60000).toISOString();
    const sb = mkSb([
      { sd_key: 'A', metadata: { dispatch_rank: 2, dispatch_rank_at: stale } },
      { sd_key: 'B', metadata: { dispatch_rank: 1, dispatch_rank_at: stale } },
    ]);
    expect((await sortByDispatchRank(sb, items, keyOf)).map(keyOf)).toEqual(['A', 'B']);
  });

  it('fail-open: a throwing client returns the original order', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    expect((await sortByDispatchRank(sb, items, keyOf)).map(keyOf)).toEqual(['A', 'B']);
  });

  it('short-circuits on <2 items without querying', async () => {
    const sb = { from: () => { throw new Error('should not be called'); } };
    expect((await sortByDispatchRank(sb, [{ sd_id: 'A' }], keyOf)).map(keyOf)).toEqual(['A']);
  });
});
