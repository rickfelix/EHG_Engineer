/**
 * claimGuard's release_sd calls must NAME THE MECHANISM, never stamp 'manual'.
 *
 * THE DEFECT, measured live 2026-07-26: one worker lost the same claim three times in 42 minutes.
 * The first loss stamped STALE_CLEANUP and was diagnosable. The next two stamped 'manual' and were
 * NOT — because they came through claim-guard.mjs, which hardcoded that string.
 *
 * Why 'manual' is uniquely bad rather than merely vague: it is ALSO release_sd's DEFAULT p_reason
 * (database/migrations/20260502_release_clear_worktree_state.sql:24). So a mechanical release
 * stamped 'manual' is byte-identical to a deliberate human release AND to a caller that passed no
 * reason at all. The fingerprint cannot separate three different causes, which is what made the
 * live investigation impossible.
 *
 * The stale-transfer path already COMPUTED a precise reason ('stale_pid_dead_<pid>' /
 * 'stale_different_host') for its audit log and then discarded it one line before the RPC call.
 * These tests pin that it is now passed through, and that no claim-guard release path can
 * regress to 'manual'.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib', 'claim-guard.mjs'),
  'utf8',
);

/** Every `p_reason:` value passed to an RPC in this module. */
function reasonArguments() {
  return [...SRC.matchAll(/p_reason:\s*([^\n,}]+)/g)].map((m) => m[1].trim());
}

describe('claim-guard release reasons name the mechanism (regression fence)', () => {
  it('NO release path stamps the literal \'manual\'', () => {
    const literalManual = reasonArguments().filter((r) => /^['"`]manual['"`]$/.test(r));
    expect(literalManual).toEqual([]);
  });

  it('passes a reason at every release_sd call — never relying on the default', () => {
    // Deliberately NOT brace-matched. An earlier version of this test captured up to the first
    // '}' within 400 chars, which silently matched ZERO call sites once explanatory comments and
    // a ${...} template literal pushed that brace out of range — the assertion then "passed" over
    // an empty set. Take a generous fixed window from each call instead, and keep the
    // length-greater-than-zero guard below so an empty match set fails loudly rather than quietly.
    const releaseCalls = [...SRC.matchAll(/rpc\(\s*['"`]release_sd['"`][\s\S]{0,900}/g)].map((m) => m[0]);
    expect(releaseCalls.length).toBeGreaterThan(0);
    for (const args of releaseCalls) {
      expect(args).toMatch(/p_reason:/);
      // The reason must appear BEFORE the next rpc( call, so we are reading this site's argument.
      const thisSite = args.split(/rpc\(/).slice(0, 2).join('rpc(');
      expect(thisSite).not.toMatch(/p_reason:\s*['"`]manual['"`]/);
    }
  });

  it('the stale-transfer path REUSES its computed reason instead of discarding it', () => {
    // The precise defect: the audit log got the good string, the RPC got 'manual'.
    expect(SRC).toMatch(/const releaseReason\s*=/);
    expect(SRC).toMatch(/p_reason:\s*releaseReason/);
    // ...and the audit log must be fed from the SAME variable, so the two can never diverge again.
    expect(SRC).toMatch(/reason:\s*releaseReason/);
  });

  it('still distinguishes a dead PID from a different host', () => {
    expect(SRC).toMatch(/stale_pid_dead_/);
    expect(SRC).toMatch(/stale_different_host/);
  });

  it('the identity-transfer path is distinguishable from the stale-heartbeat path', () => {
    // Different causes must not collapse to one string — that is the whole point of the fix.
    expect(SRC).toMatch(/identity_transfer_dead_pid_/);
  });

  it('reason strings carry the PID where one is known, because "which process died" is asked first', () => {
    expect(SRC).toMatch(/identity_transfer_dead_pid_\$\{claimPid\}/);
    expect(SRC).toMatch(/stale_pid_dead_\$\{claimPid\}/);
  });
});
