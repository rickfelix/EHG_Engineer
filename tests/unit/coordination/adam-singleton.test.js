// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1/FR-3/FR-6) — Adam-singleton tests.
// Hermetic: no live DB (injected supabase stub), no real time (nowMs injected). Validates the
// deterministic election (mirror of the coordinator), the fail-open resolvers, the single-Adam
// guard's deliberate refuse-new-on-fresh-prior divergence, and the pure MULTIPLE_ADAMS detector.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createFixtureSupabase } from '../../helpers/postgrest-fixture-store.js';
const require = createRequire(import.meta.url);
const adam = require('../../../lib/coordinator/adam-identity.cjs');
const { detectMultipleAdams, runDetectors } = require('../../../lib/coordinator/detectors.cjs');
const { registerAdam } = require('../../../scripts/adam-register.cjs');

const NOW = Date.parse('2026-06-15T16:00:00.000Z');
const fresh = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString();
// drainAdamOutbound/retargetStaleAdamInbound's 14-day horizon is computed against REAL
// Date.now() (not the frozen guard-election NOW above, which only governs heartbeat_at
// freshness via the injected nowMs param) — session_coordination fixture rows need a
// genuinely-recent created_at or the shared successor-inherit predicate excludes them.
const recentReal = (minAgo) => new Date(Date.now() - minAgo * 60_000).toISOString();

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
      // QF/SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-1, tightened per ADVERSARIAL REVIEW (PR
      // #7369, INFO): production switched from .in('status', [...]) to .or('status.is.null,
      // status.in.(...)') so a NULL status matches too (SQL `IN` never matches NULL, disagreeing
      // with isStatusFreshEligible's own null-is-eligible predicate). Small parser, not a literal
      // string match, so the stub still exercises real semantics if the clause order ever changes.
      let statusPredicate = null;
      const chain = {
        select() { return chain; },
        gte() { return chain; },
        filter() { return chain; },
        or(expr) {
          // Match directly against the full string rather than splitting on ',' first -- a naive
          // split breaks apart the commas INSIDE status.in.(active,idle,stale) itself.
          const str = String(expr);
          const allowNull = /(^|,)status\.is\.null(,|$)/.test(str);
          const inMatch = /status\.in\.\(([^)]*)\)/.exec(str);
          const allowedValues = new Set(inMatch ? inMatch[1].split(',') : []);
          statusPredicate = (status) => (status == null ? allowNull : allowedValues.has(status));
          return chain;
        },
        order() { return chain; },
        range(from, to) {
          if (error) return Promise.resolve({ data: null, error });
          const source = statusPredicate ? (rows || []).filter((r) => statusPredicate(r.status)) : (rows || []);
          return Promise.resolve({ data: source.slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
}

describe('electAdamFromDb / getActiveAdamId / countFreshAdams (fail-open)', () => {
  it('elects the canonical Adam from fresh rows', async () => {
    const sb = stub([
      { session_id: 'old', heartbeat_at: fresh(1), status: 'active', metadata: { role: 'adam', adam_since: '2026-06-15T09:00:00Z' } },
      { session_id: 'new', heartbeat_at: fresh(1), status: 'active', metadata: { role: 'adam', adam_since: '2026-06-15T11:00:00Z' } },
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
  // QF/SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-1 (TS-3): a released-but-heartbeat-fresh row
  // must not win election -- fetchFreshAdams now applies a query-level status allowlist.
  it('EXCLUDES a released-but-heartbeat-fresh row from election', async () => {
    const sb = stub([
      { session_id: 'released', heartbeat_at: fresh(1), status: 'released', metadata: { role: 'adam' } },
      { session_id: 'live', heartbeat_at: fresh(1), status: 'idle', metadata: { role: 'adam' } },
    ]);
    expect(await adam.electAdamFromDb(sb, { nowMs: NOW })).toBe('live');
    expect(await adam.countFreshAdams(sb, { nowMs: NOW })).toBe(1);
  });

  // ADVERSARIAL REVIEW (PR #7369, INFO): SQL's `status IN (...)` never matches NULL, which used to
  // silently disagree with isStatusFreshEligible(null)===true (SECURITY evidence 46d5f420) --
  // fetchFreshAdams's QUERY excluded a NULL-status row that the PURE predicate would have allowed.
  // Proves agreement is restored at the query layer, not just the predicate.
  it('INCLUDES a NULL-status fresh row in election (query-level .or() now agrees with isStatusFreshEligible)', async () => {
    const sb = stub([
      { session_id: 'nullStatus', heartbeat_at: fresh(1), status: null, metadata: { role: 'adam' } },
    ]);
    expect(await adam.electAdamFromDb(sb, { nowMs: NOW })).toBe('nullStatus');
    expect(await adam.countFreshAdams(sb, { nowMs: NOW })).toBe(1);
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

  // QF/SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-1: closes the fetchAllAdamsStrict blackout —
  // a rotated-out prior's heartbeat_at is frozen at release time, not backdated, so it reads as
  // "fresh" for up to ADAM_FRESH_MS. Without a status check this REFUSED new registration; the
  // fix reclassifies it as retirable-stale instead.
  it('a RELEASED prior with a fresh heartbeat is classified non-fresh, not refused (registration succeeds)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'released1', heartbeat_at: fresh(1), status: 'released' }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retire).toEqual(['released1']);
    expect(d.freshPriors).toEqual([]);
  });

  // Negative control (TESTING evidence d8ad67a2, TS-2): the fix must not blind the guard to a
  // genuinely live prior. A non-released, heartbeat-fresh row with status EXPLICITLY set still
  // refuses registration.
  it('a non-released, fresh-heartbeat prior with explicit status still REFUSES (negative control)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'live1', heartbeat_at: fresh(1), status: 'active' }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
    expect(d.freshPriors).toEqual(['live1']);
  });

  // Backward compatibility: existing/legacy priorAdams entries with NO status field at all
  // (predating this fix) must be unaffected — absent status defers to heartbeat_at alone.
  it('a fresh-heartbeat prior with NO status field is still classified fresh (backward compatible)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'legacy1', heartbeat_at: fresh(1) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
    expect(d.freshPriors).toEqual(['legacy1']);
  });

  it('mixed released + genuinely-fresh priors => REFUSE (the live one still dominates), released one still retirable', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [
        { session_id: 'released2', heartbeat_at: fresh(1), status: 'released' },
        { session_id: 'live2', heartbeat_at: fresh(1), status: 'idle' },
      ],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
    expect(d.freshPriors).toEqual(['live2']);
    expect(d.retire).toEqual([]); // refuse path never retires, matching the existing mixed-fresh-priors test above
  });
});

describe('isStatusFreshEligible (pure status-allowlist helper, FR-1)', () => {
  it('active/idle/stale are fresh-eligible', () => {
    expect(adam.isStatusFreshEligible('active')).toBe(true);
    expect(adam.isStatusFreshEligible('idle')).toBe(true);
    expect(adam.isStatusFreshEligible('stale')).toBe(true);
  });
  it('released is NOT fresh-eligible', () => {
    expect(adam.isStatusFreshEligible('released')).toBe(false);
  });
  it('undefined status defers to caller (fresh-eligible) for backward compatibility', () => {
    expect(adam.isStatusFreshEligible(undefined)).toBe(true);
  });
  it('null status ALSO defers (fresh-eligible) -- PostgREST\'s real wire value for a NULL column (SECURITY evidence 46d5f420, SEC-01)', () => {
    expect(adam.isStatusFreshEligible(null)).toBe(true);
  });
  it('an unknown/future status value is NOT fresh-eligible (fail-closed allowlist)', () => {
    expect(adam.isStatusFreshEligible('some_future_status')).toBe(false);
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
// SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001: extended so a retire (RPC clear_adam_flag or
// the JS-merge fallback) actually mutates the retired session's role to ADAM_RETIRED_ROLE in a
// live, queryable table — resolveRetiredAdamSeats reads THAT state, not a static fixture — and
// so session_coordination (drainRows) is routed through the genuinely-filtering
// postgrest-fixture-store instead of a bulk-update stub, matching the new select-then-per-row
// drainAdamOutbound implementation.
function regStub({ selfSessionId = 'self', selfMeta = null, rowExists = true, allAdams = [], rpcError = null, drainRows = [] } = {}) {
  const calls = { update: 0, insert: 0, rpc: [], drainSelect: 0 };
  let currentRowExists = rowExists;
  let currentMeta = selfMeta;
  const otherSessionsMeta = new Map(allAdams.map((a) => [a.session_id, { ...a.metadata }]));
  const scFixture = createFixtureSupabase({ session_coordination: drainRows.map((r) => ({ ...r })) });

  function claudeSessionsChain() {
    let roleFilter;
    const chain = {
      select() { return chain; },
      eq(col, val) { if (col === 'metadata->>role') roleFilter = val; return chain; },
      gte() { return chain; },
      filter() { return chain; }, // fetchAllAdams — FR-6: now paginated, resolves via .range below
      order() { return chain; },
      range(from, to) {
        if (roleFilter !== undefined) {
          const matched = [...otherSessionsMeta.entries()]
            .filter(([, m]) => m && m.role === roleFilter)
            .map(([session_id]) => ({ session_id }));
          return Promise.resolve({ data: matched.slice(from, to + 1), error: null });
        }
        const live = allAdams.map((a) => ({ ...a, metadata: otherSessionsMeta.get(a.session_id) || a.metadata }));
        return Promise.resolve({ data: live.slice(from, to + 1), error: null });
      },
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
            else if (otherSessionsMeta.has(val)) otherSessionsMeta.set(val, payload.metadata); // JS-merge retire fallback
            return Promise.resolve({ error: null });
          },
        };
        return uchain;
      },
    };
    return chain;
  }

  function sessionCoordinationChain() {
    calls.drainSelect += 1;
    return scFixture.from('session_coordination');
  }

  const supabase = {
    from(table) { return table === 'session_coordination' ? sessionCoordinationChain() : claudeSessionsChain(); },
    rpc(fn, args) {
      calls.rpc.push({ fn, args });
      if (fn === 'set_adam_flag' && !rpcError && args && args.p_session_id === selfSessionId) {
        currentRowExists = true;
        currentMeta = { ...(currentMeta || {}), role: 'adam', non_fleet: true, adam_since: 'test' };
      }
      if (fn === 'clear_adam_flag' && !rpcError && args && args.p_session_id) {
        const prev = otherSessionsMeta.get(args.p_session_id) || {};
        otherSessionsMeta.set(args.p_session_id, { ...prev, role: 'adam_retired', non_fleet: true });
      }
      return Promise.resolve({ error: rpcError });
    },
  };
  return { supabase, calls, drainRows: () => scFixture.table('session_coordination') };
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
    const { supabase, calls, drainRows } = regStub({
      allAdams: [{ session_id: 'staleprior', heartbeat_at: fresh(999), metadata: { role: 'adam' } }],
      rpcError: null,
      drainRows: [
        { id: 'm1', target_session: 'staleprior', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recentReal(60) },
        { id: 'm2', target_session: 'staleprior', acknowledged_at: null, payload: { kind: 'adam_advisory' }, created_at: recentReal(60) },
      ],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_after_retire', drained: 2 });
    expect(r.retired).toEqual(['staleprior']);
    expect(calls.rpc.map((c) => c.fn)).toEqual(expect.arrayContaining(['clear_adam_flag', 'set_adam_flag']));
    expect(calls.drainSelect).toBeGreaterThan(0); // FR-4 drain ran (re-targeted old->new)
    expect(drainRows().every((row) => row.target_session === 'self')).toBe(true);
    expect(drainRows().map((row) => row.payload.retargeted_from)).toEqual(['staleprior', 'staleprior']);
  });

  // QF-20260703-883: clear_adam_flag RPC absent (migration unapplied) must NOT silently leave
  // retired:[] forever — falls back to the JS-merge used for tagging, and still drains the prior's
  // stranded inbound. Loud reporting via retire_fallback_used (no more silent no-op).
  it('RPC absent + STALE prior => JS-merge retire fallback (no silent retired:[])', async () => {
    const { supabase, calls } = regStub({
      allAdams: [{ session_id: 'staleprior', heartbeat_at: fresh(999), metadata: { role: 'adam', non_fleet: true } }],
      rpcError: { code: 'PGRST202', message: 'Could not find the function' },
      drainRows: [
        { id: 'm1', target_session: 'staleprior', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recentReal(60) },
      ],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_after_retire_fallback', drained: 1 });
    expect(r.retired).toEqual(['staleprior']);
    expect(r.retire_fallback_used).toEqual(['staleprior']);
    expect(r.retire_blocked).toBeUndefined();
    expect(calls.drainSelect).toBeGreaterThan(0); // FR-4 drain still ran for the JS-merge-retired prior
  });

  // ADVERSARIAL REVIEW (PR #7369): a released-but-heartbeat-not-yet-stale prior (heartbeat_at
  // frozen at release, not backdated -- FR-1's own finding) must be RETIRED, not skipped as
  // "became fresh since the decision". Before this fix, decideSingleAdamGuard correctly excluded
  // this row from "fresh" (so it landed in decision.retire, and registration proceeded), but the
  // retire re-check's bare isFresh() still saw its heartbeat as fresh and skipped clearing it --
  // leaving TWO simultaneous role='adam' rows with no convergence path.
  it('a RELEASED-but-heartbeat-still-fresh prior => retired (not wrongly skipped as "became fresh")', async () => {
    // heartbeat_at set relative to the SAME injected nowMs2 the retire re-check reads (not the
    // fresh() helper, which is relative to the frozen initial-decision NOW and would be many
    // real-world months stale by the time the re-check ran on a hardcoded Date.now() -- that gap is
    // exactly what made this scenario untestable before nowMs2 became injectable).
    const heartbeatAt = new Date(NOW - 5 * 60_000).toISOString();
    const { supabase, calls } = regStub({
      allAdams: [{ session_id: 'releasedRecentHb', heartbeat_at: heartbeatAt, status: 'released', metadata: { role: 'adam' } }],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW, nowMs2: NOW });
    expect(r).toMatchObject({ ok: true, action: 'tagged_after_retire' });
    expect(r.retired).toEqual(['releasedRecentHb']);
    expect(calls.rpc.map((c) => c.fn)).toEqual(expect.arrayContaining(['clear_adam_flag', 'set_adam_flag']));
  });

  // Negative control: a prior with the SAME recent heartbeat but a LIVE status (no status field,
  // matching real callers/fixtures predating the field) is still correctly refused, not retired --
  // proves the fix didn't flip the guard's other direction. (Refused at the FIRST decision, so it
  // never reaches the retire re-check -- nowMs2 is irrelevant here, but passed for consistency.)
  it('a LIVE (no-status) prior with the same recent heartbeat is still REFUSED, not retired', async () => {
    const heartbeatAt = new Date(NOW - 5 * 60_000).toISOString();
    const { supabase, calls } = regStub({
      allAdams: [{ session_id: 'liveRecentHb', heartbeat_at: heartbeatAt, metadata: { role: 'adam' } }],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW, nowMs2: NOW });
    expect(r).toMatchObject({ ok: false, action: 'refused' });
    expect(calls.rpc).toHaveLength(0);
  });

  // ADVERSARIAL REVIEW (PR #7369): the retire re-check's OWN racing-restart protection ("a prior
  // that became fresh since the decision is NEVER cleared") was silently dead code before this fix
  // -- isFresh() was called with only 2 of its 3 args, so `nowMs2 - hb <= undefined` was false for
  // every value, meaning freshNow was always empty and nothing was ever protected. Now that the
  // missing ADAM_FRESH_MS is restored, prove the protection actually engages: a prior classified
  // stale at DECISION time (nowMs) but whose SAME heartbeat_at is within the freshness window as of
  // the retire RE-CHECK time (nowMs2) must be skipped, not cleared. (nowMs2 < nowMs here is a
  // deliberate proxy for "this row looks fresher from the second read's vantage point" -- the
  // fixture harness shares one static heartbeat_at across both reads, so this is the only way to
  // simulate a genuinely later, fresher stamp without changing the harness itself.)
  it('a prior that raced back to fresh between decision and retire re-check is SKIPPED, not cleared', async () => {
    const heartbeatAt = new Date(NOW - 15 * 60_000).toISOString(); // 15min before NOW: stale at decision (nowMs=NOW)
    const nowMs2 = NOW - 10 * 60_000; // only 5min after heartbeatAt: fresh as of the re-check
    const { supabase, calls } = regStub({
      allAdams: [{ session_id: 'racingRestart', heartbeat_at: heartbeatAt, metadata: { role: 'adam' } }],
    });
    const r = await registerAdam(supabase, 'self', { nowMs: NOW, nowMs2 });
    expect(r).toMatchObject({ ok: true, action: 'tagged' }); // NOT tagged_after_retire
    expect(r.retired).toEqual([]);
    expect(calls.rpc.map((c) => c.fn)).not.toContain('clear_adam_flag');
    // ADVERSARIAL REVIEW round 2 (PR #7369, WARNING): this skip is disclosed, not silent -- a 2nd
    // role=adam row may now exist and the result/message must say so.
    expect(r.retire_skipped_fresh).toEqual(['racingRestart']);
    expect(r.message).toMatch(/racingRestart.*raced back to fresh/);
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

describe('drainAdamOutbound (FR-4 idempotent re-target, widened per SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001)', () => {
  const { drainAdamOutbound } = require('../../../scripts/adam-advisory.cjs');
  it('re-targets unacked old-session rows (any read_at, within 14 days) to the new session, stamps retargeted_from/at, and counts them', async () => {
    const sb = createFixtureSupabase({
      session_coordination: [
        { id: 'a', target_session: 'old1', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recentReal(60) },
        { id: 'b', target_session: 'old2', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recentReal(60) },
      ],
    });
    const r = await drainAdamOutbound(sb, { newSessionId: 'new', oldSessionIds: ['old1', 'old2'] });
    expect(r.moved).toBe(2);
    expect(r.byKind).toEqual({ coordinator_reply: 2 });
    for (const row of sb.table('session_coordination')) {
      expect(row.target_session).toBe('new');
      expect(row.payload.retargeted_from).toMatch(/^old\d$/);
      expect(row.payload.retargeted_at).toBeTruthy();
    }
  });
  it('no-op for empty/self-only old ids (idempotent boundary)', async () => {
    const sb = { from() { throw new Error('should not query'); } };
    expect(await drainAdamOutbound(sb, { newSessionId: 'new', oldSessionIds: [] })).toEqual({ moved: 0, byKind: {} });
    expect(await drainAdamOutbound(sb, { newSessionId: 'new', oldSessionIds: ['new'] })).toEqual({ moved: 0, byKind: {} });
    expect(await drainAdamOutbound(null, { newSessionId: 'new', oldSessionIds: ['x'] })).toEqual({ moved: 0, byKind: {} });
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
