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
