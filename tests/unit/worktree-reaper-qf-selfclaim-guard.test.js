/**
 * SD-FDBK-FIX-WORKTREE-REAPER-DESTROYED-001 — regression pins for the 3rd-recurrence
 * DESTRUCTIVE reap of a live self-claimed QF worktree (.worktrees/qf/QF-20260712-008,
 * Alpha-6). RCA 7c61d78f / DATABASE 302bb2c7: a self-claimed QF records its live claim
 * ONLY in claude_sessions.sd_key='QF-...' (quick_fixes.claiming_session_id NULL, so
 * v_active_sessions.qf_id is NULL). The guard scanned qf_id alone → no_live_claim →
 * the reaper destroyed the live worktree. The fix reads BOTH representations and the
 * claim map derives the typed qf/ path; both are pinned here.
 */
import { describe, it, expect, vi } from 'vitest';
import { liveClaimBlocksRemoval } from '../../lib/worktree-reaper/live-claim-guard.js';
import { loadClaimMap } from '../../scripts/worktree-reaper.mjs';

const alive = () => ({ alive: true });

/**
 * Mock supporting the FR-1 shape: quick_fixes.claiming_session_id lookup (maybeSingle)
 * returns NULL (self-claim), then a v_active_sessions .or(sd_key|qf_id) scan (.limit).
 * `orRows` is what the .or scan returns; `orError` injects a scan error (fail-closed test).
 */
function mockSupabase({ orRows = [], orError = null } = {}) {
  return {
    from: vi.fn((table) => ({
      select: vi.fn().mockReturnThis(),
      // quick_fixes.eq('id', key).maybeSingle() → no SD-side claim (self-claim)
      eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { claiming_session_id: null }, error: null }) })),
      // v_active_sessions.or(...).limit(1) → the live-session scan
      or: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: orRows, error: orError }) })),
    })),
  };
}

describe('liveClaimBlocksRemoval — self-claimed QF (QF-20260712-008 incident shape)', () => {
  const WT = 'c:/repo/.worktrees/qf/qf-20260712-008';

  it('THE FIX: a QF whose only live signal is a session pointing via sd_key => BLOCKED (was destroyed before)', async () => {
    const supabase = mockSupabase({ orRows: [{ session_id: 'sess-alpha6', sd_key: 'QF-20260712-008', qf_id: null }] });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: alive });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('live_session_pointing');
  });

  it('genuine orphan: no live session by sd_key OR qf_id => not blocked (no over-protection)', async () => {
    const supabase = mockSupabase({ orRows: [] });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: alive });
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe('no_live_claim');
  });

  it('FAIL-CLOSED: the sd_key/qf_id scan errors => BLOCKED', async () => {
    const supabase = mockSupabase({ orError: { message: 'connection reset' } });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: alive });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('unverifiable_session_scan_error');
  });
});

describe('loadClaimMap — self-claimed QF path derivation (FR-2/FR-4)', () => {
  const repoRoot = 'C:/repo';
  // normalizePath does path.resolve → prefix is cwd-dependent on POSIX (CI) vs Windows.
  // Assert on the platform-agnostic SUFFIX (lowercased, forward-slash).
  const hasQfPath = (map) =>
    [...map.keys()].map((k) => k.replace(/\\/g, '/').toLowerCase())
      .some((k) => k.endsWith('/.worktrees/qf/qf-20260712-008'));

  /** Mock the v_active_sessions .or(...) select used by loadClaimMap. */
  function claimMapSupabase(rows) {
    return { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), or: vi.fn().mockResolvedValue({ data: rows, error: null }) })) };
  }

  it('FR-2: a session with sd_key=QF-X (qf_id NULL) maps to .worktrees/qf/QF-X', async () => {
    const now = new Date().toISOString();
    const supabase = claimMapSupabase([
      { session_id: 's1', sd_key: 'QF-20260712-008', qf_id: null, current_branch: 'qf/QF-20260712-008', heartbeat_at: now, computed_status: 'active' },
    ]);
    const map = await loadClaimMap(supabase, { repoRoot });
    
    expect(hasQfPath(map)).toBe(true);
  });

  it('FR-4: a churning session reported computed_status=idle is still mapped (heartbeat is fresh)', async () => {
    const now = new Date().toISOString();
    const supabase = claimMapSupabase([
      { session_id: 's2', sd_key: 'QF-20260712-008', qf_id: null, current_branch: null, heartbeat_at: now, computed_status: 'idle' },
    ]);
    const map = await loadClaimMap(supabase, { repoRoot });
    
    expect(hasQfPath(map)).toBe(true);
  });
});
