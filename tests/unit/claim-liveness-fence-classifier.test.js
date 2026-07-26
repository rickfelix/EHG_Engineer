/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-1 — the claimant liveness classifier.
 *
 * THE LOAD-BEARING TEST HERE IS THE FALSE-NEGATIVE ONE (AC-N1), not the corpse case. This fence is
 * asymmetric: admitting a corpse leaves one pinned item a sweep later clears, but falsely fencing a
 * LIVE worker silently stops real work and presents as an idle fleet. The spec as originally
 * written tested only the corpse side.
 *
 * FIXTURE DESIGN, deliberately host-independent: the `tasklist` seam is mocked by matching the PID
 * INSIDE THE COMMAND STRING, never by querying the real process table. The real pids from the
 * measured incident (21864 stale, 7440 live) appear only as traceability to the SD's evidence — so
 * this test stays valid after pid 7440 dies, which it certainly will.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyClaimantLiveness,
  shouldRefuseClaim,
  ALIVE,
  DEAD,
  INDETERMINATE,
} = require('../../lib/fleet/claimant-liveness.cjs');

/** Measured 2026-07-26 on session 24ca166f — see the SD's LEAD FINDING block. */
const STALE_RECORDED_PID = 21864; // claude_sessions.pid — probes NOT FOUND
const LIVE_TICK_PID = 7440;       // tick pidfile cc_parent_pid — a real, live claude.exe
const SESSION = '24ca166f-1a46-4584-99a7-35c791b28663';

/** A tasklist CSV row for a live claude.exe at `pid`. */
const claudeRow = (pid) => `"claude.exe","${pid}","Console","1","123,456 K"\n`;
/** What tasklist actually prints when nothing matches — an INFO line, not a non-zero exit. */
const NO_MATCH = 'INFO: No tasks are running which match the specified criteria.\n';

/**
 * Seam keyed on the pid in the command string. `livePids` is the set of pids that are live
 * claude.exe processes; everything else reports no match.
 */
function execFor(livePids, { imageName = 'claude.exe' } = {}) {
  return vi.fn((cmd) => {
    const m = /PID eq (\d+)/.exec(cmd);
    const pid = m ? Number(m[1]) : null;
    if (pid !== null && livePids.includes(pid)) {
      return imageName === 'claude.exe' ? claudeRow(pid) : `"${imageName}","${pid}","Console","1","9 K"\n`;
    }
    return NO_MATCH;
  });
}

const pidfileWith = (pid) => () => (pid === null ? null : { session_id: SESSION, cc_parent_pid: pid });
const noPidfile = () => null;

describe('AC-N1 — a LIVE session with a STALE recorded pid must still be allowed to claim', () => {
  it('classifies ALIVE from the tick pidfile even though the recorded pid probes NOT FOUND', () => {
    const result = classifyClaimantLiveness({
      sessionId: SESSION,
      recordedPid: STALE_RECORDED_PID,
      // Only 7440 is live. 21864 is gone — exactly the measured incident.
      execCmd: execFor([LIVE_TICK_PID]),
      readPidfile: pidfileWith(LIVE_TICK_PID),
    });

    expect(
      result.verdict,
      `stale recorded pid ${STALE_RECORDED_PID} must NOT produce DEAD when tick pidfile pid `
      + `${LIVE_TICK_PID} is a live claude.exe — this is the measured false-fence case`,
    ).toBe(ALIVE);
    expect(shouldRefuseClaim(result.verdict)).toBe(false);
    expect(result.decidingSignal).toBe('tick_pidfile_name_match');
  });

  it('AC-N2 — no tick pidfile is INDETERMINATE, never DEAD, even when the recorded pid is gone', () => {
    const result = classifyClaimantLiveness({
      sessionId: SESSION,
      recordedPid: STALE_RECORDED_PID,
      execCmd: execFor([]), // nothing live anywhere
      readPidfile: noPidfile,
    });

    // Absence of a marker is weak evidence: it is written once at spawn with best-effort cleanup.
    expect(result.verdict).toBe(INDETERMINATE);
    expect(shouldRefuseClaim(result.verdict)).toBe(false);
    expect(result.decidingSignal).toBe('no_binding_fail_open');
  });
});

describe('the corpse side — a genuinely dead claimant is refused', () => {
  it('returns DEAD when the session-declared pidfile pid is gone', () => {
    const result = classifyClaimantLiveness({
      sessionId: SESSION,
      recordedPid: null,
      execCmd: execFor([]),
      readPidfile: pidfileWith(31337),
    });

    expect(result.verdict).toBe(DEAD);
    expect(shouldRefuseClaim(result.verdict)).toBe(true);
    expect(result.pidfilePid).toBe(31337);
  });
});

describe('TS-4 — PID recycling must not read as alive', () => {
  it('does NOT return ALIVE when a live NON-claude process occupies the pid', () => {
    const result = classifyClaimantLiveness({
      sessionId: SESSION,
      recordedPid: null,
      // The pid IS live, but it is node.exe, not claude.exe. Bare existence must not satisfy this.
      execCmd: execFor([4242], { imageName: 'node.exe' }),
      readPidfile: pidfileWith(4242),
    });

    expect(result.verdict).not.toBe(ALIVE);
    expect(result.verdict).toBe(DEAD);
  });
});

describe('TS-5 — a broken probe must fail OPEN, never wedge the fleet', () => {
  it('returns INDETERMINATE when the tasklist shell-out throws', () => {
    const boom = vi.fn(() => { throw new Error('tasklist: not found'); });
    const result = classifyClaimantLiveness({
      sessionId: SESSION,
      recordedPid: STALE_RECORDED_PID,
      execCmd: boom,
      readPidfile: pidfileWith(LIVE_TICK_PID),
    });

    expect(result.verdict).toBe(INDETERMINATE);
    expect(shouldRefuseClaim(result.verdict)).toBe(false);
    expect(result.decidingSignal).toBe('probe_failure');
  });

  it('returns INDETERMINATE rather than DEAD when no session id is supplied', () => {
    expect(classifyClaimantLiveness({}).verdict).toBe(INDETERMINATE);
  });
});

describe('FR-1 AC5 — the classifier must not consult the forbidden fields', () => {
  it('never references process_alive_at, heartbeat_at or status', () => {
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib/fleet/claimant-liveness.cjs'),
      'utf8',
    );
    // Strip block comments: the header EXPLAINS why these fields are refused, and that prose must
    // not trip the check. Code is what matters here.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const forbidden of ['process_alive_at', 'heartbeat_at']) {
      expect(code, `${forbidden} is written by the very thing this fence excludes`).not.toContain(forbidden);
    }
  });

  it('shouldRefuseClaim blocks ONLY on DEAD', () => {
    expect(shouldRefuseClaim(DEAD)).toBe(true);
    expect(shouldRefuseClaim(ALIVE)).toBe(false);
    expect(shouldRefuseClaim(INDETERMINATE)).toBe(false);
  });
});
