/**
 * SD-FDBK-INFRA-WORKTREE-AUTO-REMOVED-001 (FR-2, FR-3) — cleanupOrphanFromMergeOutput.
 *
 * Verifies the NEW seam wiring the previously-dead detectOrphanWorktreeFromMerge
 * detector into the claim-aware post-merge cleanup:
 *   TS-6 positive: orphan detected + live claim → routed through cleanupWorktreeByPath
 *                  → archive-not-delete (NOT a hard delete).
 *   TS-7 negative: merge output with no deleted branch → no_orphan_detected.
 *   mapping: feat/<SD> → .worktrees/<SD>; qf/<QF> → .worktrees/qf/<QF>.
 *   advisory: function returns a result object and never throws on the
 *             negative/absent paths (does not hard-fail the /ship flow).
 *
 * detectOrphanWorktreeFromMerge's own parsing is covered by
 * tests/unit/lib/exec-context-guard.test.js — here we test the routing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupOrphanFromMergeOutput } from '../../scripts/modules/shipping/post-merge-worktree-cleanup.js';

const tmpDirs = [];
function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-merge-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// Minimal supabase stub: v_active_sessions.select(...).eq('computed_status','active')
// resolves to { data, error }. hasActiveClaimOnBranch awaits the .eq() result.
function supabaseWithClaim(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

describe('cleanupOrphanFromMergeOutput (FR-2 detector wiring)', () => {
  it('TS-7: merge output with no deleted branch → no_orphan_detected (pure, no side effects)', async () => {
    const res = await cleanupOrphanFromMergeOutput('✓ Merged pull request #123\n', {});
    expect(res.cleaned).toBe(false);
    expect(res.reason).toBe('no_orphan_detected');
  });

  it('mapping: feat/<SD> branch maps to .worktrees/<SD> (absent → orphan_worktree_not_present)', async () => {
    const mainRepoPath = makeTmpRepo(); // empty: no .worktrees/SD-NOPE-001
    const res = await cleanupOrphanFromMergeOutput(
      'Deleted branch feat/SD-NOPE-001 (was abc1234)',
      { mainRepoPath }
    );
    expect(res.cleaned).toBe(false);
    expect(res.reason).toBe('orphan_worktree_not_present');
    expect(res.branch).toBe('feat/SD-NOPE-001');
    expect(res.candidate.replace(/\\/g, '/')).toMatch(/\.worktrees\/SD-NOPE-001$/);
  });

  it('mapping: qf/<QF> branch maps to .worktrees/qf/<QF>', async () => {
    const mainRepoPath = makeTmpRepo();
    const res = await cleanupOrphanFromMergeOutput(
      'Deleted branch qf/QF-20260101-001',
      { mainRepoPath }
    );
    expect(res.reason).toBe('orphan_worktree_not_present');
    expect(res.candidate.replace(/\\/g, '/')).toMatch(/\.worktrees\/qf\/QF-20260101-001$/);
  });

  // SD-LEO-INFRA-WORKTREE-LIFECYCLE-FAILS-001 (FR-1): assertions amended, intent PRESERVED.
  // This test's purpose is "a live-claimed worktree must not be destroyed by the orphan
  // detector", and that still holds — more strongly than before. It used to be satisfied by
  // ARCHIVING (fs.renameSync, a MOVE), which protected the bytes but still yanked the
  // directory out from under a live holder and produced ENOENT on its next command. The
  // protect branch now performs no filesystem mutation at all, so the holder's worktree is
  // left exactly where it is. Same guarantee, one step stronger: not deleted AND not moved.
  it('TS-6: orphan detected + live claim → left in place (claim-aware, NOT deleted, NOT moved)', async () => {
    const mainRepoPath = makeTmpRepo();
    const wt = path.join(mainRepoPath, '.worktrees', 'SD-FOO-001');
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, 'marker.txt'), 'work in progress');

    const supabase = supabaseWithClaim([{
      session_id: 'sess-1',
      sd_key: 'SD-FOO-001',
      qf_id: null,
      current_branch: 'feat/SD-FOO-001',
      heartbeat_at: new Date(/* now */ Date.parse('2999-01-01T00:00:00Z')).toISOString(),
      computed_status: 'active',
    }]);

    const res = await cleanupOrphanFromMergeOutput(
      '✓ Deleted branch feat/SD-FOO-001',
      { mainRepoPath, supabase }
    );

    // Routed through claim-aware cleanup → refused, and nothing on disk was touched.
    expect(res.cleaned).toBe(false);
    expect(res.reason).toBe('active_claim_protect');
    expect(res.archived).toBe(false);
    expect(res.source).toBe('merge_output_detector');
    // The live holder's worktree is still exactly where it was, contents intact.
    expect(fs.existsSync(wt)).toBe(true);
    expect(fs.readFileSync(path.join(wt, 'marker.txt'), 'utf8')).toBe('work in progress');
    // ...and nothing was archived on this path.
    expect(res.archivePath).toBeUndefined();
    expect(fs.existsSync(path.join(mainRepoPath, '.worktrees', '_archive'))).toBe(false);
  });

  it('advisory: never throws on negative/absent inputs (does not hard-fail /ship)', async () => {
    await expect(cleanupOrphanFromMergeOutput('', {})).resolves.toBeTruthy();
    await expect(cleanupOrphanFromMergeOutput(null, {})).resolves.toBeTruthy();
    await expect(
      cleanupOrphanFromMergeOutput('Deleted branch feat/SD-GONE-001', { mainRepoPath: makeTmpRepo() })
    ).resolves.toMatchObject({ cleaned: false });
  });
});
