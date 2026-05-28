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
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getClaimHolder,
  getClaimHolderCached,
  isClaimedBy,
  classifyHoldingStatus,
  LIVENESS_THRESHOLD_SECONDS,
  DISPLAY_THRESHOLD_SECONDS,
  CLAIM_HOLDING_STATUSES,
  _clearCache,
} from '../../../lib/claim/ownership-detection.js';

beforeEach(() => {
  _clearCache();
});

// Build a fake supabase client supporting .from(t).select(...).eq(...).maybeSingle()
function makeSupabase({ sds = {}, sessions = {}, calls = { from: 0 } } = {}) {
  return {
    _calls: calls,
    from(table) {
      calls.from++;
      const data = table === 'strategic_directives_v2' ? sds : sessions;
      const builder = {
        _filters: {},
        select() { return builder; },
        eq(col, val) { builder._filters[col] = val; return builder; },
        not() { return builder; },
        maybeSingle: async () => {
          const sdKey = builder._filters.sd_key;
          const sessionId = builder._filters.session_id;
          const key = sdKey || sessionId;
          if (!key) return { data: null, error: null };
          const row = data[key];
          return { data: row || null, error: null };
        },
      };
      return builder;
    },
  };
}

describe('classifyHoldingStatus boundaries', () => {
  it('returns ALIVE_SOURCE_SIDE when has_uncommitted_changes overrides heartbeat staleness', () => {
    const stale = new Date(Date.now() - 9999 * 1000).toISOString();
    expect(classifyHoldingStatus({ has_uncommitted_changes: true, last_heartbeat: stale, is_alive: false })).toBe('ALIVE_SOURCE_SIDE');
  });

  it('returns ACTIVE when heartbeat is fresh (within LIVENESS 300s)', () => {
    const fresh = new Date(Date.now() - 100 * 1000).toISOString();
    expect(classifyHoldingStatus({ last_heartbeat: fresh, is_alive: true })).toBe('ACTIVE');
  });

  it('returns ALIVE_NO_HEARTBEAT at LIVENESS boundary + 5s when is_alive=true', () => {
    const stale = new Date(Date.now() - (LIVENESS_THRESHOLD_SECONDS + 5) * 1000).toISOString();
    expect(classifyHoldingStatus({ last_heartbeat: stale, is_alive: true })).toBe('ALIVE_NO_HEARTBEAT');
  });

  it('returns ALIVE_NO_HEARTBEAT for heartbeat between LIVENESS and DISPLAY thresholds', () => {
    const between = new Date(Date.now() - (LIVENESS_THRESHOLD_SECONDS + 100) * 1000).toISOString();
    expect(classifyHoldingStatus({ last_heartbeat: between, is_alive: false })).toBe('ALIVE_NO_HEARTBEAT');
  });

  it('returns STALE_UNKNOWN past DISPLAY threshold with no is_alive flag', () => {
    const veryStale = new Date(Date.now() - (DISPLAY_THRESHOLD_SECONDS + 100) * 1000).toISOString();
    expect(classifyHoldingStatus({ last_heartbeat: veryStale, is_alive: false })).toBe('STALE_UNKNOWN');
  });

  it('returns STALE_UNKNOWN for null session', () => {
    expect(classifyHoldingStatus(null)).toBe('STALE_UNKNOWN');
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
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, last_heartbeat: now },
      },
    });
    const holder = await getClaimHolder('SD-A', supabase);
    expect(holder).not.toBeNull();
    expect(holder.session_id).toBe('sess-1');
    expect(holder.is_alive).toBe(true);
    expect(holder.holding_status).toBe('ACTIVE');
  });

  it('is UNCACHED — 2 sequential calls each query DB (per DESIGN Q3)', async () => {
    const calls = { from: 0 };
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, last_heartbeat: now },
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
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, last_heartbeat: now },
      },
    });
    await expect(isClaimedBy('SD-A', 'sess-1', supabase)).resolves.toBe(true);
  });

  it('returns false when SD claim differs', async () => {
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-other' } },
      sessions: {
        'sess-other': { session_id: 'sess-other', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, last_heartbeat: now },
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
});

describe('getClaimHolderCached (opt-in TTL cache)', () => {
  it('caches result within ttlMs window — 2 calls = 1 DB query', async () => {
    const calls = { from: 0 };
    const now = new Date().toISOString();
    const supabase = makeSupabase({
      sds: { 'SD-A': { sd_key: 'SD-A', claiming_session_id: 'sess-1' } },
      sessions: {
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, last_heartbeat: now },
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
        'sess-1': { session_id: 'sess-1', sd_key: 'SD-A', status: 'active', is_alive: true, has_uncommitted_changes: false, last_heartbeat: now },
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
