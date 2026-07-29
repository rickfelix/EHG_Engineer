/**
 * QF-20260707-875: preventive staleness WARN for routing-critical comms CLIs.
 * SD-LEO-INFRA-STALENESS-GUARD-THREE-DEFECTS-001: three defects fixed together.
 *
 * *** THESE TESTS ARE WRITTEN TO FAIL AGAINST THE *PLAUSIBLE WRONG FIX*, NOT MERELY AGAINST
 * THE OLD CODE. *** The obvious repair — swap @{u} for origin/main and leave the scope
 * repo-wide — makes the guard shout "34 commits behind" at a checkout whose send-path code
 * is fully current. That false positive is strictly worse than the silence it replaced. A
 * test asserting only "warns when behind" PASSES that wrong fix, so there is no such test
 * here; every case below names the mutation that must break it.
 *
 * ONE THING THAT DROVE THE DESIGN: a value-only assertion CANNOT catch a reverted referent.
 * On this repo HEAD..@{u}=0 and the correctly-scoped HEAD..origin/main=0 — both render
 * silent, so the outcome is identical either way. The referent has to be asserted on the
 * captured ARGV. That is why the runner seam is an argv array rather than a shell string.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  warnIfCheckoutStale,
  measureBehind,
  classifyGitFailure,
  SEND_PATHS,
  BASE_REF,
} from '../../../lib/coordinator/checkout-staleness.cjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('warnIfCheckoutStale', () => {
  let stderrSpy;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => stderrSpy.mockRestore());

  it('is SILENT when the send paths are current, even if the repo is far behind overall', () => {
    // The exact situation measured on the authoring checkout: 34 commits behind origin/main
    // repo-wide, 0 on the send paths. This fake answers like real git — it returns the
    // repo-wide number when NO pathspec was supplied, and the scoped number when one was.
    const fakeExec = vi.fn().mockImplementation((args) => {
      const hasPathspec = args.includes('--') && args.indexOf('--') < args.length - 1;
      return hasPathspec ? '0\n' : '34\n';
    });

    warnIfCheckoutStale('worker-signal.cjs', fakeExec);

    expect(stderrSpy).not.toHaveBeenCalled();

    // MUTATION THAT MUST BREAK THIS: drop the pathspec while keeping origin/main — the
    // naive fix. The fake then returns 34, the guard warns, and this fails. This is the
    // single most important test in the file.
  });

  it('measures origin/main and NOT @{u} — asserted on the argv, because the values coincide', () => {
    const fakeExec = vi.fn().mockReturnValue('0\n');
    warnIfCheckoutStale('worker-signal.cjs', fakeExec);

    const args = fakeExec.mock.calls[0][0];
    expect(args).toContain(`HEAD..${BASE_REF}`);
    expect(args.join(' ')).not.toContain('@{u}');

    // MUTATION THAT MUST BREAK THIS: revert the referent to @{u}. Note a value-based
    // assertion could NOT catch that mutation here — both refs return 0 on this repo — so
    // this test deliberately ignores the return value and inspects the command instead.
  });

  it('passes the send paths as a pathspec after a -- separator', () => {
    const fakeExec = vi.fn().mockReturnValue('0\n');
    warnIfCheckoutStale('worker-signal.cjs', fakeExec);

    const args = fakeExec.mock.calls[0][0];
    const sep = args.indexOf('--');
    expect(sep).toBeGreaterThan(-1);
    expect(args.slice(sep + 1)).toEqual([...SEND_PATHS]);

    // MUTATION: remove the pathspec entirely -> no separator, fails.
  });

  it('WARNs with the SCOPED count when a send path is genuinely behind', () => {
    const fakeExec = vi.fn().mockImplementation((args) => (args.includes('--') ? '7\n' : '34\n'));

    warnIfCheckoutStale('adam-advisory.cjs', fakeExec);

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const message = stderrSpy.mock.calls[0][0];
    expect(message).toContain('7');
    expect(message).not.toContain('34'); // never the repo-wide number
    expect(message).toContain('adam-advisory.cjs');
    expect(message).toContain(BASE_REF);
    expect(message).toContain('WARN');

    // MUTATION: report the repo-wide count -> '34' appears, fails.
  });

  /**
   * *** DELIBERATE REVERSAL OF A DOCUMENTED DESIGN DECISION — NOT A STALE ASSERTION. ***
   * This case previously read "never throws and never warns when git errors" and asserted
   * `expect(stderrSpy).not.toHaveBeenCalled()`. That was defect 3 written down as intended
   * behaviour, and the module header stated the same in prose ("Non-fatal on any git
   * error"). Both have been changed together, on purpose: non-fatal is still required, but
   * silent is not. A guard that is quiet because it is correct and one that is quiet
   * because it crashed must not look the same to a reader — and the crash case fires on
   * fresh unpushed branches, precisely when a worker is most likely running stale code.
   * The not-throwing half of the original assertion is preserved unchanged.
   */
  it('EMITS a distinct cannot-determine notice when git fails, and still never throws', () => {
    const fakeExec = vi.fn().mockImplementation(() => {
      throw new Error('fatal: no upstream configured for branch');
    });

    expect(() => warnIfCheckoutStale('worker-signal.cjs', fakeExec)).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const message = stderrSpy.mock.calls[0][0];
    expect(message).toContain('could not determine');
    expect(message).toContain('worker-signal.cjs');
    // Must NOT masquerade as a staleness measurement.
    expect(message).not.toContain('behind');

    // MUTATION THAT MUST BREAK THIS: restore the bare `catch {}`. Silence returns and this
    // fails — which is the whole point of reversing the original assertion.
  });

  it('treats an unparseable count as cannot-determine, never as zero', () => {
    const fakeExec = vi.fn().mockReturnValue('not-a-number\n');

    warnIfCheckoutStale('solomon-advisory.cjs', fakeExec);

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toContain('could not determine');

    // MUTATION: collapse an unparseable count to 0 -> silence, fails. Without this the
    // guard could go quiet on a malformed answer and read as up-to-date — defect 3
    // re-entering through the happy path rather than the catch block.
  });

  it('does not throw and stays silent when the send paths are current', () => {
    const fakeExec = vi.fn().mockReturnValue('0\n');
    expect(() => warnIfCheckoutStale('worker-signal.cjs', fakeExec)).not.toThrow();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

describe('measureBehind', () => {
  it('reports a named reason rather than collapsing failures into a number', () => {
    const timedOut = Object.assign(new Error('killed'), { killed: true });
    expect(measureBehind(() => { throw timedOut; }, SEND_PATHS)).toEqual({ ok: false, reason: 'git timed out' });

    expect(measureBehind(() => { throw new Error('fatal: bad revision origin/main'); }, SEND_PATHS))
      .toEqual({ ok: false, reason: `${BASE_REF} not available locally — fetch it` });

    expect(measureBehind(() => { throw new Error('spawn git ENOENT'); }, SEND_PATHS))
      .toEqual({ ok: false, reason: 'git unavailable' });

    // MUTATION: return a bare 0 (or undefined) from any of these branches -> the caller can
    // no longer distinguish them and these fail.
  });

  it('returns the parsed count on success', () => {
    expect(measureBehind(() => '12\n', SEND_PATHS)).toEqual({ ok: true, behind: 12 });
  });
});

describe('classifyGitFailure', () => {
  /**
   * *** THIS WHOLE BLOCK EXISTS BECAUSE THE FIRST IMPLEMENTATION HAD A BRANCH THAT COULD
   * NEVER RUN. *** The runner originally used stdio ['ignore','pipe','ignore'], so a failed
   * execFileSync threw an Error whose message was ONLY the echoed argv — git's diagnostic
   * never reached Node. The "origin/main not available locally" branch tested for git's
   * vocabulary in text that could not contain it, so the most actionable message the guard
   * had was unreachable. Found in SECURITY review and reproduced directly against real git.
   * stderr is now piped and the classification reads it.
   */
  it('reads git stderr — the channel that was previously discarded — to name the failure', () => {
    const err = Object.assign(new Error('Command failed: git rev-list --count HEAD..origin/main'), {
      stderr: "fatal: ambiguous argument 'HEAD..origin/main': unknown revision or path not in the working tree.",
    });
    expect(classifyGitFailure(err)).toBe(`${BASE_REF} not available locally — fetch it`);

    // MUTATION THAT MUST BREAK THIS: read only err.message (the pre-fix behaviour). The
    // message alone carries no git vocabulary, so this falls through to 'git failed'.
  });

  it('NEVER interpolates git-supplied text into the reason', () => {
    // The earlier version returned `git error (${msg.split('\n')[0]})`, which would echo
    // whatever git said. If this runner is ever repointed at a command that touches the
    // network, git's stderr can carry a remote URL — and those can embed credentials.
    const err = Object.assign(new Error('Command failed'), {
      stderr: 'fatal: unable to access https://user:s3cr3t-token@github.com/org/repo.git/',
    });
    const reason = classifyGitFailure(err);
    expect(reason).not.toContain('s3cr3t-token');
    expect(reason).not.toContain('https://');
    expect(reason).toBe('git failed');

    // MUTATION: interpolate the git text back into the reason -> the token appears, fails.
  });

  it('classifies a timeout via signal, not only via killed', () => {
    // err.killed is undefined on some Windows/Node builds — verified on this host — so the
    // SIGTERM check is load-bearing rather than belt-and-braces.
    expect(classifyGitFailure({ signal: 'SIGTERM' })).toBe('git timed out');
    expect(classifyGitFailure({ killed: true })).toBe('git timed out');
  });

  /**
   * "Never throws" is an invariant this module asserts about itself in its own docblock, and
   * asserting it is not the same as enforcing it. Reading .stderr/.message can throw when they
   * are accessor properties, and a raw Symbol makes template-literal coercion throw. Neither is
   * reachable through defaultRunner — real execFileSync errors carry plain string properties —
   * but execImpl is a PUBLIC seam, so the invariant must hold for anything a caller injects.
   * (Gap found by TESTING fuzzing the seam after the classifier landed.)
   */
  it('never throws, even for adversarial error shapes that cannot come from real git', () => {
    const throwingGetter = {};
    Object.defineProperty(throwingGetter, 'stderr', { get() { throw new Error('boom'); } });
    expect(() => classifyGitFailure(throwingGetter)).not.toThrow();
    expect(classifyGitFailure(throwingGetter)).toBe('git failed (unreadable error)');

    expect(() => classifyGitFailure(Symbol('nope'))).not.toThrow();
    expect(classifyGitFailure(Symbol('nope'))).toBe('git failed (unreadable error)');

    // And the invariant that actually matters — the guard itself must still SPEAK, not fall
    // silent, when it cannot even read why git failed.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => warnIfCheckoutStale('worker-signal.cjs', () => { throw Symbol('nope'); })).not.toThrow();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toContain('could not determine');
    stderrSpy.mockRestore();

    // MUTATION THAT MUST BREAK THIS: remove the try/catch around the classification body.
    // Both the throwing-getter case and the Symbol case then propagate out of
    // warnIfCheckoutStale, breaking the module's stated never-throw contract.
  });

  it('classifies a missing git binary and a non-repo distinctly', () => {
    expect(classifyGitFailure(new Error('spawn git ENOENT'))).toBe('git unavailable');
    expect(classifyGitFailure(Object.assign(new Error('x'), { stderr: 'fatal: not a git repository' })))
      .toBe('not a git repository');
  });
});

describe('detached HEAD', () => {
  /**
   * FR-2 AC3 anticipated detached HEAD as a cannot-determine case. It no longer is, and that
   * is the fix working rather than a gap: the referent is now the literal `origin/main`, so
   * the measurement does not depend on HEAD having an upstream at all. Detached HEAD now
   * MEASURES CORRECTLY and stays silent when current. Recording the real behaviour here so
   * the AC's superseded expectation cannot be mistaken for missing coverage later.
   * (Surfaced by TESTING, which verified it in a scratch clone.)
   */
  it('measures normally when HEAD is detached, because the referent no longer depends on @{u}', () => {
    const fakeExec = vi.fn().mockReturnValue('0\n');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    warnIfCheckoutStale('worker-signal.cjs', fakeExec);
    expect(fakeExec.mock.calls[0][0]).toContain(`HEAD..${BASE_REF}`);
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('SEND_PATHS', () => {
  /**
   * The explicit-list design's one weakness is that it can go stale as the tree moves, which
   * would silently narrow what the guard watches — the same class of defect this SD exists
   * to remove. This test is the counterweight: a path that no longer exists fails loudly
   * instead of quietly reducing coverage.
   */
  it('every listed path exists on disk', () => {
    const missing = SEND_PATHS.filter((p) => !existsSync(join(REPO_ROOT, p)));
    expect(missing).toEqual([]);
  });

  it('includes all three production callers', () => {
    expect(SEND_PATHS).toContain('scripts/worker-signal.cjs');
    expect(SEND_PATHS).toContain('scripts/adam-advisory.cjs');
    expect(SEND_PATHS).toContain('scripts/solomon-advisory.cjs');
  });
});
