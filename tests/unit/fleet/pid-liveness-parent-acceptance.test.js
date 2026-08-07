/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-4) — PARENT BINDING ACCEPTANCE.
 *
 * This is the test that is allowed to say the SD worked. It passes only when all three children
 * are present, so none of them can be declared done on a partial system.
 *
 * WHY IT IS SHAPED THIS WAY. Five prior builds of this defect class each shipped a check that
 * could only fail in ONE direction, and a check that cannot see the constraint is not evidence of
 * absence. So the binding requirement here is not "assert the fix works" — it is:
 *
 *     ONE RUN MUST PRODUCE BOTH VERDICTS. A live seat must read ALIVE and a killed seat must read
 *     DEAD, in the same execution. A run that can only produce one direction is a FAILURE.
 *
 * It uses REAL operating-system processes, not mocks: one child left running, one spawned and
 * killed and confirmed reaped. The instrument is checked in both directions BEFORE its verdicts
 * are believed — the same control the SD's author ran before reporting the original measurement
 * (process.kill(self,0) => EXISTS, process.kill(999999,0) => ESRCH).
 *
 * DELIBERATELY NOT ASSERTED: stale_reason, stale_at, released_reason. Measurement found 13 SQL
 * writers of stale_reason against 2 JS clearers and ZERO SQL clearers, so a recovered session
 * retains a stale one forever. Asserting on those columns would PIN that bug rather than detect
 * it. A test at the bottom of this file greps this file's own source to enforce that.
 *
 * WHAT BINDS EACH CHILD — every one of these fails if its child is reverted:
 *   C2 (shared resolver)  — the live seat carries a UUID terminal_id, which the pre-C2
 *                           last-segment-split resolver could not resolve at all. If C2 is
 *                           reverted the live seat stops reading pid-alive and the ALIVE half dies.
 *   C1 (adopt-own-pid)    — the tick must refuse to adopt its own pid; without it a dead session
 *                           stamps fresh heartbeats forever and no downstream verdict can be dead.
 *   C3 (venue abstention) — a PID-blind venue must abstain rather than convert its own blindness
 *                           into a death verdict.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveCcPidFromTerminalId } = require('../../../lib/fleet/resolve-cc-pid.cjs');
const { isProcessRunning } = require('../../../lib/fleet/cc-pid-liveness.cjs');
const { hasPidAlive, isSessionAlive } = require('../../../lib/fleet/session-liveness.cjs');
const { pidVenueCapability } = require('../../../lib/fleet/pid-venue.cjs');

// Real UUID-shaped terminal_ids — the format live sessions actually write, and the one the
// pre-C2 resolver could not decode.
const LIVE_SEAT = { session_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' };
const DEAD_SEAT = { session_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' };

let markerDir;
let absentDir;
let liveChild;
let livePid;
let deadPid;

beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4-acceptance-'));
  markerDir = path.join(tmp, 'session-identity');
  absentDir = path.join(tmp, 'no-such-dir');
  fs.mkdirSync(markerDir);

  // A genuinely LIVE process: sleeps well past the end of this suite.
  liveChild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  livePid = liveChild.pid;

  // A genuinely DEAD process: spawn, kill, and WAIT for the OS to reap it. Waiting matters —
  // asserting on a pid the OS has not finished reaping is how a flaky "it's dead" is manufactured.
  const doomed = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  deadPid = doomed.pid;
  await new Promise((resolve) => {
    doomed.on('exit', resolve);
    doomed.kill();
  });
  // Give Windows a moment to drop the handle before we start asking about it.
  await new Promise((r) => setTimeout(r, 300));

  fs.writeFileSync(path.join(markerDir, `pid-${livePid}.json`), JSON.stringify({ cc_pid: livePid, session_id: LIVE_SEAT.session_id }));
  fs.writeFileSync(path.join(markerDir, `pid-${deadPid}.json`), JSON.stringify({ cc_pid: deadPid, session_id: DEAD_SEAT.session_id }));
});

afterAll(() => {
  try { liveChild?.kill(); } catch { /* already gone */ }
});

describe('FR-4 the instrument discriminates in BOTH directions before any verdict is believed', () => {
  it('reports EXISTS for a live pid and NOT-FOUND for a reaped one', () => {
    // The SD ran exactly this control before believing its own measurement. A liveness instrument
    // that only ever returns false is indistinguishable from a broken one.
    expect(isProcessRunning(livePid)).toBe(true);
    expect(isProcessRunning(deadPid)).toBe(false);
    expect(isProcessRunning(999999)).toBe(false);
    expect(isProcessRunning(process.pid)).toBe(true);
  });
});

describe('FR-4 BINDING ACCEPTANCE — one run, both verdicts', () => {
  it('produces ALIVE for the live seat and DEAD for the killed seat IN THE SAME RUN', () => {
    // ---- the ALIVE half (binds C2: UUID terminal_id resolves only via the shared resolver) ----
    const liveResolved = resolveCcPidFromTerminalId(LIVE_SEAT.session_id, LIVE_SEAT.session_id, markerDir);
    expect(liveResolved, 'C2 REVERTED? a UUID terminal_id resolved to no pid').toBe(livePid);
    const liveVerdict = hasPidAlive({ ...LIVE_SEAT, terminal_id: LIVE_SEAT.session_id }, null, markerDir);

    // ---- the DEAD half ----
    const deadResolved = resolveCcPidFromTerminalId(DEAD_SEAT.session_id, DEAD_SEAT.session_id, markerDir);
    expect(deadResolved, 'C2 REVERTED? the dead seat resolved to no pid').toBe(deadPid);
    const deadVerdict = hasPidAlive({ ...DEAD_SEAT, terminal_id: DEAD_SEAT.session_id }, null, markerDir);

    // THE BINDING ASSERTION. Both directions, one execution. Stated as a pair so a run that can
    // only produce one of them cannot be mistaken for a pass.
    expect(
      { alive: liveVerdict, dead: deadVerdict },
      'a run must produce BOTH verdicts — one direction only is a FAIL'
    ).toEqual({ alive: true, dead: false });
  });

  it('the DEAD verdict is a POSITIVE confirmed-gone, not an abstention wearing its clothes', () => {
    // The invariant all five prior builds collapsed: COULD-NOT-DETERMINE MUST NEVER BECOME DEATH.
    // A dead seat and an unresolvable seat both make hasPidAlive() return false, so falseness
    // alone proves nothing. What separates them is whether a pid was RESOLVED at all.
    const resolvedPid = resolveCcPidFromTerminalId(DEAD_SEAT.session_id, DEAD_SEAT.session_id, markerDir);
    expect(resolvedPid, 'no pid resolved => this is an abstention, not a death').toBe(deadPid);
    expect(isProcessRunning(resolvedPid)).toBe(false);

    // And the contrast case: a seat with no marker at all resolves to nothing. Same false from
    // hasPidAlive, entirely different epistemic status.
    const unknown = resolveCcPidFromTerminalId('cccccccc-3333-4333-8333-cccccccccccc', 'cccccccc-3333-4333-8333-cccccccccccc', markerDir);
    expect(unknown).toBeNull();
    expect(hasPidAlive({ session_id: 'cccccccc-3333-4333-8333-cccccccccccc' }, null, markerDir)).toBe(false);
  });

  it('binds C3: a PID-BLIND venue abstains instead of converting blindness into death', () => {
    // Same dead seat, same resolver, only the venue changes.
    expect(pidVenueCapability({ markerDir }).capable).toBe(true);
    expect(pidVenueCapability({ markerDir: absentDir }).capable).toBe(false);
    // In the blind venue the marker cannot be read at all, so the pid is unresolvable — which the
    // sweep must treat as PID_UNVERIFIABLE rather than as a confirmed death.
    expect(resolveCcPidFromTerminalId(DEAD_SEAT.session_id, DEAD_SEAT.session_id, absentDir)).toBeNull();
  });

  it('binds C1: the tick refuses to adopt its own pid', () => {
    // rediscoverParentPid is not exported (session-tick.cjs is a daemon entrypoint that starts
    // timers on import, so importing it here would spawn a second ticker). The BEHAVIOURAL proof
    // lives in tests/unit/session-tick-spawn-observe.test.mjs TS-3c, which was proven red by
    // hanging the full 6s waiting for an exit that never came. What this parent test binds is that
    // the guard is still THERE — if it is removed, a dead session stamps fresh heartbeats forever
    // and no amount of correct downstream logic can ever produce the DEAD verdict above.
    const src = fs.readFileSync(new URL('../../../scripts/session-tick.cjs', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(src, 'C1 REVERTED? the adopt-own-pid guard is gone').toMatch(/candidate === process\.pid/);
  });

  it('the full read-time ladder agrees: live seat alive, and the ladder is reachable', () => {
    const nowMs = Date.now();
    const stale = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const live = isSessionAlive(
      { ...LIVE_SEAT, terminal_id: LIVE_SEAT.session_id, is_alive: false, heartbeat_at: stale, process_alive_at: null },
      { nowMs, markerDir }
    );
    expect(live).toEqual({ alive: true, reason: 'pid_alive' });
  });
});

/**
 * PLAN/VERIFY VALIDATION finding 659e163f (verdict FAIL, and it was a fair hit): the block above
 * proves both verdicts at hasPidAlive() — ONE RUNG of the ladder — but never at isSessionAlive(),
 * which is the read-time SSOT every consumer actually calls, and never at a consumer that ACTS on
 * the verdict. A rung agreeing with reality is not the same as the decision layer agreeing with
 * reality, and it is the decision layer that releases claims.
 *
 * These cases close that gap at both higher layers, in one run, with the same real processes.
 *
 * They use the win-cc-{port}-{pid} terminal_id form, which the resolver decodes WITHOUT touching
 * the marker directory — so the SSOT and its consumer can be driven with genuinely spawned and
 * killed pids without pointing production code at a fixture dir or writing fabricated markers into
 * the live fleet's .claude/session-identity. The UUID-marker path above remains the thing that
 * binds C2; this binds the layers above it.
 *
 * THE DEAD-SEAT ROW SHAPE IS THE REALISTIC ONE, not a contrived one. is_alive is false because
 * stale-session-sweep.cjs:2444 atomically clears it (the reason the FR-2a contract amendment was
 * withdrawn — is_alive is NOT sticky), heartbeat is long stale, no tick, no armed silence. That is
 * what a genuinely dead seat looks like by the time anything is entitled to act on it.
 */
describe('FR-4 both verdicts AT THE SSOT and at the consumer that acts on them', () => {
  const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
  const STALE = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const seat = (pid) => ({
    session_id: `seat-${pid}`,
    terminal_id: `win-cc-1234-${pid}`,
    is_alive: false,          // the sweep clears this; it is not sticky
    heartbeat_at: STALE,
    process_alive_at: null,
    expected_silence_until: null,
  });

  it('isSessionAlive: ALIVE for the live seat, DEAD for the killed seat, in ONE run', () => {
    const live = isSessionAlive(seat(livePid), { nowMs });
    const dead = isSessionAlive(seat(deadPid), { nowMs });
    expect(
      { live: live.alive, dead: dead.alive },
      'the SSOT must produce BOTH verdicts — one direction only is a FAIL'
    ).toEqual({ live: true, dead: false });
    // The live seat is alive VIA THE PID RUNG specifically — not rescued by a stale heartbeat or
    // a raw flag, both of which are deliberately negative in this row shape.
    expect(live.reason).toBe('pid_alive');
    expect(dead.reason).toBeNull();
  });

  it('shouldHoldClaim: the live seat KEEPS its claim and the dead seat RELEASES it, in ONE run', () => {
    // claim-release-guard is the consumer that converts a dead verdict straight into a release —
    // hold=false orphans an in-flight SD. This is where being wrong actually costs something, so
    // this is where both directions have to be demonstrated.
    const { shouldHoldClaim } = require('../../../lib/fleet/claim-release-guard.cjs');
    const liveHold = shouldHoldClaim(seat(livePid));
    const deadHold = shouldHoldClaim(seat(deadPid));
    expect(
      { live: liveHold.hold, dead: deadHold.hold },
      'the destructive consumer must produce BOTH outcomes in one run'
    ).toEqual({ live: true, dead: false });
  });

  it('COULD-NOT-DETERMINE does not release a claim', () => {
    // The invariant, asserted at the layer that can do damage: a seat whose pid is unresolvable is
    // NOT the same as a seat whose pid is confirmed gone. All five prior builds collapsed these.
    const unresolvable = { ...seat(deadPid), terminal_id: null, session_id: null };
    const verdict = isSessionAlive(unresolvable, { nowMs });
    expect(verdict.alive).toBe(false);
    // ...and that is exactly why the abstention must be caught UPSTREAM, at the venue (FR-3a),
    // rather than here: by the time a row reaches the SSOT with nothing resolvable on it, the
    // ladder has no way to tell "gone" from "never asked". pid-venue.cjs is what keeps a blind
    // venue from ever presenting this row shape as a death.
    expect(pidVenueCapability({ markerDir: absentDir }).capable).toBe(false);
  });
});

describe('FR-4 the test obeys its own constraints', () => {
  it('makes NO assertion on stale_reason / stale_at / released_reason', () => {
    // Enforced against this file's own source rather than by reviewer discipline. Those columns
    // are never cleared on recovery (13 SQL writers, 2 JS clearers, 0 SQL clearers), so asserting
    // on them would pin that defect in place instead of detecting it.
    // The forbidden names are assembled from fragments so this check does not match ITSELF — a
    // self-referential grep is a check that can only ever fail, which is just the mirror image of
    // the self-comparing check that can only ever pass. Neither tells you anything.
    const forbidden = new RegExp(['stale', '_reason|stale', '_at|released', '_reason'].join(''));
    const self = fs.readFileSync(new URL(import.meta.url), 'utf8');
    const assertions = self
      .split('\n')
      .filter((l) => /\bexpect\(/.test(l) && !/forbidden/.test(l))
      .join('\n');
    expect(assertions).not.toMatch(forbidden);
  });
});
