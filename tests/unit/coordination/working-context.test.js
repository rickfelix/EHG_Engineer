// SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-1/FR-5) — working_context library tests.
// Hermetic: no live DB, no real time (nowMs injected). Validates the canonical-lifecycle
// normalization (backward-compatible with the live hand-maintained blob), pruning, staleness,
// auto-derivation, and the single-source display formatter.
import { describe, it, expect } from 'vitest';
import {
  CANONICAL_STATES,
  STALE_THRESHOLD_MS,
  RECENTLY_CLOSED_TTL_MS,
  normalizeState,
  normalizeThread,
  normalizeWorkingContext,
  isStale,
  upsertThread,
  setThreadState,
  pruneThreads,
  deriveThreadState,
  formatWorkingContext,
} from '../../../lib/coordinator/working-context.cjs';
import { getWorkingContext, writeWorkingContext, isMissingFunctionError } from '../../../lib/coordinator/working-context-store.cjs';

const T0 = Date.parse('2026-06-15T12:00:00.000Z');

// Mirrors the live blob on session f808779a (free-form states the library must normalize).
function liveBlob() {
  return {
    mode: 'support',
    threads: [
      { what: 'recurring ticks', state: 'active' },
      { what: 'CronGenius Stage-19 refresh', state: 'waiting-on-coordinator' },
      { what: 'session-sourced SDs tracking', state: 'monitoring' },
    ],
    updated_at: new Date(T0).toISOString(),
    staleness_rule: 'if updated_at > ~30min old, treat as STALE',
    recently_closed: [{ at: new Date(T0 - 60_000).toISOString(), what: 'migration canary', state: 'done-7/7' }],
  };
}

describe('normalizeState (canonical lifecycle + waiting-on party)', () => {
  it('maps the live free-form vocabulary onto canonical states', () => {
    expect(normalizeState('waiting-on-coordinator')).toEqual({ state: 'waiting', waiting_on: 'coordinator' });
    expect(normalizeState('blocked-on-chairman')).toEqual({ state: 'blocked', waiting_on: 'chairman' });
    expect(normalizeState('monitoring')).toEqual({ state: 'active' });
    expect(normalizeState('done-7/7')).toEqual({ state: 'done' });
    expect(normalizeState('cancelled')).toEqual({ state: 'cancelled' });
    expect(normalizeState('active')).toEqual({ state: 'active' });
  });
  it('honest default: unknown states resolve to active but PRESERVE the original (raw_state) for audit', () => {
    expect(normalizeState('something weird')).toEqual({ state: 'active', raw_state: 'something weird' });
    expect(normalizeState('  Paused  ')).toEqual({ state: 'active', raw_state: 'Paused' }); // original case kept
    // empty/null/undefined carry NO raw_state (nothing to preserve)
    expect(normalizeState('')).toEqual({ state: 'active' });
    expect(normalizeState(null)).toEqual({ state: 'active' });
    expect(normalizeState(undefined)).toEqual({ state: 'active' });
  });
  it('every produced state is in the canonical set', () => {
    for (const raw of ['waiting-on-x', 'blocked', 'done', 'cancelled', 'wip', 'garbage']) {
      expect(CANONICAL_STATES).toContain(normalizeState(raw).state);
    }
  });
});

describe('normalizeThread / normalizeWorkingContext (backward-compatible, never throws)', () => {
  it('normalizes the live blob without clobbering it', () => {
    const norm = normalizeWorkingContext(liveBlob());
    expect(norm.threads).toHaveLength(3);
    expect(norm.threads[1]).toMatchObject({ what: 'CronGenius Stage-19 refresh', state: 'waiting', waiting_on: 'coordinator' });
    expect(norm.threads[2]).toMatchObject({ what: 'session-sourced SDs tracking', state: 'active' }); // monitoring -> active
    expect(norm.mode).toBe('support');
    expect(norm.recently_closed).toHaveLength(1);
  });
  it('drops threads with no usable `what` and tolerates garbage input', () => {
    expect(normalizeThread({ state: 'active' })).toBeNull();
    expect(normalizeThread(null)).toBeNull();
    expect(normalizeWorkingContext(null)).toEqual({ mode: null, threads: [], recently_closed: [], updated_at: null });
    expect(normalizeWorkingContext([1, 2, 3]).threads).toEqual([]);
  });
  it('waiting_on is only attached to waiting/blocked states', () => {
    const t = normalizeThread({ what: 'x', state: 'active', waiting_on: 'coordinator' });
    expect(t.waiting_on).toBeUndefined();
  });
  it('accepts alternate name fields before dropping a thread (reduces silent loss)', () => {
    expect(normalizeThread({ description: 'desc-named', state: 'active' }).what).toBe('desc-named');
    expect(normalizeThread({ title: 'title-named' }).what).toBe('title-named');
    expect(normalizeThread({ name: 'name-named' }).what).toBe('name-named');
  });
  it('coerceSince: preserves string, converts number/Date to ISO, never silently drops a timestamp', () => {
    const ms = Date.parse('2026-06-15T10:00:00.000Z');
    expect(normalizeThread({ what: 'a', since: '2026-06-15T10:00:00.000Z' }).since).toBe('2026-06-15T10:00:00.000Z');
    expect(normalizeThread({ what: 'a', since: ms }).since).toBe('2026-06-15T10:00:00.000Z');
    expect(normalizeThread({ what: 'a', since: new Date(ms) }).since).toBe('2026-06-15T10:00:00.000Z');
    expect(normalizeThread({ what: 'a' }).since).toBeNull(); // genuinely absent -> null (not fabricated)
  });
  it('preserves unknown top-level keys (staleness_rule) across the normalize cycle', () => {
    const norm = normalizeWorkingContext(liveBlob());
    expect(norm.staleness_rule).toBe('if updated_at > ~30min old, treat as STALE'); // not dropped
  });
  it('keeps a recently_closed entry that has `at` even if `what` is non-string', () => {
    const norm = normalizeWorkingContext({ recently_closed: [{ at: new Date(T0).toISOString(), state: 'done' }, { foo: 'bar' }] });
    expect(norm.recently_closed).toHaveLength(1); // the dated one survives; the shapeless one is dropped
  });
});

describe('isStale (currency-over-staleness)', () => {
  it('false within threshold, true past it', () => {
    const wc = { updated_at: new Date(T0).toISOString() };
    expect(isStale(wc, T0 + STALE_THRESHOLD_MS - 1)).toBe(false);
    expect(isStale(wc, T0 + STALE_THRESHOLD_MS + 1)).toBe(true);
  });
  it('boundary: exactly at the threshold is still fresh (> not >=)', () => {
    const wc = { updated_at: new Date(T0).toISOString() };
    expect(isStale(wc, T0 + STALE_THRESHOLD_MS)).toBe(false);
    expect(isStale(wc, T0 + STALE_THRESHOLD_MS + 1)).toBe(true);
  });
  it('future-dated beyond clock-skew tolerance => stale (a future timestamp must NOT read as fresh)', () => {
    expect(isStale({ updated_at: new Date(T0 + 60_000).toISOString() }, T0)).toBe(false); // 1m future within tolerance
    expect(isStale({ updated_at: new Date(T0 + 60 * 60_000).toISOString() }, T0)).toBe(true); // 1h future => unreliable
  });
  it('missing/garbage updated_at => stale (treat as unreliable)', () => {
    expect(isStale({}, T0)).toBe(true);
    expect(isStale({ updated_at: 'not-a-date' }, T0)).toBe(true);
    expect(isStale(null, T0)).toBe(true);
  });
});

describe('upsertThread / setThreadState (immutable, bumps updated_at)', () => {
  it('upserts a new thread with since=now and bumps updated_at', () => {
    const wc = upsertThread(liveBlob(), { what: 'new thread', state: 'active' }, T0 + 1000);
    expect(wc.threads.find((t) => t.what === 'new thread')).toMatchObject({ state: 'active', since: new Date(T0 + 1000).toISOString() });
    expect(wc.updated_at).toBe(new Date(T0 + 1000).toISOString());
  });
  it('upsert of an existing thread updates state, preserves original since', () => {
    const base = upsertThread({}, { what: 'a', state: 'active', since: new Date(T0).toISOString() }, T0);
    const wc = upsertThread(base, { what: 'a', state: 'blocked' }, T0 + 5000);
    const t = wc.threads.find((x) => x.what === 'a');
    expect(t.state).toBe('blocked');
    expect(t.since).toBe(new Date(T0).toISOString());
  });
  it('setThreadState transitions state and clears waiting_on when leaving a waiting state', () => {
    const base = upsertThread({}, { what: 'a', state: 'waiting-on-coordinator' }, T0);
    expect(base.threads[0].waiting_on).toBe('coordinator');
    const done = setThreadState(base, 'a', 'done', T0 + 1000);
    expect(done.threads[0].state).toBe('done');
    expect(done.threads[0].waiting_on).toBeUndefined();
  });
  it('setThreadState upserts when the thread is absent', () => {
    const wc = setThreadState({}, 'brand new', 'waiting-on-chairman', T0);
    expect(wc.threads[0]).toMatchObject({ what: 'brand new', state: 'waiting', waiting_on: 'chairman' });
  });
});

describe('pruneThreads (close + age-out, honest freshness)', () => {
  it('moves done|cancelled threads into recently_closed and keeps only open threads', () => {
    let wc = upsertThread({}, { what: 'open', state: 'active' }, T0);
    wc = upsertThread(wc, { what: 'finished', state: 'done' }, T0);
    wc = upsertThread(wc, { what: 'dropped', state: 'cancelled' }, T0);
    const pruned = pruneThreads(wc, T0 + 2000);
    expect(pruned.threads.map((t) => t.what)).toEqual(['open']);
    expect(pruned.recently_closed.map((r) => r.what).sort()).toEqual(['dropped', 'finished']);
    expect(pruned.updated_at).toBe(new Date(T0 + 2000).toISOString()); // real change bumps freshness
  });
  it('ages out recently_closed entries older than the TTL', () => {
    const wc = {
      threads: [],
      recently_closed: [
        { at: new Date(T0 - RECENTLY_CLOSED_TTL_MS - 1000).toISOString(), what: 'old', state: 'done' },
        { at: new Date(T0 - 1000).toISOString(), what: 'recent', state: 'done' },
      ],
      updated_at: new Date(T0).toISOString(),
    };
    const pruned = pruneThreads(wc, T0);
    expect(pruned.recently_closed.map((r) => r.what)).toEqual(['recent']);
  });
  it('pure age-out (no thread closed) does NOT bump updated_at (no false freshness)', () => {
    const wc = { threads: [{ what: 'open', state: 'active' }], recently_closed: [], updated_at: new Date(T0).toISOString() };
    const pruned = pruneThreads(wc, T0 + 999_999);
    expect(pruned.updated_at).toBe(new Date(T0).toISOString());
  });
});

describe('deriveThreadState (auto-derive from live signals)', () => {
  it('derives from SD status', () => {
    const t = { what: 'x', state: 'active' };
    expect(deriveThreadState(t, { sdStatus: 'completed' })).toBe('done');
    expect(deriveThreadState(t, { sdStatus: 'blocked' })).toBe('blocked');
    expect(deriveThreadState(t, { sdStatus: 'in_progress' })).toBe('active');
    expect(deriveThreadState(t, { sdStatus: 'deferred' })).toBe('cancelled');
  });
  it('derives from advisory ack and claim state', () => {
    expect(deriveThreadState({ what: 'x', state: 'waiting' }, { advisoryAcked: true })).toBe('active');
    expect(deriveThreadState({ what: 'x', state: 'active' }, { claimActive: false })).toBe('done');
  });
  it('returns null when no signal maps (manual thread left untouched)', () => {
    expect(deriveThreadState({ what: 'x', state: 'active' }, {})).toBeNull();
    expect(deriveThreadState({ what: 'x', state: 'active' }, { sdStatus: 'mystery' })).toBeNull();
    expect(deriveThreadState(null, { sdStatus: 'completed' })).toBeNull();
  });
});

describe('formatWorkingContext (single-source display)', () => {
  it('renders threads, highlights waiting-on-other, marks fresh', () => {
    const marks = [];
    const out = formatWorkingContext(liveBlob(), { nowMs: T0 + 60_000, label: 'Adam', em: (s) => { marks.push(s); return `*${s}*`; } });
    expect(out).toMatch(/Adam — 3 open thread/);
    expect(out).toMatch(/fresh \(1m\)/);
    expect(out).toMatch(/\[waiting-on-coordinator\] CronGenius/);
    // the waiting-on-other line was passed through the emphasis fn
    expect(marks.some((m) => /waiting-on-coordinator/.test(m))).toBe(true);
  });
  it('shows a STALE banner past the threshold', () => {
    const out = formatWorkingContext(liveBlob(), { nowMs: T0 + STALE_THRESHOLD_MS + 60_000 });
    expect(out).toMatch(/STALE \(\d+m old — re-derive before trusting\)/);
  });
  it('surfaces an unrecognized raw state (never hides intent)', () => {
    const wc = { threads: [{ what: 'odd thread', state: 'paused-indefinitely' }], updated_at: new Date(T0).toISOString() };
    const out = formatWorkingContext(wc, { nowMs: T0 });
    expect(out).toMatch(/\[active\] odd thread \(raw: "paused-indefinitely"\)/);
  });
  it('never throws on null/garbage', () => {
    expect(formatWorkingContext(null)).toMatch(/\(none\)/);
    expect(formatWorkingContext([1, 2])).toMatch(/\(none\)/);
    expect(() => formatWorkingContext({ threads: 'bad' }, { nowMs: T0 })).not.toThrow();
  });
});

// FR-2 store: atomic-RPC writer with fail-soft. The stub records every call so we can PROVE
// the writer never performs a JS read-modify-write (.from().update()) fallback.
function storeStub({ rpcResult } = {}) {
  const calls = { rpc: [], from: [], update: 0 };
  return {
    calls,
    rpc(fn, args) { calls.rpc.push({ fn, args }); return Promise.resolve(rpcResult || { error: null }); },
    from(table) {
      calls.from.push(table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: { metadata: { working_context: { mode: 'support', threads: [{ what: 'x', state: 'monitoring' }], updated_at: new Date(T0).toISOString() } } }, error: null }); },
        update() { calls.update += 1; return chain; },
      };
      return chain;
    },
  };
}

describe('working-context-store (FR-2 atomic writer, fail-soft, NO RMW)', () => {
  it('writeWorkingContext persists via the RPC and never issues a metadata update (RMW)', async () => {
    const sb = storeStub({ rpcResult: { error: null } });
    const r = await writeWorkingContext(sb, 'sess-1', { threads: [], updated_at: new Date(T0).toISOString() });
    expect(r.persisted).toBe(true);
    expect(sb.calls.rpc).toHaveLength(1);
    expect(sb.calls.rpc[0].fn).toBe('set_session_working_context');
    expect(sb.calls.rpc[0].args).toMatchObject({ p_session_id: 'sess-1' });
    expect(sb.calls.update).toBe(0); // NEVER a read-modify-write
  });
  it('fail-softs (rpc_absent) when the migration is unapplied — still no RMW', async () => {
    const sb = storeStub({ rpcResult: { error: { code: 'PGRST202', message: 'Could not find the function set_session_working_context' } } });
    const r = await writeWorkingContext(sb, 'sess-1', {});
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('rpc_absent');
    expect(r.warn).toMatch(/persistence pending/i);
    expect(sb.calls.update).toBe(0);
  });
  it('surfaces other DB errors without crashing or RMW', async () => {
    const sb = storeStub({ rpcResult: { error: { code: '500', message: 'boom' } } });
    const r = await writeWorkingContext(sb, 'sess-1', {});
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('error');
    expect(sb.calls.update).toBe(0);
  });
  it('getWorkingContext reads + normalizes metadata.working_context', async () => {
    const sb = storeStub();
    const wc = await getWorkingContext(sb, 'sess-1');
    expect(wc.threads[0]).toMatchObject({ what: 'x', state: 'active' }); // monitoring -> active
  });
  it('isMissingFunctionError recognizes 42883 and PGRST202', () => {
    expect(isMissingFunctionError({ code: '42883' })).toBe(true);
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunctionError({ code: '23505' })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});
