// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1/FR-3/FR-6) — Adam-singleton tests.
// Hermetic: no live DB (injected supabase stub), no real time (nowMs injected). Validates the
// deterministic election (mirror of the coordinator), the fail-open resolvers, the single-Adam
// guard's deliberate refuse-new-on-fresh-prior divergence, and the pure MULTIPLE_ADAMS detector.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const adam = require('../../../lib/coordinator/adam-identity.cjs');
const { detectMultipleAdams, runDetectors } = require('../../../lib/coordinator/detectors.cjs');
const { registerAdam } = require('../../../scripts/adam-register.cjs');

const NOW = Date.parse('2026-06-15T16:00:00.000Z');
const fresh = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString();

describe('pickCanonicalAdam (deterministic election, mirror of coordinator)', () => {
  it('picks adam_since DESC, NULLS LAST, then session_id ASC', () => {
    const rows = [
      { session_id: 'z', metadata: { adam_since: '2026-06-15T10:00:00Z' } },
      { session_id: 'a', metadata: { adam_since: '2026-06-15T12:00:00Z' } }, // newest
      { session_id: 'b', metadata: {} },                                      // null since -> last
    ];
    expect(adam.pickCanonicalAdam(rows).session_id).toBe('a');
  });
  it('session_id ASC tiebreak when adam_since ties', () => {
    const rows = [
      { session_id: 'm', metadata: { adam_since: '2026-06-15T12:00:00Z' } },
      { session_id: 'd', metadata: { adam_since: '2026-06-15T12:00:00Z' } },
    ];
    expect(adam.pickCanonicalAdam(rows).session_id).toBe('d');
  });
  it('returns null for empty/garbage', () => {
    expect(adam.pickCanonicalAdam([])).toBeNull();
    expect(adam.pickCanonicalAdam(null)).toBeNull();
    expect(adam.pickCanonicalAdam([{ no_session: true }])).toBeNull();
  });
});

// supabase stub: the election query is .from().select().gte().filter() — FR-6 (count-truncation
// discipline) paginates it via fetchAllPaginated, so the chain now ends .order(...).range(from, to).
function stub(rows, { error = null } = {}) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        gte() { return chain; },
        filter() { return chain; },
        order() { return chain; },
        range(from, to) {
          if (error) return Promise.resolve({ data: null, error });
          return Promise.resolve({ data: (rows || []).slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
}

describe('electAdamFromDb / getActiveAdamId / countFreshAdams (fail-open)', () => {
  it('elects the canonical Adam from fresh rows', async () => {
    const sb = stub([
      { session_id: 'old', heartbeat_at: fresh(1), metadata: { role: 'adam', adam_since: '2026-06-15T09:00:00Z' } },
      { session_id: 'new', heartbeat_at: fresh(1), metadata: { role: 'adam', adam_since: '2026-06-15T11:00:00Z' } },
    ]);
    expect(await adam.electAdamFromDb(sb, { nowMs: NOW })).toBe('new');
    expect(await adam.getActiveAdamId(sb, { nowMs: NOW })).toBe('new');
    expect(await adam.countFreshAdams(sb, { nowMs: NOW })).toBe(2);
  });
  it('FAILS OPEN: null/empty on error, no throw', async () => {
    const sbErr = stub(null, { error: { message: 'boom' } });
    expect(await adam.electAdamFromDb(sbErr, { nowMs: NOW })).toBeNull();
    expect(await adam.countFreshAdams(sbErr, { nowMs: NOW })).toBe(0);
    expect(await adam.electAdamFromDb(null)).toBeNull(); // no client
  });
});

describe('decideSingleAdamGuard (refuse-new-on-fresh-prior divergence)', () => {
  const self = 'self-sess';
  it('REFUSES when a FRESH prior Adam exists (never clears a restarting Adam)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'prior', heartbeat_at: fresh(2) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
    expect(d.retire).toEqual([]);
    expect(d.freshPriors).toEqual(['prior']);
  });
  it('RETIRES only a STALE prior, then registers self', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'stale', heartbeat_at: fresh(999) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retire).toEqual(['stale']);
  });
  it('REGISTERS when no other Adam (self excluded)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: self, heartbeat_at: fresh(1) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('register');
    expect(d.retire).toEqual([]);
  });
  it('mixed fresh + stale priors => REFUSE (a fresh prior dominates; never clear it)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'freshp', heartbeat_at: fresh(1) }, { session_id: 'stalep', heartbeat_at: fresh(999) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
  });
  it('multiple FRESH priors => REFUSE with retire=[] (none cleared)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'f1', heartbeat_at: fresh(1) }, { session_id: 'f2', heartbeat_at: fresh(2) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
    expect(d.retire).toEqual([]);
    expect(d.freshPriors.sort()).toEqual(['f1', 'f2']);
  });
  it('null heartbeat_at prior => classified stale => retired (anomalous never-heartbeated adam)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'nullhb', heartbeat_at: null }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retire).toEqual(['nullhb']);
  });
});

describe('detectMultipleAdams (pure, mirror of detectSplitBrain)', () => {
  it('matches when adamCount > 1', () => {
    const r = detectMultipleAdams({ adamCount: 2, adams: [{ session_id: 'a' }, { session_id: 'b' }] });
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('multiple_live_adams');
    expect(r.evidence.adam_count).toBe(2);
  });
  it('no match for 0/1', () => {
    expect(detectMultipleAdams({ adamCount: 1 }).matched).toBe(false);
    expect(detectMultipleAdams({}).matched).toBe(false);
  });
  it('runDetectors surfaces MULTIPLE_ADAMS as a critical event', () => {
    const events = runDetectors({ adamCount: 3 }, { now: NOW });
    const ev = events.find((e) => e.event_type === 'MULTIPLE_ADAMS');
    expect(ev).toBeTruthy();
    expect(ev.severity).toBe('critical');
  });
});

// registerAdam is a STATEFUL stub — set_adam_flag / the JS-merge fallback actually mutate the
// tracked row (existence + metadata) so the post-write FR-2 readback sees the real effect of
// whichever write path fired, exactly like a live Postgres row would. Only writes targeting
// `selfSessionId` mutate the tracked row; a retire-fallback update targeting a stale PRIOR
// session_id is correctly a no-op here (it mutates a different row in reality).
function regStub({ selfSessionId = 'self', selfMeta = null, rowExists = true, allAdams = [], rpcError = null, drainRows = [] } = {}) {
  const calls = { update: 0, insert: 0, rpc: [], drainSelect: 0 };
  let currentRowExists = rowExists;
  let currentMeta = selfMeta;
  const supabase = {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        filter() { return chain; }, // fetchAllAdams — FR-6: now paginated, resolves via .range below
        order() { return chain; },
        range(from, to) { return Promise.resolve({ data: allAdams.slice(from, to + 1), error: null }); },
        maybeSingle() {
          return Promise.resolve({
            data: currentRowExists ? { session_id: selfSessionId, metadata: currentMeta } : null,
            error: null,
          });
        },
        insert(payload) {
          calls.insert += 1;
          if (payload && payload.session_id === selfSessionId) {
            currentRowExists = true;
            currentMeta = payload.metadata;
          }
          return Promise.resolve({ error: null });
        },
        update(payload) {
          calls.update += 1;
          const uchain = {
            eq(_col, val) {
              if (val === selfSessionId) { currentRowExists = true; currentMeta = payload.metadata; }
              return Promise.resolve({ error: null });
            },
            in() { return uchain; }, is() { return uchain; }, gte() { return uchain; },
            select() { calls.drainSelect += 1; return Promise.resolve({ data: drainRows, error: null }); }, // drain
          };
          return uchain;
        },
      };
      return chain;
    },
    rpc(fn, args) {
      calls.rpc.push({ fn, args });
      if (fn === 'set_adam_flag' && !rpcError && args && args.p_session_id === selfSessionId) {
        currentRowExists = true;
        currentMeta = { ...(currentMeta || {}), role: 'adam', non_fleet: true, adam_since: 'test' };
      }
      return Promise.resolve({ error: rpcError });
    },
  };
  return { supabase, calls };
}

describe('registerAdam (single-Adam guard, unconditional RPC-first upsert — SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001)', () => {
  it('a FRESH prior Adam => REFUSED (no write, prior not cleared)', async () => {
    const { supabase, calls } = regStub({ allAdams: [{ session_id: 'prior', heartbeat_at: fresh(1), metadata: { role: 'adam' } }] });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: false, action: 'refused' });
    expect(r.fresh_priors).toEqual(['prior']);
    expect(calls.rpc).toHaveLength(0); // never clears the fresh prior, never writes
    expect(calls.update).toBe(0);
  });

  it('no prior + RPC works => tagged via set_adam_flag (atomic, no JS update)', async () => {
    const { supabase, calls } = regStub({ allAdams: [], rpcError: null });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged' });
    expect(calls.rpc.map((c) => c.fn)).toContain('set_adam_flag');
    expect(calls.update).toBe(0); // atomic path, no JS read-modify-write
  });

  it('RPC absent => fail-soft JS-merge fallback (no crash)', async () => {
    const { supabase, calls } = regStub({ allAdams: [], rpcError: { code: 'PGRST202', message: 'Could not find the function set_adam_flag' } });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_fallback' });
    expect(calls.update).toBe(1); // fail-soft JS merge
  });

  it('a STALE prior => retire (clear_adam_flag) + register + FR-4 drain re-targets inbound', async () => {
    const { supabase, calls } = regStub({
      allAdams: [{ session_id: 'staleprior', heartbeat_at: fresh(999), metadata: { role: 'adam' } }],
      rpcError: null,
      drainRows: [{ id: 'm1' }, { id: 'm2' }],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_after_retire', drained: 2 });
    expect(r.retired).toEqual(['staleprior']);
    expect(calls.rpc.map((c) => c.fn)).toEqual(expect.arrayContaining(['clear_adam_flag', 'set_adam_flag']));
    expect(calls.drainSelect).toBe(1); // FR-4 drain ran (re-targeted old->new)
  });

  // QF-20260703-883: clear_adam_flag RPC absent (migration unapplied) must NOT silently leave
  // retired:[] forever — falls back to the JS-merge used for tagging, and still drains the prior's
  // stranded inbound. Loud reporting via retire_fallback_used (no more silent no-op).
  it('RPC absent + STALE prior => JS-merge retire fallback (no silent retired:[])', async () => {
    const { supabase, calls } = regStub({
      allAdams: [{ session_id: 'staleprior', heartbeat_at: fresh(999), metadata: { role: 'adam', non_fleet: true } }],
      rpcError: { code: 'PGRST202', message: 'Could not find the function' },
      drainRows: [{ id: 'm1' }],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_after_retire_fallback', drained: 1 });
    expect(r.retired).toEqual(['staleprior']);
    expect(r.retire_fallback_used).toEqual(['staleprior']);
    expect(r.retire_blocked).toBeUndefined();
    expect(calls.drainSelect).toBe(1); // FR-4 drain still ran for the JS-merge-retired prior
  });

  // FR-1/TS-1: the bug this SD fixes — a session with NO existing claude_sessions row must be
  // CREATED (set_adam_flag's INSERT ... ON CONFLICT), never a loud "not found" dead end that
  // leaves a never-registered Adam permanently untagged.
  it('session row absent => creates the row via set_adam_flag (no more "not found" error)', async () => {
    const { supabase, calls } = regStub({ rowExists: false, allAdams: [] });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged' });
    expect(calls.rpc.map((c) => c.fn)).toContain('set_adam_flag');
  });

  // TS-7: RPC absent AND the row is absent — the JS-merge fallback must INSERT, never update() a
  // non-existent row (a silent supabase-js no-op that would leave the session untagged forever).
  it('session row absent + RPC absent => JS-merge fallback INSERTS the row (not a silent update no-op)', async () => {
    const { supabase, calls } = regStub({ rowExists: false, allAdams: [], rpcError: { code: 'PGRST202', message: 'missing' } });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_fallback' });
    expect(calls.insert).toBe(1);
    expect(calls.update).toBe(0);
  });

  // FR-2/TS-3: mandatory fail-loud readback — a write that reports success without the tag
  // actually landing (RLS, a CHECK/enum violation supabase-js swallows) must return ok:false,
  // never a false ok:true.
  it('readback cannot confirm the tag => ok:false with a loud readback error (never a false success)', async () => {
    const { supabase } = regStub({ allAdams: [] });
    supabase.rpc = async () => ({ error: null }); // "succeeds" without mutating the row
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/readback/i);
  });
});

describe('drainAdamOutbound (FR-4 idempotent re-target)', () => {
  const { drainAdamOutbound } = require('../../../scripts/adam-advisory.cjs');
  it('re-targets unread old-session rows to the new session and counts them', async () => {
    let captured = null;
    const sb = { from() { const c = {
      update(patch) { captured = { patch, in: null }; return c; },
      in(_col, ids) { captured.in = ids; return c; },
      is() { return c; }, gte() { return c; },
      select() { return Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }); },
    }; return c; } };
    const r = await drainAdamOutbound(sb, { newSessionId: 'new', oldSessionIds: ['old1', 'old2'] });
    expect(r.moved).toBe(2);
    expect(captured.patch).toEqual({ target_session: 'new' });
    expect(captured.in).toEqual(['old1', 'old2']);
  });
  it('no-op for empty/self-only old ids (idempotent boundary)', async () => {
    const sb = { from() { throw new Error('should not query'); } };
    expect(await drainAdamOutbound(sb, { newSessionId: 'new', oldSessionIds: [] })).toEqual({ moved: 0 });
    expect(await drainAdamOutbound(sb, { newSessionId: 'new', oldSessionIds: ['new'] })).toEqual({ moved: 0 });
    expect(await drainAdamOutbound(null, { newSessionId: 'new', oldSessionIds: ['x'] })).toEqual({ moved: 0 });
  });
});

describe('runAdamRestart (FR-5 orchestrator, injectable)', () => {
  const { runAdamRestart } = require('../../../scripts/adam-restart.cjs');
  const okDeps = () => ({
    checkFreshness: async () => ({ verdict: 'FRESH' }),
    regenerateContract: async () => ({ ok: true, file: 'CLAUDE_ADAM.md' }),
    register: async () => ({ ok: true, action: 'tagged', retired: [], drained: 0 }),
    canary: async () => ({ ok: true, coordinator_id: 'coord-1' }),
  });

  it('all steps pass => PASS with 4 steps', async () => {
    const r = await runAdamRestart(okDeps());
    expect(r.verdict).toBe('PASS');
    expect(r.steps.map((s) => s.step)).toEqual(['freshness', 'regenerate_contract', 'register', 'canary']);
  });
  it('freshness is ADVISORY — a throw does not fail the restart', async () => {
    const d = okDeps(); d.checkFreshness = async () => { throw new Error('git missing'); };
    const r = await runAdamRestart(d);
    expect(r.verdict).toBe('PASS');
    expect(r.steps[0]).toMatchObject({ step: 'freshness', ok: true });
  });
  it('regenerate failure => FAIL at regenerate', async () => {
    const d = okDeps(); d.regenerateContract = async () => ({ ok: false, status: 1 });
    const r = await runAdamRestart(d);
    expect(r).toMatchObject({ ok: false, verdict: 'FAIL' });
    expect(r.summary).toMatch(/regenerate_contract/);
  });
  it('register refused (fresh prior) => FAIL', async () => {
    const d = okDeps(); d.register = async () => ({ ok: false, action: 'refused' });
    const r = await runAdamRestart(d);
    expect(r.verdict).toBe('FAIL');
    expect(r.summary).toMatch(/refused/);
  });
  it('canary cannot reach coordinator => FAIL', async () => {
    const d = okDeps(); d.canary = async () => ({ ok: false, detail: 'no active coordinator' });
    const r = await runAdamRestart(d);
    expect(r.verdict).toBe('FAIL');
    expect(r.summary).toMatch(/canary/);
  });
});
