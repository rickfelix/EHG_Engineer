/**
 * QF-20260904-139: worktree-reaper reclaimed a live-claimed tree whose directory was reused
 * (basename still named a CLOSED QF) while checked out on a LIVE SD's branch, because the
 * reaper's last-line removal guard (liveClaimBlocksRemoval) resolved its holder key from the
 * directory basename only -- never the checked-out branch, never a reuse marker.
 *
 * Incident fixture, reproduced here: directory basename = QF-20260903-451 (closed), checked
 * out on branch feat/SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 (a live SD claim). Before
 * this fix, keyFromWorktreePath resolved 'QF-20260903-451' from the basename, found it closed,
 * and cleared removal. After this fix, resolveHolderKey prefers the reuse marker, then the
 * checked-out branch, so the live SD claim is found and removal is blocked.
 */

import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveHolderKey,
  liveClaimBlocksRemoval,
} from '../../lib/worktree-reaper/live-claim-guard.js';
import { writeReuseMarker } from '../../lib/fleet/worktree-reuse-marker.js';

const aliveFn = () => ({ alive: true });

/** Mirrors the mockSupabase shape in live-claim-guard-qf432.test.js, plus .or() for QF-kind scans. */
function mockSupabaseClaiming(claimant, { pointingSession = null } = {}) {
  return {
    from: (table) => ({
      select: () => ({
        eq: (col) => {
          if (table === 'v_active_sessions' && col === 'session_id') {
            return { maybeSingle: async () => ({ data: { session_id: claimant }, error: null }) };
          }
          if (table === 'v_active_sessions') {
            return { limit: async () => ({ data: pointingSession ? [pointingSession] : [], error: null }) };
          }
          return { maybeSingle: async () => ({ data: { claiming_session_id: claimant }, error: null }) };
        },
        or: () => ({ limit: async () => ({ data: pointingSession ? [pointingSession] : [], error: null }) }),
      }),
    }),
  };
}

function mkTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf139-'));
  return dir;
}

describe('resolveHolderKey (QF-20260904-139)', () => {
  test('reuse marker wins over both branch and basename', () => {
    const dir = mkTree();
    writeReuseMarker(dir, { key: 'SD-LIVE-FROM-MARKER-001' });
    const { parsed, source } = resolveHolderKey({ path: dir, branch: 'feat/SD-FROM-BRANCH-001' });
    expect(source).toBe('reuse_marker');
    expect(parsed).toEqual({ kind: 'sd', key: 'SD-LIVE-FROM-MARKER-001' });
  });

  test('branch wins over basename when no marker is present', () => {
    const parsed = resolveHolderKey({
      path: 'C:/repo/.worktrees/qf/QF-20260903-451',
      branch: 'feat/SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001',
    });
    expect(parsed.source).toBe('branch');
    expect(parsed.parsed).toEqual({ kind: 'sd', key: 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001' });
  });

  test('falls back to basename when neither marker nor a key-shaped branch is present', () => {
    const parsed = resolveHolderKey({ path: 'C:/repo/.worktrees/qf/QF-20260710-999', branch: 'main' });
    expect(parsed.source).toBe('basename');
    expect(parsed.parsed).toEqual({ kind: 'qf', key: 'QF-20260710-999' });
  });

  test('an expired reuse marker is treated as absent (falls through to branch)', () => {
    const dir = mkTree();
    fs.writeFileSync(
      path.join(dir, '.worktree-reuse.json'),
      JSON.stringify({ key: 'SD-STALE-001', marked_at: new Date(Date.now() - 999 * 60 * 1000).toISOString() }),
      'utf8'
    );
    const { parsed, source } = resolveHolderKey({ path: dir, branch: 'feat/SD-FRESH-001' });
    expect(source).toBe('branch');
    expect(parsed).toEqual({ kind: 'sd', key: 'SD-FRESH-001' });
  });
});

describe('liveClaimBlocksRemoval — QF-20260904-139 incident regression', () => {
  test('a directory reused from a closed QF, checked out on a live SD branch, is now BLOCKED via the branch-derived key', async () => {
    const supabase = mockSupabaseClaiming('live-session-hotel');
    const r = await liveClaimBlocksRemoval(
      supabase,
      'C:/repo/.worktrees/qf/QF-20260903-451',
      { branch: 'feat/SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001', isSessionAliveFn: aliveFn }
    );
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('live_claimed');
    expect(r.detail.key).toBe('SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001');
    expect(r.detail.key_source).toBe('branch');
  });

  test('a reuse marker naming a live SD claim blocks removal even on a directory named after a closed QF with no key-shaped branch', async () => {
    const dir = mkTree();
    writeReuseMarker(dir, { key: 'SD-LIVE-VIA-MARKER-002' });
    const supabase = mockSupabaseClaiming('live-session-marker');
    const r = await liveClaimBlocksRemoval(supabase, dir, { branch: 'main', isSessionAliveFn: aliveFn });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('live_claimed');
    expect(r.detail.key).toBe('SD-LIVE-VIA-MARKER-002');
    expect(r.detail.key_source).toBe('reuse_marker');
  });

  test('without a live claim on the resolved key, removal still clears (no over-protection)', async () => {
    const supabase = mockSupabaseClaiming(null);
    const r = await liveClaimBlocksRemoval(
      supabase,
      'C:/repo/.worktrees/qf/QF-20260903-451',
      { branch: 'feat/SD-ALSO-NOT-CLAIMED-001', isSessionAliveFn: aliveFn }
    );
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe('no_live_claim');
    expect(r.detail.key_source).toBe('branch');
  });
});
