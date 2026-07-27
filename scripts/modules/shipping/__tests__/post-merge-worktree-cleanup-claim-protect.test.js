/**
 * SD-FDBK-INFRA-POST-MERGE-WORKTREE-001 regression-pin tests.
 *
 * Verifies hasActiveClaimOnBranch + cleanupWorktreeByPath claim-protect
 * integration. Mirrors the worktree-reaper loadClaimMap pattern shipped in
 * PR #3677 (17th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * Schema-correct VIEW projection (v_active_sessions lacks worktree_path/last_heartbeat_at):
 *   session_id, sd_key, qf_id, current_branch, heartbeat_at, computed_status
 * QF-20260712-249 adds the live-cwd guard: a SECOND query reading worktree_path from
 * the claude_sessions BASE TABLE (column exists there) so a released-claim session
 * still cwd'd in the worktree blocks cleanup.
 *
 * FAIL-LOUD on postgrest schema/query errors (silent-swallow caused QF-WT-CLAIM-PROTECT-001 P0).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  hasActiveClaimOnBranch,
  cleanupWorktreeByPath
} from '../post-merge-worktree-cleanup.js';

// In-memory table-aware mock:
//   from('v_active_sessions').select('...').eq('computed_status','active')  → { data, error }
//   from('claude_sessions').select('...').in().gte().not(...)               → { pathData, pathError }
// (QF-20260712-249: the live-cwd guard added a second, base-table query.)
function mockSupabase({ data = null, error = null, pathData = [], pathError = null } = {}) {
  return {
    from(table) {
      if (table === 'claude_sessions') {
        const result = Promise.resolve({ data: pathData, error: pathError });
        const chain = {
          select() { return chain; },
          in() { return chain; },
          gte() { return chain; },
          not() { return result; }
        };
        return chain;
      }
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data, error });
            }
          };
        }
      };
    }
  };
}

// Build a tmp main repo + bare remote + .worktrees/<sd_key>/ subdir.
// Bare remote is required so hasUnpushedCommits can resolve origin/main and
// return cleaned=false when no commits diverge.
function setupTmpRepo(sdKey = 'SD-CLAIM-PROTECT-TEST-001') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-claim-protect-'));
  const remote = path.join(root, 'remote.git');
  const main = path.join(root, 'main');
  fs.mkdirSync(main, { recursive: true });
  execSync(`git init --bare "${remote}"`, { stdio: 'pipe' });
  execSync('git init', { cwd: main, stdio: 'pipe' });
  execSync('git config user.email t@t', { cwd: main, stdio: 'pipe' });
  execSync('git config user.name t', { cwd: main, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: main, stdio: 'pipe' });
  execSync(`git remote add origin "${remote}"`, { cwd: main, stdio: 'pipe' });
  fs.writeFileSync(path.join(main, 'README.md'), 'x');
  execSync('git add . && git commit -m init', { cwd: main, stdio: 'pipe' });
  execSync('git branch -M main', { cwd: main, stdio: 'pipe' });
  execSync('git push -u origin main', { cwd: main, stdio: 'pipe' });
  const wtPath = path.join(main, '.worktrees', sdKey);
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  execSync(`git worktree add "${wtPath}" -b feat/${sdKey}`, { cwd: main, stdio: 'pipe' });
  return { root, remote, main, wtPath, sdKey };
}

function cleanupTmp(env) {
  try { fs.rmSync(env.root, { recursive: true, force: true }); } catch { /* best effort */ }
}

describe('hasActiveClaimOnBranch — schema + matching', () => {
  let env;
  beforeEach(() => { env = setupTmpRepo(); });
  afterEach(() => cleanupTmp(env));

  it('returns null when supabase data is empty', async () => {
    const sb = mockSupabase({ data: [] });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).toBeNull();
  });

  it('returns null when no client and no env vars (fail-soft transport)', async () => {
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const origAnon = process.env.SUPABASE_ANON_KEY;
    const origNxt = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origNxtAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      const result = await hasActiveClaimOnBranch(env.wtPath, env.main);
      expect(result).toBeNull();
    } finally {
      if (origUrl) process.env.SUPABASE_URL = origUrl;
      if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
      if (origAnon) process.env.SUPABASE_ANON_KEY = origAnon;
      if (origNxt) process.env.NEXT_PUBLIC_SUPABASE_URL = origNxt;
      if (origNxtAnon) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origNxtAnon;
    }
  });

  it('FAIL-LOUD throws when supabase returns postgrest error', async () => {
    const sb = mockSupabase({ error: { message: 'column reference does not exist', code: '42703' } });
    await expect(hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb }))
      .rejects.toThrow(/hasActiveClaimOnBranch query failed/);
    await expect(hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb }))
      .rejects.toThrow(/code=42703/);
  });

  it('matches via sd_key path-derivation', async () => {
    const sb = mockSupabase({
      data: [{
        session_id: 'sess-1',
        sd_key: env.sdKey,
        qf_id: null,
        current_branch: `feat/${env.sdKey}`,
        heartbeat_at: new Date().toISOString(),
        computed_status: 'active'
      }]
    });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).not.toBeNull();
    expect(result.session_id).toBe('sess-1');
    expect(result.sd_key).toBe(env.sdKey);
  });

  it('matches via qf branch-fallback derivation (.worktrees/qf/<qf_id>)', async () => {
    // override env to qf path
    const qfId = 'QF-TEST-001';
    const qfPath = path.join(env.main, '.worktrees', 'qf', qfId);
    fs.mkdirSync(qfPath, { recursive: true });
    const sb = mockSupabase({
      data: [{
        session_id: 'sess-2',
        sd_key: null,
        qf_id: qfId,
        current_branch: `qf/${qfId}`,
        heartbeat_at: new Date().toISOString(),
        computed_status: 'active'
      }]
    });
    const result = await hasActiveClaimOnBranch(qfPath, env.main, { supabase: sb });
    expect(result).not.toBeNull();
    expect(result.qf_id).toBe(qfId);
  });

  it('filters out stale heartbeat (>2h) — does NOT block cleanup', async () => {
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const sb = mockSupabase({
      data: [{
        session_id: 'sess-3',
        sd_key: env.sdKey,
        qf_id: null,
        current_branch: `feat/${env.sdKey}`,
        heartbeat_at: stale,
        computed_status: 'active'
      }]
    });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).toBeNull();
  });

  it('filters out null heartbeat_at defensively', async () => {
    const sb = mockSupabase({
      data: [{
        session_id: 'sess-4',
        sd_key: env.sdKey,
        qf_id: null,
        current_branch: `feat/${env.sdKey}`,
        heartbeat_at: null,
        computed_status: 'active'
      }]
    });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).toBeNull();
  });

  // QF-20260712-249 (signal fbe71ad2) — the incident case: claim already RELEASED
  // (sd_key/qf_id null, current_branch back on main, absent from v_active_sessions)
  // but the session is still cwd'd in the worktree running its post-completion tail.
  // The live-cwd guard on claude_sessions.worktree_path must block cleanup.
  it('live-cwd guard: blocks when a released-claim session still lives in the worktree', async () => {
    const sb = mockSupabase({
      data: [], // no claim-derived match — the old guard would have passed
      pathData: [{
        session_id: 'sess-tail',
        sd_key: null,
        qf_id: null,
        current_branch: 'main',
        heartbeat_at: new Date().toISOString(),
        worktree_path: env.wtPath
      }]
    });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).not.toBeNull();
    expect(result.session_id).toBe('sess-tail');
    expect(result.matched_by).toBe('worktree_path');
  });

  it('live-cwd guard: Windows backslash worktree_path still matches (normalized)', async () => {
    const sb = mockSupabase({
      data: [],
      pathData: [{
        session_id: 'sess-win',
        sd_key: null,
        qf_id: null,
        current_branch: 'main',
        heartbeat_at: new Date().toISOString(),
        worktree_path: env.wtPath.replace(/\//g, '\\') + '\\'
      }]
    });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).not.toBeNull();
    expect(result.matched_by).toBe('worktree_path');
  });

  it('live-cwd guard: non-matching worktree_path does not block', async () => {
    const sb = mockSupabase({
      data: [],
      pathData: [{
        session_id: 'sess-other',
        sd_key: null,
        qf_id: null,
        current_branch: 'main',
        heartbeat_at: new Date().toISOString(),
        worktree_path: path.join(env.main, '.worktrees', 'SD-SOMETHING-ELSE-001')
      }]
    });
    const result = await hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb });
    expect(result).toBeNull();
  });

  it('live-cwd guard: FAIL-LOUD when the base-table query errors', async () => {
    const sb = mockSupabase({ data: [], pathError: { message: 'permission denied', code: '42501' } });
    await expect(hasActiveClaimOnBranch(env.wtPath, env.main, { supabase: sb }))
      .rejects.toThrow(/live-cwd guard query failed/);
  });
});

describe('cleanupWorktreeByPath — claim-protect integration', () => {
  let env;
  beforeEach(() => { env = setupTmpRepo(); });
  afterEach(() => cleanupTmp(env));

  // P0 fix (feedback 65ef1075, Golf-3 2026-07-17): a LIVE claim must LEAVE the
  // worktree fully in place. The prior behavior archived (moved) it, which yanked
  // the active session's working dir out from under it — the reported P0. Archiving
  // preserves the files but breaks the live session; leave-in-place preserves both.
  it('leaves the worktree fully in place when active claim matches (does NOT move/archive)', async () => {
    const sb = mockSupabase({
      data: [{
        session_id: 'sess-A',
        sd_key: env.sdKey,
        qf_id: null,
        current_branch: `feat/${env.sdKey}`,
        heartbeat_at: new Date().toISOString(),
        computed_status: 'active'
      }]
    });
    const result = await cleanupWorktreeByPath(env.wtPath, { supabase: sb });
    expect(result.cleaned).toBe(false);
    expect(result.reason).toBe('active_claim_protect');
    expect(result.claim?.session_id).toBe('sess-A');
    // Live claim → worktree left untouched at its original path.
    expect(fs.existsSync(env.wtPath)).toBe(true);
    // Nothing was moved: no _archive dir was created, and the result carries no archivePath.
    expect(fs.existsSync(path.join(env.main, '.worktrees', '_archive'))).toBe(false);
    expect(result.archivePath).toBeUndefined();
  });

  it('proceeds with cleanup when no active claim matches', async () => {
    const sb = mockSupabase({ data: [] });
    const result = await cleanupWorktreeByPath(env.wtPath, { supabase: sb });
    expect(result.cleaned).toBe(true);
    expect(result.workKey).toBe(env.sdKey);
  });

  // R-6 (testing-agent binding): PostgrestError must NOT escape cleanupWorktreeByPath.
  // Translate to fail-SAFE — treat unknown DB state as if a claim is held. P0 fix
  // (feedback 65ef1075): "as if a claim is held" means LEAVE IN PLACE, not archive.
  // Moving a possibly-live worktree is the exact P0; leave-in-place preserves the
  // work AND avoids breaking a live session. A thrown PostgrestError is still averted.
  it('R-6: fail-safe on PostgrestError — leaves worktree in place, reason=db_error_fail_safe, no throw', async () => {
    const sb = mockSupabase({ error: { message: 'connection terminated', code: 'XX000' } });
    const result = await cleanupWorktreeByPath(env.wtPath, { supabase: sb });
    expect(result.cleaned).toBe(false);
    expect(result.reason).toBe('db_error_fail_safe');
    expect(result.error).toMatch(/connection terminated/);
    // Fail-safe = do not touch the worktree (it may host a live session).
    expect(fs.existsSync(env.wtPath)).toBe(true);
    expect(fs.existsSync(path.join(env.main, '.worktrees', '_archive'))).toBe(false);
    expect(result.archivePath).toBeUndefined();
  });

  // Surgical-fix pin: the delete-abort path (unpushed commits, NO active claim) must
  // STILL archive — the P0 fix only stops archiving on the live-claim/DB-error paths,
  // it must not regress code-loss prevention where there is genuinely no live session.
  it('still archives on unpushed_commits when no active claim (code-loss prevention intact)', async () => {
    // Create an unpushed commit in the worktree, with no matching active claim.
    fs.writeFileSync(path.join(env.wtPath, 'unpushed.txt'), 'work in progress');
    execSync('git add . && git commit -m "unpushed work"', { cwd: env.wtPath, stdio: 'pipe' });
    const sb = mockSupabase({ data: [] }); // no claim
    const result = await cleanupWorktreeByPath(env.wtPath, { supabase: sb });
    expect(result.cleaned).toBe(false);
    expect(result.reason).toBe('unpushed_commits');
    // Delete-abort with unpushed code → archived (moved) to preserve recoverable copy.
    expect(fs.existsSync(env.wtPath)).toBe(false);
    expect(fs.existsSync(path.join(env.main, '.worktrees', '_archive'))).toBe(true);
  });
});

describe('static-guard — source ordering pin', () => {
  it('hasActiveClaimOnBranch invocation precedes hasUnpushedCommits and git worktree remove', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'post-merge-worktree-cleanup.js'),
      'utf8'
    );
    // Locate the cleanupWorktreeByPath function body
    const fnStart = src.indexOf('async function cleanupWorktreeByPath(');
    expect(fnStart).toBeGreaterThan(0);
    // Find the next top-level function (or end of file) as a soft body boundary
    const fnEnd = src.indexOf('\nasync function cleanupBySDKey', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);

    const idxClaim = body.indexOf('hasActiveClaimOnBranch');
    const idxUnpushed = body.indexOf('hasUnpushedCommits');
    // QF-20260712-249: SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 replaced the literal
    // `git worktree remove` with the removeWorktreeViaGit() helper — this pin had been
    // failing silently since (suite is excluded from the default runner). Same intent:
    // the claim check must precede the actual removal call.
    const idxRemove = body.indexOf('removeWorktreeViaGit');

    expect(idxClaim).toBeGreaterThan(0);
    expect(idxUnpushed).toBeGreaterThan(idxClaim);
    expect(idxRemove).toBeGreaterThan(idxClaim);
  });

  it('schema projection literal pins canonical column set (FAIL-LOUD on drift)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'post-merge-worktree-cleanup.js'),
      'utf8'
    );
    // Pin the projection so future column rename surfaces here, not in prod.
    expect(src).toMatch(/\.from\('v_active_sessions'\)/);
    expect(src).toMatch(/\.select\('session_id, sd_key, qf_id, current_branch, heartbeat_at, computed_status'\)/);
    expect(src).toMatch(/\.eq\('computed_status', 'active'\)/);
    // The VIEW projection must never gain the columns it does not expose
    // (PR #3677 P0: silent-swallow on column-not-found). QF-20260712-249 narrowed
    // this pin: worktree_path IS selected from the claude_sessions BASE TABLE
    // (live-cwd guard) where the column exists — only the view select is forbidden
    // from naming it. Pin the exact view select, then the base-table select.
    expect(src).not.toMatch(/\.select\('[^']*computed_status[^']*worktree_path[^']*'\)/);
    expect(src).not.toMatch(/\.select\([^)]*last_heartbeat_at[^)]*\)/);
    // QF-20260712-249: live-cwd guard pins — base-table query with heartbeat window,
    // non-null worktree_path filter, and fail-loud error handling.
    // qf_id is deliberately ABSENT from the base-table select — claude_sessions has
    // no such column (view-only); selecting it would 42703 on every cleanup.
    expect(src).toMatch(/\.from\('claude_sessions'\)/);
    expect(src).toMatch(/\.select\('session_id, sd_key, current_branch, heartbeat_at, worktree_path'\)/);
    expect(src).toMatch(/\.not\('worktree_path', 'is', null\)/);
    expect(src).toMatch(/live-cwd guard query failed/);
  });
});
