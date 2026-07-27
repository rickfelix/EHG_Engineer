/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 — the ONE test that does not mock the process probe.
 *
 * WHY THIS EXISTS. Every other test in this SD injects an execCmd seam, which is right: it makes
 * them deterministic and host-independent. But a seam can only prove the classifier reasons
 * correctly ABOUT tasklist output — it cannot prove the command string we actually send is valid.
 * Get the flags, quoting, or filter syntax wrong and the classifier stays perfectly correct against
 * scripted output while NEVER MATCHING A REAL PROCESS. It would then return NO_MATCH for every pid,
 * and since a pidfile-declared pid that does not match reads as DEAD, the fence would start
 * refusing live workers fleet-wide. That is the failure a mocked seam is structurally blind to —
 * "a mocked seam hides an environmental precondition".
 *
 * So this runs the REAL tasklist exactly as production does. It deliberately asserts something
 * weak but unfakeable: that the probe EXECUTES AND PARSES. It does not assert a specific process is
 * running, because that would make the test depend on host state and go flaky.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pidIsClaude, CLAUDE_IMAGE } = require('../../lib/fleet/claimant-liveness.cjs');

// tasklist is Windows-only; this fleet runs on Windows, but keep the suite portable.
const onWindows = process.platform === 'win32';
const d = onWindows ? describe : describe.skip;

d('real tasklist invocation (no seam) — proves the command string itself is valid', () => {
  it('EXECUTES and PARSES against the current process — never PROBE_FAILED', () => {
    // process.pid is this node process: definitely alive, definitely NOT claude.exe. So the correct
    // answer is NO_MATCH. The assertion that matters is that it is not PROBE_FAILED, because
    // PROBE_FAILED is what a malformed command, bad quoting, or a missing binary produces — and it
    // is indistinguishable from a working probe in every mocked test we have.
    const result = pidIsClaude(process.pid, undefined);

    expect(
      result,
      'PROBE_FAILED means the real tasklist invocation is broken (flags/quoting/binary). The mocked '
      + 'tests cannot see this: they would still pass while the fence matched nothing in production.',
    ).not.toBe('PROBE_FAILED');
    expect(result).toBe('NO_MATCH'); // this node process is not claude.exe
  });

  it('returns NO_MATCH (not PROBE_FAILED) for a pid that cannot exist', () => {
    // 0x7FFFFFFF is not a valid live pid on Windows. A working probe reports no match; a broken
    // invocation would fail the same way it fails for everything, which is the point of pairing
    // this with the case above.
    expect(pidIsClaude(0x7FFFFFFF, undefined)).toBe('NO_MATCH');
  });

  it('rejects a non-integer pid before it can reach the shell', () => {
    // Defence in depth for the command-injection path: normalisation happens upstream, but
    // pidIsClaude re-checks, and that re-check must hold when called directly.
    for (const bad of ['1 & echo hi', '-1', 0, null, undefined, '12; rm -rf /']) {
      expect(pidIsClaude(bad, undefined)).toBe('NO_MATCH');
    }
  });

  it('the image name it filters on is the one production expects', () => {
    // Guards a silent rename: if CLAUDE_IMAGE drifted, every probe would return NO_MATCH and the
    // fence would read every session as dead.
    expect(CLAUDE_IMAGE).toBe('claude.exe');
  });
});
