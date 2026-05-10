/**
 * SD-FDBK-INFRA-POST-MERGE-WORKTREE-001 regression-pin tests.
 *
 * Verifies hasActiveClaimOnBranch + cleanupWorktreeByPath claim-protect
 * integration. Mirrors the worktree-reaper loadClaimMap pattern shipped in
 * PR #3677 (17th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * Schema-correct projection (do NOT add worktree_path or last_heartbeat_at):
 *   session_id, sd_key, qf_id, current_branch, heartbeat_at, computed_status
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

// In-memory mock of supabase.from('v_active_sessions').select('...').eq('computed_status','active')
function mockSupabase({ data = null, error = null } = {}) {
  return {
    from(table) {
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
});

describe('cleanupWorktreeByPath — claim-protect integration', () => {
  let env;
  beforeEach(() => { env = setupTmpRepo(); });
  afterEach(() => cleanupTmp(env));

  it('archives instead of deletes when active claim matches', async () => {
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
    // archive succeeded → original wtPath no longer present
    expect(fs.existsSync(env.wtPath)).toBe(false);
    // archive should exist under .worktrees/_archive
    const archiveDir = path.join(env.main, '.worktrees', '_archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  it('proceeds with cleanup when no active claim matches', async () => {
    const sb = mockSupabase({ data: [] });
    const result = await cleanupWorktreeByPath(env.wtPath, { supabase: sb });
    expect(result.cleaned).toBe(true);
    expect(result.workKey).toBe(env.sdKey);
  });

  // R-6 (testing-agent binding): PostgrestError must NOT escape cleanupWorktreeByPath.
  // Translate to fail-SAFE — treat unknown DB state as if a claim is held + archive
  // (preserves work). This is the crucial UX guarantee for /ship CLI on a transient
  // DB blip — a thrown PostgrestError would have been worse than the bug being fixed.
  it('R-6: fail-safe on PostgrestError — archives, returns reason=db_error_fail_safe, no throw', async () => {
    const sb = mockSupabase({ error: { message: 'connection terminated', code: 'XX000' } });
    const result = await cleanupWorktreeByPath(env.wtPath, { supabase: sb });
    expect(result.cleaned).toBe(false);
    expect(result.reason).toBe('db_error_fail_safe');
    expect(result.error).toMatch(/connection terminated/);
    // Archive on fail-safe to preserve work (worktree may have uncommitted state).
    expect(fs.existsSync(env.wtPath)).toBe(false);
    const archiveDir = path.join(env.main, '.worktrees', '_archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
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
    const idxRemove = body.indexOf('git worktree remove');

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
    // No reference to the non-existent columns IN A SELECT call
    // (PR #3677 P0: silent-swallow on column-not-found). Comments are allowed
    // to mention them as documentation of the lesson learned.
    expect(src).not.toMatch(/\.select\([^)]*worktree_path[^)]*\)/);
    expect(src).not.toMatch(/\.select\([^)]*last_heartbeat_at[^)]*\)/);
  });
});
