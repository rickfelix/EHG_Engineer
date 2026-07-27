/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (C1 pre-amendment guard rail)
 *
 * WHY THIS EXISTS — AND WHY THE AMENDMENT IT WAS WRITTEN FOR IS NO LONGER COMING.
 *
 * ORIGINAL PREMISE (SUPERSEDED, 2026-07-27): this file was written as a pre-amendment guard rail
 * for a planned change to the one-directional contract at lib/fleet/session-liveness.cjs:12-15,
 * letting isSessionAlive return alive=false for a session whose raw is_alive flag says true.
 * THAT AMENDMENT IS WITHDRAWN. The rationale for it was that is_alive is "sticky; survives kill -9"
 * (lib/claim/reacquire-self-live.mjs:54-55), so ranking it first imports a false-alive failure.
 * Both halves of that rationale turned out to be wrong on the live code:
 *   - NOT STICKY: stale-session-sweep.cjs:2444 atomically sets is_alive=false
 *     (SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001, FR-1/FR-2).
 *   - THE DOCUMENTED FAILURE RUNS THE OTHER WAY: claim-validity-gate.js:220-224 and :266-270 record
 *     that a LIVE, actively-heartbeating /loop worker transiently reads is_alive=false, and reaping
 *     on that alone caused claim/release thrash and GATE_CLAIM_VALIDITY_FAILED — hit 2x in one
 *     session. False-DEAD is the failure this system actually suffers; the short-circuit at :103 is
 *     load-bearing protection against it, not a defect.
 * So :103 stays. The remaining liveness scope is adoption of isSessionAlive() at the deciders that
 * rolled their own answer — NOT a change to the predicate itself.
 *
 * THESE TESTS STILL EARN THEIR PLACE. They pin the invariant below against the CURRENT predicate,
 * and that invariant is exactly what the withdrawn amendment would have put at risk. They are the
 * regression net for any future attempt to revive it — and one was proposed and retracted within a
 * single hour, so a future attempt is likely.
 *
 * The reason the amendment was dangerous is unchanged, and is why the invariant matters: a dead
 * verdict is ACTED ON destructively:
 *   - lib/fleet/claim-release-guard.cjs shouldHoldClaim() returns hold=false when the holder is
 *     not alive, and hold=false RELEASES the claim — orphaning an in-flight SD.
 *   - scripts/worktree-reaper.mjs and lib/worktree-reaper/live-claim-guard.js gate worktree
 *     reaping on the same verdict.
 * (Measured nuance worth recording: live-claim-guard.js ALREADY fails closed — its
 * unverifiable_no_supabase / unverifiable_claim_lookup_error / unverifiable_session_lookup_error
 * paths all return blocked=true, i.e. do NOT reap. So it is safer than the other two. The exposed
 * one is claim-release-guard, which converts a dead verdict directly into a release.)
 *
 * THE INVARIANT: a dead verdict must require a POSITIVE "the process is confirmed gone" answer.
 * COULD-NOT-DETERMINE MUST NEVER BECOME DEATH. That is the distinction all five prior attempts at
 * this defect class collapsed — they turned an absent signal into a verdict, traded false-life for
 * false-death, and got reverted.
 *
 * These tests pin that invariant against TODAY's behaviour. If any future change breaks one of
 * them, that change is wrong, not the test.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { isSessionAlive } = require('../../../lib/fleet/session-liveness.cjs');
const { resolveCcPidFromTerminalId } = require('../../../lib/fleet/resolve-cc-pid.cjs');

// A marker dir that exists but contains nothing, so the PID leg genuinely cannot determine.
const EMPTY_MARKERS = path.join(__dirname, '.tmp-no-markers-c1');

const LONG_AGO = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

describe('C1 guard rail: abstention is not death', () => {
  it('a raw-alive session whose PID cannot be resolved stays ALIVE', () => {
    // terminal_id absent AND no marker => resolveCcPidFromTerminalId returns null => the PID leg
    // abstains. The amendment must not read that abstention as confirmation of death.
    const verdict = isSessionAlive({
      session_id: 'no-marker-anywhere-0000',
      is_alive: true,
      heartbeat_at: LONG_AGO,
      process_alive_at: LONG_AGO,
      terminal_id: null,
    });
    expect(verdict.alive).toBe(true);
  });

  it('the resolver reports could-not-determine as null — never as a pid, never as a throw', () => {
    expect(resolveCcPidFromTerminalId(null, null, EMPTY_MARKERS)).toBeNull();
    expect(resolveCcPidFromTerminalId('not-a-known-format', undefined, EMPTY_MARKERS)).toBeNull();
    expect(resolveCcPidFromTerminalId('some-uuid-with-no-marker', 'some-uuid-with-no-marker', EMPTY_MARKERS)).toBeNull();
  });

  it('claim-release-guard HOLDS the claim for a raw-alive holder with an unresolvable PID', () => {
    // The destructive path: hold=false RELEASES. An unresolvable PID must never reach it.
    const { shouldHoldClaim } = require('../../../lib/fleet/claim-release-guard.cjs');
    const { hold } = shouldHoldClaim({
      session_id: 'unresolvable-holder-0000',
      is_alive: true,
      heartbeat_at: LONG_AGO,
      process_alive_at: LONG_AGO,
      terminal_id: null,
    });
    expect(hold).toBe(true);
  });

  it('a fresh heartbeat alone keeps a session alive even with no PID evidence at all', () => {
    const verdict = isSessionAlive({
      session_id: 'fresh-hb-no-pid-0000',
      is_alive: false,
      heartbeat_at: new Date().toISOString(),
      terminal_id: null,
    });
    expect(verdict.alive).toBe(true);
    expect(verdict.reason).toBe('fresh_heartbeat');
  });
});
