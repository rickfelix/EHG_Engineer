// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-9) — the seams FR-5/6/7 hard-depend on.
//
// FR-9 exists because three targets were untestable AS SHIPPED, which meant FR-5, FR-6 and FR-7
// could only ever be argued, never asserted. A seam that is not itself pinned regresses the moment
// someone "tidies" the guard away, so these tests pin the seams, not just the behaviour behind them.
//
// THE RISK THIS SUITE IS REALLY GUARDING. pre-tool-enforce.cjs is the LIVE enforcement hook. Adding
// a require.main guard there is a one-line change that, done wrong, silently disables tool
// enforcement fleet-wide — and the failure is invisible, because a disabled guard looks exactly like
// a guard with nothing to block. So the hook is asserted TWO-SIDED: it must still ALLOW, and it must
// still BLOCK. An allow-only check passes even on a completely dead guard.
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOOK = path.join(root, 'scripts/hooks/pre-tool-enforce.cjs');
const COORD = path.join(root, 'scripts/claude-session-coordinator.mjs');

const runHook = (payload) => {
  try {
    execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 60000 });
    return 0;
  } catch (e) { return e.status; }
};

describe('FR-9 seam 1: claude-session-coordinator exposes releaseSD without running a CLI', () => {
  it('exports releaseSD — it was unexported, so FR-5 could not be asserted at all', async () => {
    const m = await import(path.join(root, 'scripts/claude-session-coordinator.mjs'));
    expect(typeof m.releaseSD).toBe('function');
  });

  it('importing does NOT execute the CLI dispatch', () => {
    // The switch ran at module scope and called process.exit, so an import ended the test process.
    const src = fs.readFileSync(COORD, 'utf8');
    expect(src).toMatch(/if \(isCliEntrypoint\) switch \(command\)/);
    expect(src).toMatch(/import\.meta\.url === pathToFileURL\(entry\)\.href/);
  });

  it('entrypoint detection cannot itself throw the CLI', () => {
    // A bare pathToFileURL(undefined) throws; the CLI must not die because argv[1] is missing.
    const src = fs.readFileSync(COORD, 'utf8');
    expect(src).toMatch(/catch \{ return false; \}/);
  });
});

describe('FR-9 seam 2: reaffirmClaimColumns is importable', () => {
  it('is exported — FR-6 targets its SD branch and could not reach it', async () => {
    const m = await import(path.join(root, 'lib/claim-guard.mjs'));
    expect(typeof m.reaffirmClaimColumns).toBe('function');
  });

  // FR-9 says this function has "its client pinned to a singleton". IT DOES NOT — supabase is its
  // first parameter and always was, so only the export was missing. Pinned so the correction is not
  // re-litigated, and so nobody "fixes" an injection problem that never existed.
  it('takes its supabase client as a parameter — it was never singleton-pinned', async () => {
    const m = await import(path.join(root, 'lib/claim-guard.mjs'));
    expect(m.reaffirmClaimColumns.length).toBeGreaterThanOrEqual(3); // (supabase, sdKey, sessionId)
  });

  // This assertion originally pinned the CAS asymmetry as PRESENT, so FR-6 would have a falsifiable
  // starting point. FR-6 has now closed it, so the assertion flips to the fixed state — BOTH branches
  // guard. Keeping it here (rather than only in the FR-6 suite) means the seam file itself notices
  // if the guard is ever dropped again.
  it('BOTH branches now compare-and-set — the asymmetry FR-6 closed', () => {
    const src = fs.readFileSync(path.join(root, 'lib/claim-guard.mjs'), 'utf8');
    const fn = src.slice(src.indexOf('export async function reaffirmClaimColumns'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/claimQuickFix\(supabase, sdKey, sessionId\)/);                    // QF: shared fail-closed CAS
    expect(body).toMatch(/claiming_session_id\.is\.null,claiming_session_id\.eq\./);        // SD: null-OR-self CAS
  });
});

describe('FR-9 seam 3: pre-tool-enforce is importable AND still enforces', () => {
  // VERIFIED OUT-OF-PROCESS ON PURPOSE, and the reason is a real limit of this seam. Requiring the
  // hook IN-PROCESS under vitest HANGS the worker indefinitely (measured: 180s+, vs 2s here): the
  // module has load-time side effects that open handles which never drain, so the runner keeps
  // waiting for an event loop that will not empty. Plain `node -e require(...)` exits fine because
  // the process ends. So the seam is genuinely importable — but a TEST RUNNER must reach it in a
  // subprocess. Recorded rather than worked around silently, because the obvious "simplification"
  // back to an in-process require would hang CI with no obvious cause.
  it('exports its seam without running the enforcement pass on import', () => {
    const out = execFileSync('node',
      ['-e', `const m=require(${JSON.stringify(HOOK)});console.log(Object.keys(m).join(','))`],
      { encoding: 'utf8', timeout: 60000 });
    expect(out).toMatch(/resolveSessionClaimedSdKey/);
    expect(out).toMatch(/main/);
  });

  // TWO-SIDED, AND THIS IS THE POINT. A guard that no longer blocks looks identical to a guard with
  // nothing to block, so proving it ALLOWS proves nothing on its own.
  it('still ALLOWS a benign command when run as the hook', () => {
    expect(runHook({ tool_name: 'Bash', tool_input: { command: 'echo hi' } })).toBe(0);
  });

  it('still BLOCKS a forbidden command when run as the hook', () => {
    // Assembled at runtime so this test file does not itself contain the literal the hook blocks.
    const forbidden = `git commit --no-ver${'ify'} -m x`;
    expect(runHook({ tool_name: 'Bash', tool_input: { command: forbidden } })).toBe(2);
  });

  it('the guard is require.main-scoped, not deleted', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    expect(src).toMatch(/if \(require\.main === module\) \{\s*\n\s*main\(\)\.catch/);
    // The fail-open drain must survive inside the guard — losing it reintroduces the libuv crash
    // that silently aborted PreToolUse, i.e. enforcement skipped without any signal.
    expect(src).toMatch(/await drainUndiciPool\(\); process\.exit\(0\);/);
  });
});

// SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 FR-4: live-subprocess specimens (a) and (d).
// Specimen (b), the true cross-claim BLOCK, is proven at the pure-function composition level in
// tests/unit/worktree-claim-decision-qf087.test.js instead of here -- it needs a real, non-null
// claimedSdKey, and fabricating one means mutating the live claims DB from a unit test (unsafe)
// or depending on fleet state (non-deterministic). Specimens (a) and (d) need no DB claim: an
// unclaimed session's claimedSdKey resolves to null, which fails open regardless of the derived
// key -- so both specimens use a random unclaimed session id and assert on the DEBUG stderr
// introspection line (LEO_CLAIM_GUARD_DEBUG=1) for {derivedKey, source}, since the allow path
// writes no audit row to inspect (auditPermissionDecision fires on the block path only).
// Specimen (c), the QF-20260804-087 regression, is tests/unit/worktree-claim-decision-qf087.test.js
// unmodified (this SD makes zero change to the qfHeld tri-state).
describe('SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 FR-4: branch-first derivation specimens', () => {
  const UNCLAIMED_SESSION_ID = 'test-unclaimed-session-000000000000';

  /** Build a throwaway `.worktrees/<pathKey>/` git-init fixture with `branch` checked out. */
  function makeWorktreeFixture(pathKey, branch) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-guard-fr4-'));
    const treeRoot = path.join(tmpRoot, '.worktrees', pathKey);
    fs.mkdirSync(treeRoot, { recursive: true });
    const gitOpts = { cwd: treeRoot, stdio: 'ignore' };
    execFileSync('git', ['init', '-q'], gitOpts);
    execFileSync('git', ['config', 'user.email', 'fr4@test.local'], gitOpts);
    execFileSync('git', ['config', 'user.name', 'FR-4 fixture'], gitOpts);
    const targetFile = path.join(treeRoot, 'x.js');
    fs.writeFileSync(targetFile, '// fixture\n');
    execFileSync('git', ['add', '.'], gitOpts);
    execFileSync('git', ['commit', '-q', '-m', 'init'], gitOpts);
    execFileSync('git', ['checkout', '-q', '-b', branch], gitOpts);
    return { tmpRoot, treeRoot, targetFile };
  }

  // spawnSync (not execFileSync) is required here: execFileSync only exposes stderr via
  // error.stderr when the process exits NON-zero (it discards stderr entirely on success),
  // and specimens (a)/(d) both need to inspect stderr on the ALLOW (exit 0) path.
  // process.execPath (an absolute path), not the bare string "node", is required so specimen
  // (d)'s PATH-stripped env can still locate the interpreter to launch the hook at all --
  // only `git` (resolved by bare name inside the hook) is meant to become unresolvable.
  function runHookWithEnv(payload, envOverrides) {
    const res = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env, ...envOverrides },
    });
    return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
  }

  it('(a) reused-tree ALLOW: branch names the full child key, not the stale directory name', () => {
    const { tmpRoot, targetFile } = makeWorktreeFixture(
      'QF-20260903-188',
      'feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B'
    );
    try {
      const result = runHookWithEnv(
        { session_id: UNCLAIMED_SESSION_ID, tool_name: 'Edit', tool_input: { file_path: targetFile } },
        { LEO_CLAIM_GUARD_DEBUG: '1' }
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/derivedKey=SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B source=branch/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('(d) git unavailable falls back to the path source, matching pre-FR-1 behavior', () => {
    const { tmpRoot, targetFile } = makeWorktreeFixture('SD-X-001', 'feat/SD-X-001');
    try {
      const result = runHookWithEnv(
        { session_id: UNCLAIMED_SESSION_ID, tool_name: 'Edit', tool_input: { file_path: targetFile } },
        { LEO_CLAIM_GUARD_DEBUG: '1', PATH: '', Path: '' } // strip PATH so `git` cannot be resolved
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/derivedKey=SD-X-001 source=path/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
