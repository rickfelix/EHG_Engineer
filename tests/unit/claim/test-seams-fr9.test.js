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
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
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

  // The defect FR-6 will fix, asserted as PRESENT so the fix has a falsifiable starting point.
  it('documents the CAS asymmetry FR-6 exists to close', () => {
    const src = fs.readFileSync(path.join(root, 'lib/claim-guard.mjs'), 'utf8');
    const fn = src.slice(src.indexOf('export async function reaffirmClaimColumns'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/claimQuickFix\(supabase, sdKey, sessionId\)/);        // QF branch: CAS-hardened
    expect(body).toMatch(/\.update\(\{ claiming_session_id: sessionId/);         // SD branch: bare update
    expect(body).toMatch(/\.eq\('sd_key', sdKey\)/);                             // ...with no compare-and-set
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
