/**
 * tests/unit/scripts/safe-root-resync.test.js
 * SD-LEO-INFRA-SHARED-ROOT-RESYNC-SAFETY-001
 *
 * All git/fs/supabase/npm I/O is DEPENDENCY-INJECTED.
 * NO real git clean is ever executed.
 */

import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { safeRootResync, NPM_INSTALL_TIMEOUT_MS, LOCK_TTL_MS } from '../../../scripts/safe-root-resync.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Use a Windows-safe absolute path for tests
const SHARED_ROOT = path.resolve('C:/fake-shared-root');
const WORKTREE_PATH = path.resolve('C:/fake-worktree');

/**
 * Build a recording exec stub.
 * Each call appended to calls[].
 * Responses is an array of { args_match (string[] exact or string pattern), result }.
 */
function makeExecSpy(responses = []) {
  const calls = [];
  const execSpy = async (args) => {
    calls.push([...args]);
    for (const r of responses) {
      const key = r.args_match;
      const match = Array.isArray(key)
        ? key.every((v, i) => args[i] === v)
        : new RegExp(key).test(args.join(' '));
      if (match) {
        if (r.throws) throw new Error(r.throws);
        return { stdout: r.stdout || '', code: 0 };
      }
    }
    // Default: success, no output
    return { stdout: '', code: 0 };
  };
  execSpy.calls = calls;
  return execSpy;
}

/**
 * Build an fs stub where `path.join(cwd, '.git')` is a DIRECTORY (shared root).
 * Uses path.join to match what dotGitKind() computes internally.
 */
function makeFsSharedRoot(cwd = SHARED_ROOT) {
  const dotGitPath = path.join(cwd, '.git');
  return {
    lstatSync: (p) => {
      if (p === dotGitPath) {
        return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    existsSync: () => false,
    readdirSync: () => [],
  };
}

/**
 * Build an fs stub where `path.join(cwd, '.git')` is a FILE (worktree).
 */
function makeFsWorktree(cwd = WORKTREE_PATH) {
  const dotGitPath = path.join(cwd, '.git');
  return {
    lstatSync: (p) => {
      if (p === dotGitPath) {
        return { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    existsSync: () => false,
    readdirSync: () => [],
  };
}

/**
 * Minimal supabase stub that simulates coordinator check.
 */
function makeSupabaseSpy({ is_coordinator = false, shouldThrow = false } = {}) {
  return {
    from: (_table) => ({
      select: () => ({
        eq: (_field, _val) => ({
          maybeSingle: async () => {
            if (shouldThrow) throw new Error('db_error');
            return { data: { metadata: { is_coordinator } }, error: null };
          },
        }),
        is: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
}

// Shared no-op restore seams (prevent real imports/DB hits in unit tests).
// writePointerFileFn is a no-op so NO test ever writes the real
// .claude/active-coordinator.json pointer file (regression: TS-4 clobber).
const noopRestoreSeams = {
  checkNodeModulesFn: async () => ({ ok: true }),
  acquireLockFn: async () => ({ acquired: true }),
  waitForLockFn: async () => ({ resolved: true, reason: 'lock_released' }),
  releaseLockFn: async () => ({ released: true }),
  writePointerFileFn: () => { /* no-op: never touch the real pointer file */ },
  sessionId: 'test-session-abc',
};

// ─── TS-1: no-x invariant ────────────────────────────────────────────────────

describe('TS-1: no-x invariant', () => {
  it('never appends -x to any clean call, even with cleanUntracked=true', async () => {
    const CWD = SHARED_ROOT;
    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '1\n' },
      // fetch, merge, clean-dry, clean-actual all fall through to default success
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      supabase: makeSupabaseSpy(),
      cwd: CWD,
      cleanUntracked: true,
      confirmClean: true, // double opt-in required for the ACTUAL clean
      ...noopRestoreSeams,
    });

    // Collect all args from clean calls
    const cleanCalls = execSpy.calls.filter(args => args[0] === 'clean');
    expect(cleanCalls.length).toBeGreaterThanOrEqual(2); // dry-run + actual

    for (const callArgs of cleanCalls) {
      // The critical safety assertion: 'x' must NEVER appear in any clean call
      const joinedFlags = callArgs.join('');
      expect(joinedFlags).not.toMatch(/-[a-z]*x/);
      expect(callArgs).not.toContain('x');
      // Verify the exact allowed flags
      const cleanFlagsArg = callArgs.find(a => a.startsWith('-'));
      expect(['-fdn', '-fd']).toContain(cleanFlagsArg);
    }

    // Verify the dry-run call came before the actual call
    const dryRun = cleanCalls.find(a => a.includes('-fdn'));
    const actual = cleanCalls.find(a => a.includes('-fd') && !a.includes('-fdn'));
    expect(dryRun).toBeDefined();
    expect(actual).toBeDefined();
    expect(execSpy.calls.indexOf(dryRun)).toBeLessThan(execSpy.calls.indexOf(actual));

    // Assert no exec call ever contains 'x' in its flags
    for (const call of execSpy.calls) {
      expect(call.join(' ')).not.toMatch(/-[a-z]*x/);
    }

    expect(result.cleaned).toBe(true);
    expect(result.ok).toBe(true);
  });
});

// ─── TS-2: worktree guard ────────────────────────────────────────────────────

describe('TS-2: worktree guard', () => {
  it('aborts with worktree_cwd when .git is a FILE, and exec is NEVER called', async () => {
    const CWD = WORKTREE_PATH;
    const execSpy = makeExecSpy();

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsWorktree(CWD),
      cwd: CWD,
      cleanUntracked: true, // even with cleanUntracked, must abort
      supabase: null,
      ...noopRestoreSeams,
    });

    expect(result.ok).toBe(false);
    expect(result.aborted).toBe('worktree_cwd');

    // exec must NEVER have been called — especially no 'clean'
    const cleanCalls = execSpy.calls.filter(a => a[0] === 'clean');
    expect(cleanCalls.length).toBe(0);
    // In fact no exec calls at all
    expect(execSpy.calls.length).toBe(0);
  });

  it('permits clean when .git is a DIRECTORY (shared root)', async () => {
    const CWD = SHARED_ROOT;
    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '1\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      cleanUntracked: true,
      confirmClean: true, // double opt-in: actually permit the clean
      supabase: makeSupabaseSpy(),
      ...noopRestoreSeams,
    });

    expect(result.ok).toBe(true);
    expect(result.aborted).toBeUndefined();
    expect(result.cleaned).toBe(true);
    const cleanCalls = execSpy.calls.filter(a => a[0] === 'clean');
    expect(cleanCalls.length).toBeGreaterThanOrEqual(2); // dry-run + actual
  });

  it('PREVIEW ONLY: cleanUntracked WITHOUT confirmClean runs the -fdn dry-run but NEVER the real -fd', async () => {
    const CWD = SHARED_ROOT;
    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '0\n' },
      { args_match: ['clean', '-fdn'], stdout: 'would remove .prd-payloads/scratch.json\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      cleanUntracked: true,
      confirmClean: false, // NO second confirmation → preview only
      supabase: makeSupabaseSpy(),
      ...noopRestoreSeams,
    });

    expect(result.ok).toBe(true);
    expect(result.cleanPreviewOnly).toBe(true);
    expect(result.cleaned).toBe(false);

    // The -fdn dry-run ran...
    const dryRun = execSpy.calls.find(a => a[0] === 'clean' && a.includes('-fdn'));
    expect(dryRun).toBeDefined();
    // ...but the destructive -fd clean did NOT.
    const actual = execSpy.calls.find(a => a[0] === 'clean' && a.includes('-fd') && !a.includes('-fdn'));
    expect(actual).toBeUndefined();
    // Belt-and-suspenders: still no 'x' anywhere
    for (const call of execSpy.calls) {
      expect(call.join(' ')).not.toMatch(/-[a-z]*x/);
    }
  });
});

// ─── TS-3: default non-destructive ──────────────────────────────────────────

describe('TS-3: default non-destructive path', () => {
  it('runs fetch + merge --ff-only and zero clean by default', async () => {
    const CWD = SHARED_ROOT;
    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '3\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      cleanUntracked: false,
      supabase: makeSupabaseSpy(),
      ...noopRestoreSeams,
    });

    expect(result.ok).toBe(true);
    expect(result.synced).toBe(true);
    expect(result.cleaned).toBe(false);

    // Must have called fetch
    const fetchCall = execSpy.calls.find(a => a[0] === 'fetch');
    expect(fetchCall).toBeDefined();
    expect(fetchCall).toContain('origin');
    expect(fetchCall).toContain('main');

    // Must have called merge --ff-only origin/main
    const mergeCall = execSpy.calls.find(a => a[0] === 'merge');
    expect(mergeCall).toBeDefined();
    expect(mergeCall).toContain('--ff-only');
    expect(mergeCall).toContain('origin/main');

    // Zero clean calls
    const cleanCalls = execSpy.calls.filter(a => a[0] === 'clean');
    expect(cleanCalls.length).toBe(0);
  });

  it('returns skipped:dirty when tree has uncommitted tracked changes', async () => {
    const CWD = SHARED_ROOT;
    const execSpy = makeExecSpy([
      {
        args_match: ['status', '--porcelain', '--untracked-files=no'],
        stdout: ' M scripts/some-file.js\n'
      },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: null,
      ...noopRestoreSeams,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe('dirty');
    // No merge, no clean
    expect(execSpy.calls.filter(a => a[0] === 'merge').length).toBe(0);
    expect(execSpy.calls.filter(a => a[0] === 'clean').length).toBe(0);
  });

  it('returns conflict:true when ff-only merge is declined', async () => {
    const CWD = SHARED_ROOT;
    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '2\n' },
      { args_match: ['merge', '--ff-only', 'origin/main', '--quiet'], throws: 'Not possible to fast-forward' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: null,
      ...noopRestoreSeams,
    });

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
  });
});

// ─── TS-4: FR-2 coordinator pointer restore ─────────────────────────────────

describe('TS-4: FR-2 coordinator pointer restore', () => {
  it('restore writes the pointer via the INJECTED writer (never the real .claude file) when is_coordinator=true', async () => {
    const CWD = SHARED_ROOT;
    // Supabase that returns is_coordinator=true
    const supabaseSpy = makeSupabaseSpy({ is_coordinator: true });

    // Inject a mock pointer writer so this test NEVER writes the real
    // .claude/active-coordinator.json (regression: TS-4 previously clobbered the
    // live coordinator pointer with the fake 'test-coordinator-session' id).
    const writeSpy = vi.fn();

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '0\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: supabaseSpy,
      sessionId: 'test-coordinator-session',
      writePointerFileFn: writeSpy,
      checkNodeModulesFn: async () => ({ ok: true }),
      acquireLockFn: async () => ({ acquired: true }),
      waitForLockFn: async () => ({ resolved: true }),
      releaseLockFn: async () => ({ released: true }),
    });

    // restore result populated
    expect(result.restore).toBeDefined();
    expect(result.restore.coordinatorPointer).toBeDefined();
    // is_coordinator=true → restoreCoordinatorPointer returns db_confirmed_coordinator
    expect(result.restore.coordinatorPointer.restored).toBe(true);
    expect(result.restore.coordinatorPointer.reason).toBe('db_confirmed_coordinator');
    // The INJECTED writer was used (the real pointer file was never touched), and it
    // received the fake test session id — proving the seam intercepts the write.
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(writeSpy.mock.calls[0][0]).toMatchObject({ session_id: 'test-coordinator-session' });
  });

  it('restore result shows not_coordinator when is_coordinator=false', async () => {
    const CWD = SHARED_ROOT;
    const supabaseSpy = makeSupabaseSpy({ is_coordinator: false });

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '0\n' },
    ]);

    const writeSpy = vi.fn();
    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: supabaseSpy,
      sessionId: 'test-non-coordinator-session',
      writePointerFileFn: writeSpy,
      checkNodeModulesFn: async () => ({ ok: true }),
      acquireLockFn: async () => ({ acquired: true }),
      waitForLockFn: async () => ({ resolved: true }),
      releaseLockFn: async () => ({ released: true }),
    });

    expect(result.restore).toBeDefined();
    expect(result.restore.coordinatorPointer).toBeDefined();
    expect(result.restore.coordinatorPointer.restored).toBe(false);
    expect(result.restore.coordinatorPointer.reason).toBe('not_coordinator');
    // A non-coordinator must NEVER write a pointer file at all.
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

// ─── TS-5: node_modules repair + fail-open ──────────────────────────────────

describe('TS-5: node_modules repair + fail-open', () => {
  it('calls acquireLock and bounded npm install when node_modules unhealthy', async () => {
    const CWD = SHARED_ROOT;
    const acquireSpy = vi.fn(async () => ({ acquired: true }));
    const waitSpy = vi.fn(async () => ({ resolved: true, reason: 'lock_released' }));
    const releaseSpy = vi.fn(async () => ({ released: true }));
    const npmInstallSpy = vi.fn(async () => { /* success */ });

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '0\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: makeSupabaseSpy({ is_coordinator: false }),
      sessionId: 'test-session-repair',
      checkNodeModulesFn: async () => ({ ok: false, error: 'Cannot find @supabase', hint: 'Run npm install' }),
      acquireLockFn: acquireSpy,
      waitForLockFn: waitSpy,
      releaseLockFn: releaseSpy,
      npmInstall: npmInstallSpy,
    });

    expect(result.ok).toBe(true);
    expect(acquireSpy).toHaveBeenCalledOnce();
    // npmInstall called — confirms npm install (not npm ci) path
    expect(npmInstallSpy).toHaveBeenCalledOnce();
    // releaseLock called in finally
    expect(releaseSpy).toHaveBeenCalledOnce();
    // nodeModules result should be 'repaired'
    expect(result.restore.nodeModules).toBe('repaired');
  });

  it('returns repair_failed loudly when npmInstall throws, sync is NOT rolled back', async () => {
    const CWD = SHARED_ROOT;
    const releaseSpy = vi.fn(async () => ({ released: true }));

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '1\n' },
      // merge succeeds (default response)
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: makeSupabaseSpy(),
      sessionId: 'test-session-fail',
      checkNodeModulesFn: async () => ({ ok: false, error: 'missing', hint: 'run npm install' }),
      acquireLockFn: async () => ({ acquired: true }),
      waitForLockFn: async () => ({ resolved: true }),
      releaseLockFn: releaseSpy,
      npmInstall: async () => { throw new Error('npm install failed'); },
    });

    // Sync was completed before the repair tail ran
    expect(result.ok).toBe(true);
    expect(result.synced).toBe(true); // merge succeeded
    // Repair failed but sync is NOT rolled back
    expect(result.restore.nodeModules).toBe('repair_failed');
    // releaseLock still called in finally
    expect(releaseSpy).toHaveBeenCalledOnce();
  });

  it('swallows all errors in the restore tail and still returns sync result', async () => {
    const CWD = SHARED_ROOT;

    // Supabase that throws on any call
    const throwingSupabase = {
      from: () => { throw new Error('supabase_connection_error'); },
    };

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '1\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: throwingSupabase,
      sessionId: 'test-session-throw',
      // checkNodeModulesFn also throws to simulate full tail failure
      checkNodeModulesFn: async () => { throw new Error('import_failed'); },
      acquireLockFn: async () => ({ acquired: true }),
      waitForLockFn: async () => ({ resolved: true }),
      releaseLockFn: async () => ({ released: true }),
    });

    // The sync completed — ok=true, synced=true (tail errors were swallowed)
    expect(result.ok).toBe(true);
    expect(result.synced).toBe(true);
    // restore is defined
    expect(result.restore).toBeDefined();
    // And the whole thing did not throw to here
  });

  it('uses npm install (NOT npm ci) in the repair — npmInstall injectable is invoked', async () => {
    const CWD = SHARED_ROOT;
    const npmInstallSpy = vi.fn(async () => { /* success */ });

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '0\n' },
    ]);

    await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: makeSupabaseSpy(),
      sessionId: 'test-session-installcheck',
      checkNodeModulesFn: async () => ({ ok: false, error: 'missing', hint: 'npm install' }),
      acquireLockFn: async () => ({ acquired: true }),
      waitForLockFn: async () => ({ resolved: true }),
      releaseLockFn: async () => ({ released: true }),
      npmInstall: npmInstallSpy,
    });

    // The install spy was invoked — confirming npm install semantics (NOT npm ci)
    expect(npmInstallSpy).toHaveBeenCalledOnce();
    // Additionally: no git exec call ever contains 'ci' (belt-and-suspenders)
    for (const call of execSpy.calls) {
      expect(call.join(' ')).not.toContain(' ci');
    }
  });

  it('does NOT run a racing install when the lock stays held by another session — bails repair_deferred_lock_contended', async () => {
    const CWD = SHARED_ROOT;
    // acquireLock ALWAYS reports another session holds it (we never own it).
    const acquireSpy = vi.fn(async () => ({ held: true, holder: 'other-session-xyz', age_ms: 1000 }));
    const releaseSpy = vi.fn(async () => ({ released: true }));
    const npmInstallSpy = vi.fn(async () => { /* must NOT be called */ });
    // node_modules stays broken even after we wait for the holder.
    const checkSpy = vi.fn(async () => ({ ok: false, error: 'missing', hint: 'npm install' }));

    const execSpy = makeExecSpy([
      { args_match: ['status', '--porcelain', '--untracked-files=no'], stdout: '' },
      { args_match: ['rev-list', '--count', 'HEAD..origin/main'], stdout: '0\n' },
    ]);

    const result = await safeRootResync({
      exec: execSpy,
      fs: makeFsSharedRoot(CWD),
      cwd: CWD,
      supabase: makeSupabaseSpy(),
      sessionId: 'test-session-contended',
      writePointerFileFn: () => {},
      checkNodeModulesFn: checkSpy,
      acquireLockFn: acquireSpy,
      waitForLockFn: async () => ({ resolved: true, reason: 'timeout' }),
      releaseLockFn: releaseSpy,
      npmInstall: npmInstallSpy,
    });

    // The sync itself succeeded; only the node_modules repair was deferred.
    expect(result.ok).toBe(true);
    expect(result.restore.nodeModules).toBe('repair_deferred_lock_contended');
    // The racing double-install was NEVER run...
    expect(npmInstallSpy).not.toHaveBeenCalled();
    // ...and we never released a lock we did not own.
    expect(releaseSpy).not.toHaveBeenCalled();
    // We tried to acquire twice: the initial attempt + one retry after waiting.
    expect(acquireSpy).toHaveBeenCalledTimes(2);
  });
});

// ─── TS-6: install-timeout vs lock-TTL invariant ────────────────────────────

describe('TS-6: npm-install timeout stays inside the lock TTL', () => {
  it('NPM_INSTALL_TIMEOUT_MS is strictly less than LOCK_TTL_MS (no TTL-expiry-mid-install race)', () => {
    // Regression for the adversarial-review HIGH: a default install timeout (was 300s)
    // longer than the 120s lock TTL let a second waiting session auto-expire our
    // still-held lock and start a CONCURRENT install on the shared node_modules.
    expect(NPM_INSTALL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(LOCK_TTL_MS).toBeGreaterThan(0);
    // The default repair install must finish (and release) before another waiting
    // session can expire our lock at TTL — so the timeout must be strictly under it.
    expect(NPM_INSTALL_TIMEOUT_MS).toBeLessThan(LOCK_TTL_MS);
  });
});
