/**
 * Unit tests for lib/claim/ownership-detection.js
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-3
 *
 * Verifies the helper's contract:
 *   - getClaimHolder is UNCACHED by default (per LEAD DESIGN Q3)
 *   - getClaimHolderCached honors ttlMs
 *   - classifyHoldingStatus boundary behavior (300s LIVENESS, 600s DISPLAY)
 *   - alive_source_side overrides heartbeat staleness
 *   - null safety for missing inputs
 *
 * QF-20260902-724: heartbeat_at is the real claude_sessions column; the code (and every fixture
 * in this file, until this QF) used last_heartbeat, a phantom column that made getClaimHolder's
 * live select error and every SD read unclaimed. Fixtures below were renamed to heartbeat_at;
 * the dedicated regression test at the bottom of this file proves the fix reads the right column.
 *
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B: claude_sessions carries both an internal `id` (uuid PK)
 * and a business-key `session_id` (text) -- they differ in 100% of live rows (13,185/13,185
 * measured 2026-09-06), but until this SD no fixture here modeled that divergence at all. FR-1/
 * FR-2 add id!=session_id fixtures for getClaimHolder/isClaimedBy/getLiveClaimHolders. FR-3
 * hardens makeSupabase()'s select() to validate the requested column list against a real-schema
 * allowlist -- the pre-hardening version below ignored its column argument entirely, so no test
 * in this file could ever have caught last_heartbeat being reintroduced into a .select() string
 * (the QF-20260902-724-named test above only exercises classifyHoldingStatus on an
 * already-fetched plain object, never the select() call itself).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getClaimHolder,
  getClaimHolderCached,
  isClaimedBy,
  getLiveClaimHolders,
  classifyHoldingStatus,
  LIVENESS_THRESHOLD_SECONDS,
  DISPLAY_THRESHOLD_SECONDS,
  CLAIM_HOLDING_STATUSES,
  _clearCache,
} from '../../../lib/claim/ownership-detection.js';

beforeEach(() => {
  _clearCache();
});

// FR-3: the real column sets ownership-detection.js is allowed to request. A .select() naming
// anything outside these mirrors real PostgREST and errors, instead of silently returning the
// full fixture row regardless of what was asked for.
const REAL_COLUMNS = {
  strategic_directives_v2: new Set(['sd_key', 'claiming_session_id']),
  claude_sessions: new Set(['session_id', 'sd_key', 'status', 'is_alive', 'has_uncommitted_changes', 'heartbeat_at']),
};

// Build a fake supabase client supporting .from(t).select(...).eq(...).maybeSingle()/.range()
function makeSupabase({ sds = {}, sessions = {}, calls = { from: 0 } } = {}) {
  return {
    _calls: calls,
    from(table) {
      calls.from++;
      const data = table === 'strategic_directives_v2' ? sds : sessions;
      const allowlist = REAL_COLUMNS[table];
      const builder = {
        _filters: {},
        _error: null,
        select(cols) {
          // FR-3: a real PostgREST client ERRORS on an unrecognized column. Modeling that here
          // is what lets this fake client actually catch a phantom-column regression, unlike the
          // pre-hardening version which ignored `cols` entirely.
          if (allowlist && typeof cols === 'string') {
            const requested = cols.split(',').map((c) => c.trim()).filter(Boolean);
            const unknown = requested.find((c) => !allowlist.has(c));
            if (unknown) builder._error = { message: `column ${table}.${unknown} does not exist` };
          }
          return builder;
        },
        eq(col, val) { builder._filters[col] = val; return builder; },
        not() { return builder; },
        order() { return builder; },
        maybeSingle: async () => {
          if (builder._error) return { data: null, error: builder._error };
          const sdKey = builder._filters.sd_key;
          const sessionId = builder._filters.session_id;
          const key = sdKey || sessionId;
          if (!key) return { data: null, error: null };
          const row = data[key];
          return { data: row || null, error: null };
        },
        // getLiveClaimHolders paginates via fetchAllPaginated, which calls .range(offset, end)
        // and awaits {data, error}. One page is enough for these small fixture sets.
        range: async () => {
          if (builder._error) return { data: null, error: builder._error };
          return { data: Object.values(data), error: null };
        },
      };
      return builder;
    },
  };
}

describe('classifyHoldingStatus boundaries', () => {
  it('returns ALIVE_SOURCE_SIDE when has_uncommitted_changes overrides heartbeat staleness', () => {
    const stale = new Date(Date.now() - 9999 * 1000).toISOString();
    expect(classifyHoldingStatus({ has_uncommitted_changes: true, heartbeat_at: stale, is_alive: false })).toBe('ALIVE_SOURCE_SIDE');
  });

  it('returns ACTIVE when heartbeat is fresh (within LIVENESS 300s)', () => {
    const fresh = new Date(Date.now() - 100 * 1000).toISOString();
    expect(classifyHoldingStatus({ heartbeat_at: fresh, is_alive: true })).toBe('ACTIVE');
  });

  it('returns ALIVE_NO_HEARTBEAT at LIVENESS boundary + 5s when is_alive=true', () => {
    const stale = new Date(Date.now() - (LIVENESS_THRESHOLD_SECONDS + 5) * 1000).toISOString();
    expect(classifyHoldingStatus({ heartbeat_at: stale, is_alive: true })).toBe('ALIVE_NO_HEARTBEAT');
  });

  it('returns ALIVE_NO_HEARTBEAT for heartbeat between LIVENESS and DISPLAY thresholds', () => {
    const between = new Date(Date.now() - (LIVENESS_THRESHOLD_SECONDS + 100) * 1000).toISOString();
    expect(classifyHoldingStatus({ heartbeat_at: between, is_alive: false })).toBe('ALIVE_NO_HEARTBEAT');
  });

  it('returns STALE_UNKNOWN past DISPLAY threshold with no is_alive flag', () => {
    const veryStale = new Date(Date.now() - (DISPLAY_THRESHOLD_SECONDS + 100) * 1000).toISOString();
    expect(classifyHoldingStatus({ heartbeat_at: veryStale, is_alive: false })).toBe('STALE_UNKNOWN');
  });

  it('returns STALE_UNKNOWN for null session', () => {
    expect(classifyHoldingStatus(null)).toBe('STALE_UNKNOWN');
  });

  it('QF-20260902-724: reads heartbeat_at, never the phantom last_heartbeat column', () => {
    // A row where the OLD (wrong) field is fresh but the REAL column is stale beyond DISPLAY.
    // Reading last_heartbeat would classify ACTIVE; reading heartbeat_at must classify
    // STALE_UNKNOWN -- proving the fix reads the actual column, not a coincidentally-present one.
    const fresh = new Date(Date.now() - 100 * 1000).toISOString();
    const veryStale = new Date(Date.now() - (DISPLAY_THRESHOLD_SECONDS + 100) * 1000).toISOString();
    expect(classifyHoldingStatus({ last_heartbeat: fresh, heartbeat_at: veryStale, is_alive: false })).toBe('STALE_UNKNOWN');
  });
});

describe('CLAIM_HOLDING_STATUSES contains the 3 alive states', () => {
  it('includes ACTIVE, ALIVE_NO_HEARTBEAT, ALIVE_SOURCE_SIDE', () => {
    expect(CLAIM_HOLDING_STATUSES.has('ACTIVE')).toBe(true);
    expect(CLAIM_HOLDING_STATUSES.has('ALIVE_NO_HEARTBEAT')).toBe(true);
    expect(CLAIM_HOLDING_STATUSES.has('ALIVE_SOURCE_SIDE')).toBe(true);
    expect(CLAIM_HOLDING_STATUSES.has('STALE_UNKNOWN')).toBe(false);
    expect(CLAIM_HOLDING_STATUSES.has('DEAD')).toBe(false);
  });
});

describe('getClaimHolder', () => {
  it('returns null when sdKey is missing', async () => {
    await expect(getClaimHolder(null, makeSupabase())).resolves.toBeNull();
    await expect(getClaimHolder('', makeSupabase())).resolves.toBeNull();
  });

  it('returns null when supabase is missing', async () => {
    await expect(getClaimHolder('SD-X', null)).resolves.toBeNull();
  });

  it('returns null when SD row not found', async () => {
    const supabase = makeSupabase({ sds: {} });
    await expect(getClaimHolder('SD-NOT-EXIST', supabase)).resolves.toBeNull();
  });

  it('returns null when SD has no claiming_session_id (unclaimed)', async () => {
    const supabase = makeSupabase({ sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: null } } });
    await expect(getClaimHolder('SD-A', supabase)).resolves.toBeNull();
  });

  it('returns the holder when SD has a claim and session exists', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now },
      },
    });
    const holder = await getClaimHolder('SD-A', supabase);
    expect(holder).not.toBeNull();
    expect(holder.session_id).toBe('sess-1');
    expect(holder.is_alive).toBe(true);
    expect(holder.holding_status).toBe('ACTIVE');
  });

  it('FR-1 (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B): resolves by session_id, unaffected by a differing internal id', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': {
          id: 'internal-pk-not-a-session-id-999', // differs from session_id in 100% of live rows (measured 2026-09-06)
          session_id: 'sess-1',
          sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now,
        },
      },
    });
    const holder = await getClaimHolder('SD-A', supabase);
    expect(holder).not.toBeNull();
    expect(holder.session_id).toBe('sess-1');
    expect(holder.holding_status).toBe('ACTIVE');
  });

  it('is UNCACHED — 2 sequential calls each query DB (per DESIGN Q3)', async () => {
    const calls = { from: 0 };
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now },
      },
      calls,
    });
    await getClaimHolder('SD-A', supabase);
    await getClaimHolder('SD-A', supabase);
    // Each call queries 2 tables (strategic_directives_v2 + claude_sessions) = 4 .from() calls total
    expect(calls.from).toBe(4);
  });
});

describe('isClaimedBy', () => {
  it('returns true when SD claim matches the given session id', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now },
      },
    });
    await expect(isClaimedBy('SD-A', 'sess-1', supabase)).resolves.toBe(true);
  });

  it('returns false when SD claim differs', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-other' } },
      sessions: {
        'sess-other': { session_id: 'sess-other', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now },
      },
    });
    await expect(isClaimedBy('SD-A', 'sess-1', supabase)).resolves.toBe(false);
  });

  it('returns false when SD has no claim', async () => {
    const supabase = makeSupabase({ sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: null } } });
    await expect(isClaimedBy('SD-A', 'sess-1', supabase)).resolves.toBe(false);
  });

  it('returns false for null inputs', async () => {
    await expect(isClaimedBy(null, 'sess-1', makeSupabase())).resolves.toBe(false);
    await expect(isClaimedBy('SD-A', null, makeSupabase())).resolves.toBe(false);
    await expect(isClaimedBy('SD-A', 'sess-1', null)).resolves.toBe(false);
  });

  it('FR-1 (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B): matches by session_id, unaffected by a differing internal id', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': {
          id: 'internal-pk-not-a-session-id-999',
          session_id: 'sess-1',
          sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now,
        },
      },
    });
    await expect(isClaimedBy('SD-A', 'sess-1', supabase)).resolves.toBe(true);
    await expect(isClaimedBy('SD-A', 'internal-pk-not-a-session-id-999', supabase)).resolves.toBe(false);
  });
});

describe('getLiveClaimHolders (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B FR-2 — no coverage existed anywhere before this SD)', () => {
  it('returns session_id values, never internal id values, for an id!=session_id fixture', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sessions: {
        'sess-1': {
          id: 'internal-pk-aaa', session_id: 'sess-1', sd_key: 'SD-A',
          status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now,
        },
        'sess-2': {
          id: 'internal-pk-bbb', session_id: 'sess-2', sd_key: 'SD-B',
          status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now,
        },
      },
    });
    const holders = await getLiveClaimHolders(supabase);
    expect(holders).toHaveLength(2);
    const bySd = Object.fromEntries(holders.map((h) => [h.sd_key, h]));
    expect(bySd['SD-A'].session_id).toBe('sess-1');
    expect(bySd['SD-B'].session_id).toBe('sess-2');
    expect(holders.every((h) => h.session_id !== 'internal-pk-aaa' && h.session_id !== 'internal-pk-bbb')).toBe(true);
  });

  it('excludes a session whose holding_status is not in CLAIM_HOLDING_STATUSES (e.g. STALE_UNKNOWN)', async () => {
    const veryStale = new Date(Date.now() - (DISPLAY_THRESHOLD_SECONDS + 100) * 1000).toISOString();
    const supabase = makeSupabase({
      sessions: {
        'sess-stale': {
          id: 'internal-pk-ccc', session_id: 'sess-stale', sd_key: 'SD-C',
          status: 'active', is_alive: false, has_uncommitted_changes: false, heartbeat_at: veryStale,
        },
      },
    });
    const holders = await getLiveClaimHolders(supabase);
    expect(holders).toEqual([]);
  });

  it('returns [] (fail-open) when supabase is missing', async () => {
    await expect(getLiveClaimHolders(null)).resolves.toEqual([]);
  });

  it('returns [] (fail-open) when the underlying query errors', async () => {
    const supabase = {
      from: () => ({
        select() { return this; },
        not() { return this; },
        order() { return this; },
        range: async () => ({ data: null, error: { message: 'connection reset' } }),
      }),
    };
    await expect(getLiveClaimHolders(supabase)).resolves.toEqual([]);
  });
});

describe('FR-3 hardened fake client (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B) — proves the harness itself can catch a phantom column', () => {
  it('errors when a caller requests the phantom last_heartbeat column, proving this fake client (unlike its pre-hardening version) would catch a QF-20260902-724-class regression', async () => {
    const supabase = makeSupabase({ sessions: { 'sess-1': { session_id: 'sess-1', sd_key: 'SD-A' } } });
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, last_heartbeat')
      .eq('session_id', 'sess-1')
      .maybeSingle();
    expect(data).toBeNull();
    expect(error?.message).toMatch(/last_heartbeat/);
  });

  it('does not error for the real columns ownership-detection.js actually requests', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sessions: { 'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now } },
    });
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, sd_key, status, is_alive, has_uncommitted_changes, heartbeat_at')
      .eq('session_id', 'sess-1')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data.session_id).toBe('sess-1');
  });
});

describe('getClaimHolderCached (opt-in TTL cache)', () => {
  it('caches result within ttlMs window — 2 calls = 1 DB query', async () => {
    const calls = { from: 0 };
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now },
      },
      calls,
    });
    await getClaimHolderCached('SD-A', { supabase, ttlMs: 60000 });
    await getClaimHolderCached('SD-A', { supabase, ttlMs: 60000 });
    expect(calls.from).toBe(2); // first call's 2 queries; second call cache hit
  });

  it('respects ttlMs expiry — refetches after ttl elapses', async () => {
    const calls = { from: 0 };
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, heartbeat_at: now },
      },
      calls,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T00:00:00Z'));
    await getClaimHolderCached('SD-A', { supabase, ttlMs: 1000 });
    vi.setSystemTime(new Date('2026-05-28T00:00:02Z')); // +2s past 1s TTL
    await getClaimHolderCached('SD-A', { supabase, ttlMs: 1000 });
    vi.useRealTimers();
    expect(calls.from).toBe(4); // both calls hit DB
  });
});
