/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3 — resume threading, asserted BEHAVIOURALLY.
 *
 * THIS FILE PREVIOUSLY ASSERTED SOURCE TEXT AND WAS WRONG ABOUT REALITY. It matched
 * `sessionId: opts.sessionId` in spawn-control.js and claimed "so a FORK can carry a fresh
 * identity". The threading was real; the FORK was not. build-session-launch.cjs treated --resume
 * and --session-id as MUTUALLY EXCLUSIVE, so the sessionId was silently dropped and every "fork"
 * emitted a plain --resume that reused the OLD id — precisely the case FR-3 forbids, because
 * re-registering under the old id lets a health check pass against the dead row's warm heartbeat.
 *
 * The test passed the whole time. That is the accepted-but-unread class this SD documents four
 * times about OTHER code, committed here in its own verification. Caught by the EXEC TESTING pass.
 *
 * The builder is PURE and INJECTABLE, so there was never a reason to substitute source-matching
 * for execution here. Now it executes and asserts the ACTUAL EMITTED ARGV.
 */

import { describe, it, expect } from 'vitest';
import { buildLiveSpawnInvocation } from '../../../lib/fleet/spawn-control.js';

const OLD = '11111111-1111-4111-8111-111111111111';
const NEW = '22222222-2222-4222-8222-222222222222';
const base = { role: 'worker', callsign: 'Alpha-1' };

/** Index of a flag's value in argv. */
const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];

describe('FR3-FORK: a fork carries BOTH the old conversation and a NEW identity', () => {
  it('emits --fork-session, --resume <old> AND --session-id <new>', () => {
    const { args } = buildLiveSpawnInvocation({ ...base, resumeUuid: OLD, sessionId: NEW, forkSession: true }, {});
    expect(args).toContain('--fork-session');
    expect(valueAfter(args, '--resume')).toBe(OLD);
    expect(valueAfter(args, '--session-id')).toBe(NEW);
  });

  it('does NOT reuse the old id as the new identity', () => {
    // The specific defect: re-registering under the OLD id lets a health check pass against the
    // dead row's still-warm heartbeat, so a dead seat reads as alive.
    const inv = buildLiveSpawnInvocation({ ...base, resumeUuid: OLD, sessionId: NEW, forkSession: true }, {});
    expect(inv.sessionId).toBe(NEW);
    expect(inv.sessionId).not.toBe(OLD);
  });

  it('REFUSES a fork without a valid new UUID rather than silently degrading to plain resume', () => {
    // Silent degradation is exactly how the original defect stayed invisible.
    expect(() => buildLiveSpawnInvocation({ ...base, resumeUuid: OLD, sessionId: 'not-a-uuid', forkSession: true }, {}))
      .toThrow(/forkSession requires a valid UUID/);
    expect(() => buildLiveSpawnInvocation({ ...base, resumeUuid: OLD, forkSession: true }, {}))
      .toThrow(/forkSession requires a valid UUID/);
  });
});

describe('FR3-RESUME: plain resume is unchanged', () => {
  it('emits --resume alone and adopts the existing id', () => {
    const inv = buildLiveSpawnInvocation({ ...base, resumeUuid: OLD }, {});
    expect(inv.args).not.toContain('--fork-session');
    expect(inv.args).not.toContain('--session-id');
    expect(inv.sessionId).toBe(OLD);
  });

  it('a cold start mints a fresh --session-id and never resumes', () => {
    const inv = buildLiveSpawnInvocation({ ...base, sessionId: NEW }, { uuidFn: () => NEW });
    expect(inv.args).not.toContain('--resume');
    expect(inv.args).not.toContain('--fork-session');
    expect(valueAfter(inv.args, '--session-id')).toBe(NEW);
  });
});

describe('FR3-CWD: launch_cwd, asserted through the invocation', () => {
  it('the resolved cwd is what the process will be given', () => {
    const wt = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-X';
    const inv = buildLiveSpawnInvocation({ ...base, cwd: wt }, {});
    expect(inv.cwd).toBe(wt);
  });
});
