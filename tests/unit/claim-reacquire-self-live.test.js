/**
 * Unit tests for lib/claim/reacquire-self-live.mjs
 * SD-FDBK-ENH-CLAIM-WORKING-GOES-001 (Approach B)
 *
 * Covers the re-acquire predicate + fail-closed CAS at the handoff claim
 * chokepoint. DB-agnostic: Supabase is mocked the way neighboring tests do
 * (claim-validity-gate.test.js routing mock).
 *
 * Mandatory scenarios:
 *   TS-1 positive: self-owned (cwd in worktree) + sweep-released + no live
 *                  foreign holder => re-acquires (CAS fires, is_working_on set).
 *   TS-2 negative: foreign session holds the claim (allowReclaim=false) => no re-acquire.
 *   TS-3 negative: not self-owned (cwd outside worktree AND resolveOwnSession
 *                  sd_key != claim) => no re-acquire.
 *   TS-4 race:     CAS uses claiming_session_id IS NULL / self guard; a
 *                  concurrent foreign claim makes the update a no-op.
 *   TS-5 flag off: CLAIM_REACQUIRE_SELF_LIVE='false' => no-op.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  reacquireSelfLiveClaim,
  resolveSelfOwnership,
  isCwdInsideWorktree,
} from '../../lib/claim/reacquire-self-live.mjs';

const SD_KEY = 'SD-FOO-001';
const WT = '/repo/.worktrees/SD-FOO-001';
const SELF = 'session_self_123';
const FOREIGN = 'session_foreign_999';

/**
 * Routing Supabase mock.
 * - SELECT path: .from('strategic_directives_v2').select(cols).eq('sd_key',k).maybeSingle() => { data: freshRow }
 * - UPDATE path: .from(...).update(payload).eq('sd_key',k).or(filter).select(cols) => resolves with `updateReturns`
 *   and records the call in _updateCalls (payload + the .or() filter string).
 *
 * @param {object} opts
 * @param {object|null} opts.freshRow   row returned by the fresh SELECT
 * @param {Array|null}  opts.updateReturns  rows the CAS .select() resolves to ([] => no-op)
 * @param {object} [opts.selectError]  optional error for the SELECT
 * @param {object} [opts.updateError]  optional error for the UPDATE
 */
function buildSupabase({ freshRow, updateReturns = [{ sd_key: SD_KEY, is_working_on: true, claiming_session_id: SELF }], selectError = null, updateError = null }) {
  const updateCalls = [];
  const sb = {
    from: vi.fn(() => ({
      // SELECT branch (fresh read)
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: freshRow, error: selectError })),
        })),
      })),
      // UPDATE branch (CAS)
      update: vi.fn((payload) => ({
        eq: vi.fn((col, val) => ({
          or: vi.fn((orFilter) => ({
            select: vi.fn(() => {
              updateCalls.push({ payload, where: [col, val], orFilter });
              return Promise.resolve({ data: updateError ? null : updateReturns, error: updateError });
            }),
          })),
        })),
      })),
    })),
    _updateCalls: updateCalls,
  };
  return sb;
}

const allowReclaim = (allow) => vi.fn(() => Promise.resolve({ allowReclaim: allow, evidence: [], classification: allow ? null : 'healthy' }));
const resolveSelf = (data, source = 'env_var') => vi.fn(() => Promise.resolve({ data, source }));
const silentLog = () => {};

describe('isCwdInsideWorktree (FR-2a predicate)', () => {
  it('matches exact + descendant, case-insensitive on win32, rejects siblings', () => {
    expect(isCwdInsideWorktree('C:/r/.worktrees/SD-A', 'C:/r/.worktrees/SD-A', 'win32')).toBe(true);
    expect(isCwdInsideWorktree('C:\\r\\.worktrees\\SD-A\\sub', 'C:/r/.worktrees/SD-A', 'win32')).toBe(true);
    expect(isCwdInsideWorktree('C:/R/.WORKTREES/sd-a', 'C:/r/.worktrees/SD-A', 'win32')).toBe(true);
    expect(isCwdInsideWorktree('C:/r/.worktrees/SD-A-OTHER', 'C:/r/.worktrees/SD-A', 'win32')).toBe(false);
  });
  it('matches descendant + rejects sibling on posix', () => {
    expect(isCwdInsideWorktree('/r/.worktrees/SD-A/x', '/r/.worktrees/SD-A', 'linux')).toBe(true);
    expect(isCwdInsideWorktree('/r/.worktrees/SD-A-OTHER', '/r/.worktrees/SD-A', 'linux')).toBe(false);
  });
  it('returns false on missing inputs', () => {
    expect(isCwdInsideWorktree(null, '/x', 'linux')).toBe(false);
    expect(isCwdInsideWorktree('/x', undefined, 'linux')).toBe(false);
  });
});

describe('resolveSelfOwnership (FR-2a)', () => {
  it('self-owns via worktree_path when cwd is inside it', async () => {
    const r = await resolveSelfOwnership({
      sd: { sd_key: SD_KEY, worktree_path: WT },
      cwd: `${WT}/sub`,
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      platform: 'linux',
    });
    expect(r.selfOwned).toBe(true);
    expect(r.via).toBe('worktree_path');
    expect(r.sessionId).toBe(SELF);
  });

  it('orchestrator fallback: no worktree_path but deterministic session sd_key matches', async () => {
    const r = await resolveSelfOwnership({
      sd: { sd_key: SD_KEY, worktree_path: null },
      cwd: '/some/other/dir',
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      platform: 'linux',
    });
    expect(r.selfOwned).toBe(true);
    expect(r.via).toBe('resolve_own_session_sd_key');
  });

  it('NOT self-owned: cwd outside worktree AND resolved sd_key differs', async () => {
    const r = await resolveSelfOwnership({
      sd: { sd_key: SD_KEY, worktree_path: WT },
      cwd: '/repo/main',
      resolveSession: resolveSelf({ session_id: SELF, sd_key: 'SD-OTHER-002' }),
      platform: 'linux',
    });
    expect(r.selfOwned).toBe(false);
  });

  it('NOT self-owned via fallback when resolveOwnSession is heartbeat_fallback', async () => {
    const r = await resolveSelfOwnership({
      sd: { sd_key: SD_KEY, worktree_path: null },
      cwd: '/repo/main',
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }, 'heartbeat_fallback'),
      platform: 'linux',
    });
    expect(r.selfOwned).toBe(false);
  });
});

describe('reacquireSelfLiveClaim', () => {
  // TS-1
  it('TS-1 positive: self-owned + sweep-released + no live foreign holder => re-acquires (CAS fires)', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT },
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });

    expect(result.reacquired).toBe(true);
    expect(result.via).toBe('worktree_path');
    expect(sb._updateCalls).toHaveLength(1);
    expect(sb._updateCalls[0].payload).toMatchObject({ is_working_on: true, claiming_session_id: SELF, active_session_id: SELF });
    expect(sb._updateCalls[0].where).toEqual(['sd_key', SD_KEY]);
  });

  // TS-2
  it('TS-2 negative: foreign session holds the claim (allowReclaim=false) => no re-acquire, no CAS write', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: FOREIGN, active_session_id: FOREIGN, worktree_path: WT },
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(false), // live foreign holder
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });

    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('live_foreign_holder');
    expect(sb._updateCalls).toHaveLength(0); // never wrote
  });

  // TS-3
  it('TS-3 negative: not self-owned (cwd outside worktree AND resolved sd_key != claim) => no re-acquire', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT },
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: 'SD-OTHER-002' }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: '/repo/main', // NOT inside WT
      platform: 'linux',
      log: silentLog,
    });

    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('not_self_owned');
    expect(sb._updateCalls).toHaveLength(0);
  });

  // TS-4
  it('TS-4 race: CAS guards on claiming_session_id IS NULL / self; concurrent foreign claim makes it a no-op', async () => {
    // Fresh read saw unclaimed, but the CAS .select() returns [] (0 rows) because
    // a foreign claim landed between read and write — the .or() guard excluded it.
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT },
      updateReturns: [], // CAS matched 0 rows
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });

    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('cas_noop_foreign_or_changed');
    // The CAS was attempted with the null/self guard.
    expect(sb._updateCalls).toHaveLength(1);
    expect(sb._updateCalls[0].orFilter).toBe(`claiming_session_id.is.null,claiming_session_id.eq.${SELF}`);
  });

  it('TS-4b: when self session id is unknown, CAS guards on claiming_session_id IS NULL only', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT },
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      // worktree witness proves ownership; resolveSession yields no usable session id
      resolveSession: resolveSelf(null, 'env_var'),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });

    expect(result.reacquired).toBe(true);
    expect(sb._updateCalls[0].orFilter).toBe('claiming_session_id.is.null');
    // No claiming_session_id written when self id is unknown (still sets is_working_on).
    expect(sb._updateCalls[0].payload).toEqual({ is_working_on: true });
  });

  // TS-5
  it('TS-5 flag off: CLAIM_REACQUIRE_SELF_LIVE="false" => strict no-op (no DB calls)', async () => {
    const sb = buildSupabase({ freshRow: null });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      env: { CLAIM_REACQUIRE_SELF_LIVE: 'false' },
      log: silentLog,
    });

    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('flag_disabled');
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('default-on: unset flag behaves as enabled', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT },
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      env: {}, // flag unset
      log: silentLog,
    });
    expect(result.reacquired).toBe(true);
  });

  it('healthy path: cached is_working_on=true => no-op, no DB read', async () => {
    const sb = buildSupabase({ freshRow: null });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: true, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('already_working_cached');
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('fresh read shows is_working_on=true (restored concurrently) => no-op, no CAS', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: true, claiming_session_id: SELF, active_session_id: SELF, worktree_path: WT },
    });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT }, // cached stale=false
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('already_working');
    expect(sb._updateCalls).toHaveLength(0);
  });

  it('degrades (no throw) when fresh read errors => no re-acquire', async () => {
    const sb = buildSupabase({ freshRow: null, selectError: { message: 'db down' } });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });
    expect(result.reacquired).toBe(false);
    expect(result.reason).toMatch(/^fresh_read_error:/);
  });

  it('evidence probe throwing degrades to fail-open; CAS guard still protects', async () => {
    const sb = buildSupabase({
      freshRow: { sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT },
    });
    const throwingEvidence = vi.fn(() => Promise.reject(new Error('triangulate exploded')));
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
      resolveSession: resolveSelf({ session_id: SELF, sd_key: SD_KEY }),
      checkPreClaimEvidence: throwingEvidence,
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });
    // Fail-open on the probe → proceeds to CAS (which here succeeds).
    expect(result.reacquired).toBe(true);
    expect(sb._updateCalls).toHaveLength(1);
  });

  it('no sd_key => no-op', async () => {
    const sb = buildSupabase({ freshRow: null });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { is_working_on: false },
      resolveSession: resolveSelf({ session_id: SELF }),
      checkPreClaimEvidence: allowReclaim(true),
      cwd: WT,
      platform: 'linux',
      log: silentLog,
    });
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('no_sd_key');
    expect(sb.from).not.toHaveBeenCalled();
  });
});
