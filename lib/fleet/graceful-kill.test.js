// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — graceful kill.
// The ORDER is the safety property, so most of these assert sequencing and refusal, not output.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  gracefulKillSession,
  isGracefulKillEnabled,
  isWorkDurableAfterPrepark,
  reconcilePid,
  KILL_STEPS,
} from './graceful-kill.mjs';
// The mocked hand-back, imported so GK-RESET-AFTER-KILL can assert on it directly. `calls` cannot
// see it — the mock factory below is hoisted out of deps()'s scope.
import { releaseWorkItemOnSessionEnd } from './release-work-item.mjs';
// REAL implementations, for the "wire" tests below — TESTING-agent finding (EXEC phase): the
// existing e2e tests hand-fixture BOTH runPreparkWip and isWorktreeDirty, so the actual
// composition between graceful-kill.mjs and its two real collaborators was never exercised.
import { runPreparkWip } from './prepark-wip.cjs';
import { isWorktreeDirty } from '../../scripts/fleet-kill.mjs';

const ON = { FLEET_GRACEFUL_KILL_ENABLED: 'on' };

function deps(over = {}) {
  const calls = [];
  const base = {
    env: ON,
    getSession: vi.fn(async () => ({ pid: 4242, sd_key: 'QF-20260726-175', worktree_path: 'C:/wt' })),
    readMarkerPid: vi.fn(() => 4242),
    pidIsClaude: vi.fn(() => true),
    sampleToolActivity: vi.fn(async () => { calls.push('sample'); return { ok: true, advancing: false }; }),
    isWorktreeDirty: vi.fn(() => true),
    runPreparkWip: vi.fn(() => { calls.push('prepark'); return { action: 'commit_and_push', committed: true, pushed: true }; }),
    releaseClaim: vi.fn(async () => { calls.push('release'); return { released: true }; }),
    kill: vi.fn(async (_pid, sig) => { calls.push(`kill:${sig}`); }),
    recordStop: vi.fn(async () => { calls.push('record'); }),
    verifyGone: vi.fn(async () => true),
  };
  return { calls, d: { ...base, ...over } };
}

// The hand-back is a real import; stub the module so the sequence is observable.
vi.mock('./release-work-item.mjs', () => ({
  releaseWorkItemOnSessionEnd: vi.fn(async () => ({ ok: true, action: 'qf_reopened', detail: 'stub' })),
}));

describe('FR2-FLAG: its own flag, never the canary flag', () => {
  it('is OFF unless FLEET_GRACEFUL_KILL_ENABLED is exactly "on"', () => {
    expect(isGracefulKillEnabled({})).toBe(false);
    expect(isGracefulKillEnabled({ FLEET_GRACEFUL_KILL_ENABLED: 'true' })).toBe(false);
    expect(isGracefulKillEnabled({ FLEET_GRACEFUL_KILL_ENABLED: 'on' })).toBe(true);
  });

  it('FLEET_CANARY_KILL_ENABLED alone CANNOT enable it', async () => {
    // The canary flag's canary-only assert is what keeps drills off production seats.
    // Reusing it here would hand this verb that blast radius.
    expect(isGracefulKillEnabled({ FLEET_CANARY_KILL_ENABLED: 'on' })).toBe(false);
    const { d } = deps({ env: { FLEET_CANARY_KILL_ENABLED: 'on' } });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('disabled');
    expect(d.kill).not.toHaveBeenCalled();
  });
});

describe('FR2-ORDER: the eight steps run in the order that makes them safe', () => {
  it('preserve precedes release precedes reset precedes kill precedes record', async () => {
    const { calls, d } = deps();
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('killed');
    expect(r.steps).toEqual(KILL_STEPS);
    // WIP is preserved before anything irreversible, and the claim is released before the kill.
    // The WORK ITEM hand-back, by contrast, now runs AFTER the kill is verified — see the
    // GK-RESET-AFTER-KILL tests below, which pin that directly. It is absent from `calls`
    // because the hand-back is a mocked module, outside this array's scope.
    expect(calls).toEqual(['sample', 'prepark', 'release', 'kill:SIGTERM', 'record']);
  });

  it('escalates SIGTERM -> SIGKILL only when the process survives', async () => {
    const { calls, d } = deps({ verifyGone: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });
    await gracefulKillSession({}, 's1', d);
    expect(calls.filter((c) => c.startsWith('kill:'))).toEqual(['kill:SIGTERM', 'kill:SIGKILL']);
  });

  // GK-RESET-AFTER-KILL (SD-LEO-INFRA-RELEASE-WORK-ITEM-001). The step-order assertion above
  // compares r.steps against KILL_STEPS — but KILL_STEPS is EXPORTED BY THE MODULE UNDER TEST, so
  // it is a self-consistency check: move both sides together and it passes regardless of whether
  // the order is safe. It caught the reorder only because I changed one side. These two pin the
  // property itself, against the real call, in the direction that matters.
  it('GK-RESET-AFTER-KILL: does NOT hand the work item back when the kill cannot be verified', async () => {
    releaseWorkItemOnSessionEnd.mockClear();
    // Both SIGTERM and SIGKILL fail to verify — the process may still be alive.
    const { d } = deps({ verifyGone: vi.fn(async () => false) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    // The row must stay in_progress. Handing it back here would publish a claimable SD whose
    // worktree still has a live process in it — the exact race the reorder exists to close.
    expect(releaseWorkItemOnSessionEnd).not.toHaveBeenCalled();
    expect(r.handback).toBeNull();
  });

  // GK-1: gating our OWN reset is only half the fix. step 7's recordStop -> spawn-control stop()
  // re-runs the hand-back, so the verdict has to travel with the call or stop() re-opens the
  // window from another file. These pin the FORWARDING; the receiving half is pinned in
  // spawn-control-stop-workitem.test.js under the same GK-1 heading.
  it('GK-1: forwards gone:false to recordStop when the kill could not be verified', async () => {
    const { d } = deps({ verifyGone: vi.fn(async () => false) });
    await gracefulKillSession({}, 's1', d);
    expect(d.recordStop).toHaveBeenCalledWith('s1', { gone: false });
  });

  it('GK-1 CONTROL: forwards gone:true on a verified kill', async () => {
    const { d } = deps();
    await gracefulKillSession({}, 's1', d);
    // Control: the assertion above would also pass if the flag were hardcoded false.
    expect(d.recordStop).toHaveBeenCalledWith('s1', { gone: true });
  });

  it('GK-RESET-AFTER-KILL: DOES hand it back once the process is verified gone', async () => {
    releaseWorkItemOnSessionEnd.mockClear();
    const { d } = deps();
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('killed');
    // Control for the test above: same call, kill verified, hand-back fires. Without this the
    // not-called assertion would also pass if the hand-back were deleted outright.
    expect(releaseWorkItemOnSessionEnd).toHaveBeenCalledTimes(1);
    expect(r.handback).not.toBeNull();
  });

  it('reports failure when the process is STILL present after SIGKILL — not a status flip', async () => {
    // The SD's acceptance is "absent from a Win32_Process name query", precisely because
    // spawn-control stop() used to flip a column and leave the process running.
    const { d } = deps({ verifyGone: vi.fn(async () => false) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    expect(r.detail).toMatch(/still present after SIGTERM then SIGKILL/);
  });
});

describe('FR2-IDENTIFY: refuse rather than kill the wrong process', () => {
  it('refuses when the marker pid disagrees with claude_sessions.pid', async () => {
    const { d } = deps({ readMarkerPid: vi.fn(() => 9999) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    expect(r.haltedAt).toBe('identify');
    expect(r.detail).toMatch(/refusing to guess/);
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('refuses when the pid is not a live claude.exe (the shell-wrapper case)', async () => {
    // claude_sessions.pid falls back to process.ppid, which yields a wrapper. pidIsClaude is
    // immune by construction: a powershell.exe is not named claude.exe.
    const { d } = deps({ pidIsClaude: vi.fn(() => false) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    expect(r.detail).toMatch(/shell wrapper/);
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('refuses an unverifiable pid rather than killing it', async () => {
    const { d } = deps({ pidIsClaude: vi.fn(() => undefined) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('reconcilePid is pure and refuses a null pid', () => {
    expect(reconcilePid({ dbPid: null }).ok).toBe(false);
    expect(reconcilePid({ dbPid: 1, markerPid: 1, pidIsClaudeResult: true })).toEqual({ ok: true, pid: 1, source: 'db' });
  });

  // SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-3 / TS-6
  describe('FR-3: marker fallback when claude_sessions.pid is null', () => {
    it('identifies via the marker pid when the row never recorded one', () => {
      expect(reconcilePid({ dbPid: null, markerPid: 4242, pidIsClaudeResult: true }))
        .toEqual({ ok: true, pid: 4242, source: 'marker' });
    });

    it('still refuses when NEITHER source has a pid', () => {
      expect(reconcilePid({ dbPid: null, markerPid: null, pidIsClaudeResult: true }).ok).toBe(false);
    });

    // The fallback must not buy the marker any trust the DB pid would not have earned.
    it('refuses a marker pid that is not a live claude.exe', () => {
      expect(reconcilePid({ dbPid: null, markerPid: 4242, pidIsClaudeResult: false }).ok).toBe(false);
    });

    it('refuses a marker pid whose probe told us nothing (PROBE_FAILED)', () => {
      expect(reconcilePid({ dbPid: null, markerPid: 4242, pidIsClaudeResult: undefined }).ok).toBe(false);
    });

    it('a null dbPid is an absence, not a disagreement — it does not trip the mismatch refusal', () => {
      const r = reconcilePid({ dbPid: null, markerPid: 4242, pidIsClaudeResult: true });
      expect(r.ok).toBe(true);
      expect(r.detail).toBeUndefined();
    });

    it('still refuses when both sources name DIFFERENT live pids', () => {
      expect(reconcilePid({ dbPid: 1, markerPid: 2, pidIsClaudeResult: true }).ok).toBe(false);
    });
  });
});

// SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-3 — the CALL SITE, which is the load-bearing half.
// reconcilePid choosing the marker pid is useless if the caller probes a different one: the run
// would verify one process and then terminate another.
describe('FR-3 call site: the pid that gets probed is the pid that gets killed', () => {
  it('probes and kills the MARKER pid when the row has no pid', async () => {
    const { d } = deps({
      getSession: vi.fn(async () => ({ pid: null, sd_key: 'QF-1', worktree_path: 'C:/wt' })),
      readMarkerPid: vi.fn(() => 7777),
    });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('killed');
    expect(d.pidIsClaude).toHaveBeenCalledWith(7777);   // probed the marker pid, not null
    expect(d.kill).toHaveBeenCalledWith(7777, 'SIGTERM');
    expect(d.verifyGone).toHaveBeenCalledWith(7777);
  });

  it('refuses — and kills NOTHING — when the row has no pid and no marker exists', async () => {
    const { d } = deps({
      getSession: vi.fn(async () => ({ pid: null, sd_key: 'QF-1', worktree_path: 'C:/wt' })),
      readMarkerPid: vi.fn(() => null),
    });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('a marker pid that fails the claude.exe probe is refused, not killed', async () => {
    const { d } = deps({
      getSession: vi.fn(async () => ({ pid: null, sd_key: 'QF-1', worktree_path: 'C:/wt' })),
      readMarkerPid: vi.fn(() => 7777),
      pidIsClaude: vi.fn(() => false),
    });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('refused');
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('CONTROL — the DB pid still wins when present, so the fallback is not silently always-on', async () => {
    const { d } = deps({
      getSession: vi.fn(async () => ({ pid: 4242, sd_key: 'QF-1', worktree_path: 'C:/wt' })),
      readMarkerPid: vi.fn(() => 4242),
    });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('killed');
    expect(d.kill).toHaveBeenCalledWith(4242, 'SIGTERM');
  });
});

describe('FR2-PRESERVE: halt on unrecoverable WIP, and NOTHING is released or killed', () => {
  it('halts when a commit was needed and did not happen', async () => {
    const { d } = deps({ runPreparkWip: vi.fn(() => ({ action: 'commit_and_push', committed: false, pushed: false })) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('halted');
    expect(r.haltedAt).toBe('preserve');
    expect(d.releaseClaim).not.toHaveBeenCalled();
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('halts when the commit landed but the push failed', async () => {
    const { d } = deps({ runPreparkWip: vi.fn(() => ({ action: 'commit_and_push', committed: true, pushed: false })) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('halted');
    expect(r.detail).toMatch(/only in a worktree about to lose its process/);
  });

  it('PROCEEDS on a dirty tree with NO REMOTE once it is committed locally', async () => {
    // The literal reading of "halt on a dirty-unpushable tree" would refuse here forever.
    // decidePrepark calls this case durable: "commit locally (reaper protects it)".
    const { d } = deps({ runPreparkWip: vi.fn(() => ({ action: 'commit_only', committed: true, pushed: false })) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('killed');
  });

  it('isWorkDurableAfterPrepark is pure and covers every prepark action', () => {
    expect(isWorkDurableAfterPrepark({ action: 'noop' }, false).durable).toBe(true);
    expect(isWorkDurableAfterPrepark({ action: 'commit_only', committed: true }, true).durable).toBe(true);
    expect(isWorkDurableAfterPrepark({ action: 'commit_only', committed: false }, true).durable).toBe(false);
    expect(isWorkDurableAfterPrepark({ action: 'push_only', pushed: false }, false).durable).toBe(false);
    expect(isWorkDurableAfterPrepark({ action: 'wat' }, true).durable).toBe(false);
    expect(isWorkDurableAfterPrepark(null, true).durable).toBe(false);
  });

  // SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-3 — THE CONFIRMED DEFECT. decidePrepark
  // (lib/fleet/prepark-wip.cjs) returns action:'noop' for a PROTECTED branch (e.g. main)
  // REGARDLESS of dirty state — its own, correct safety rule: never auto-commit there. Before this
  // fix, isWorkDurableAfterPrepark's switch fell through to the noop case's unconditional
  // durable:true, so a session on main with genuinely uncommitted work was judged durable and
  // killed, discarding it. The prior test above only ever exercised (action:'noop', wasDirty:false)
  // — this is the (action:'noop', wasDirty:true) pairing that was never covered.
  describe('FR-3: a protected-branch noop while genuinely dirty is NOT durable', () => {
    it('isWorkDurableAfterPrepark: noop + dirty=true is durable:false, distinct from noop + dirty=false', () => {
      const protectedBranchNoop = { action: 'noop', note: "protected/unresolved branch 'main' — never auto-commit" };
      expect(isWorkDurableAfterPrepark(protectedBranchNoop, true).durable).toBe(false);
      // CONTROL: the pre-existing clean-tree case is unchanged by this fix.
      expect(isWorkDurableAfterPrepark(protectedBranchNoop, false).durable).toBe(true);
    });

    it('end-to-end: gracefulKillSession HALTS for a protected branch with a dirty tree — fails on pre-fix code, passes after', async () => {
      const { d } = deps({
        isWorktreeDirty: vi.fn(() => true),
        runPreparkWip: vi.fn(() => ({ action: 'noop', note: "protected/unresolved branch 'main' — never auto-commit" })),
      });
      const r = await gracefulKillSession({}, 's1', d);
      expect(r.outcome).toBe('halted');
      expect(r.haltedAt).toBe('preserve');
      expect(r.detail).toMatch(/dirty tree, but prepark declined to act/);
      // Nothing released or killed — the whole point of halting at PRESERVE.
      expect(d.releaseClaim).not.toHaveBeenCalled();
      expect(d.kill).not.toHaveBeenCalled();
    });

    it('CONTROL: a protected branch with a CLEAN tree still proceeds to kill (the common park-on-main case)', async () => {
      // Without this, "always halt on a noop" would satisfy the assertion above too.
      const { d } = deps({
        isWorktreeDirty: vi.fn(() => false),
        runPreparkWip: vi.fn(() => ({ action: 'noop', note: "protected/unresolved branch 'main' — never auto-commit" })),
      });
      const r = await gracefulKillSession({}, 's1', d);
      expect(r.outcome).toBe('killed');
    });
  });

  // TESTING-agent finding (EXEC phase, confirmed BLOCKING before this fix): a session with NO
  // worktree_path is NOT "unresolvably dirty" -- it has nothing to preserve at all. Verified live:
  // 9 of 11 currently-active claude_sessions rows have worktree_path=null (coordinator/Adam/
  // Solomon seats among them). Without this fix, isWorktreeDirty(null) fails closed to true,
  // runPreparkWip({worktreePath:null}) returns {action:'noop', note:'no_worktree_path'}, and the
  // (dirty:true, noop) combination this FR just fixed for the protected-branch case ALSO fired
  // here -- halting every no-worktree kill on a false "dirty tree" that could never resolve.
  describe('FR-3 regression: a session with NO worktree_path has nothing to preserve', () => {
    it('proceeds to kill rather than halting -- the fix above must not make no-worktree sessions unkillable', async () => {
      const { d } = deps({
        getSession: vi.fn(async () => ({ pid: 4242, sd_key: null, worktree_path: null })),
        isWorktreeDirty: vi.fn(() => { throw new Error('must not be called when there is no worktree to check'); }),
        runPreparkWip: vi.fn(() => { throw new Error('must not be called when there is no worktree to preserve'); }),
      });
      const r = await gracefulKillSession({}, 's1', d);
      expect(r.outcome).toBe('killed');
    });

    it('REAL WIRE: the actual runPreparkWip + isWorktreeDirty implementations, not hand-fixtured', async () => {
      const { d } = deps({
        getSession: vi.fn(async () => ({ pid: 4242, sd_key: null, worktree_path: null })),
        isWorktreeDirty,
        runPreparkWip,
      });
      const r = await gracefulKillSession({}, 's1', d);
      expect(r.outcome).toBe('killed');
    });
  });

  it('isWorktreeDirty OMITTED from deps entirely (not merely returning a value) fails CLOSED for a session that HAS a worktree', async () => {
    // Same discipline as QF-20260728-054's verifyGone tests below: absence of a check is not
    // evidence of safety. A future caller that forgets to supply isWorktreeDirty must not silently
    // reproduce the original wasDirty-unconditionally-false production defect.
    const over = deps().d;
    delete over.isWorktreeDirty;
    const r = await gracefulKillSession({}, 's1', { ...over, runPreparkWip: vi.fn(() => ({ action: 'noop', note: "protected/unresolved branch 'main' — never auto-commit" })) });
    expect(r.outcome).toBe('halted');
  });
});

// TESTING-agent finding (EXEC phase) -- the REAL WIRE for the actual bug this FR fixes: a
// protected-branch worktree that is genuinely dirty, using runPreparkWip and isWorktreeDirty
// exactly as scripts/fleet-kill.mjs's buildKillDeps composes them, against a real git fixture.
describe('FR-3 REAL WIRE: protected branch + genuinely dirty tree, real collaborators end to end', () => {
  let protectedDirtyRepo;

  beforeAll(() => {
    protectedDirtyRepo = mkdtempSync(path.join(tmpdir(), 'gk-wire-'));
    execSync('git init -q -b main', { cwd: protectedDirtyRepo });
    writeFileSync(path.join(protectedDirtyRepo, 'wip.txt'), 'uncommitted');
  });

  afterAll(() => {
    rmSync(protectedDirtyRepo, { recursive: true, force: true });
  });

  it('halts -- fails on the pre-fix noop-always-durable code, passes after', async () => {
    const { d } = deps({
      getSession: vi.fn(async () => ({ pid: 4242, sd_key: 'QF-1', worktree_path: protectedDirtyRepo })),
      isWorktreeDirty,
      runPreparkWip,
    });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.outcome).toBe('halted');
    expect(r.haltedAt).toBe('preserve');
    expect(d.kill).not.toHaveBeenCalled();
  });
});

describe('FR2-RESET: the hand-back is skipped when the release did not happen', () => {
  it('does not hand the item back on an unproven release', async () => {
    const { d } = deps({ releaseClaim: vi.fn(async () => ({ released: false })) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.handback).toBeNull();
    expect(r.outcome).toBe('killed'); // the kill still proceeds; only the hand-back is withheld
  });
});

/**
 * QF-20260728-054 — a kill with NO verifier must fail closed.
 *
 * `gone` used to default to `true` when verifyGone was absent. fleet-kill.mjs then omitted it on
 * the production path, so the SIGKILL escalation was dead code and the verdict returned
 * "terminated and verified absent" having verified nothing. The live half is fixed (fleet-kill now
 * supplies a real Win32 probe) but the DEFAULT was left armed for the next caller.
 *
 * Every existing test in this file supplies verifyGone, which is exactly why none of them could
 * see it — the fixture always closed the hole the code left open.
 */
describe('QF-20260728-054 — absence of a verifier is not evidence of death', () => {
  it('reports REFUSED, not killed, when no verifyGone is supplied', async () => {
    const { d } = deps({ verifyGone: undefined });
    const r = await gracefulKillSession({}, 'sess-1', d);
    // The honest outcome: we killed, we could not observe the result, so we do not claim success.
    expect(r.outcome).toBe('refused');
  });

  it('still escalates to SIGKILL when unverified — the branch is no longer dead', async () => {
    const { calls, d } = deps({ verifyGone: undefined });
    await gracefulKillSession({}, 'sess-1', d);
    expect(calls).toContain('kill:SIGTERM');
    expect(calls, 'the escalation was unreachable while gone defaulted true').toContain('kill:SIGKILL');
  });

  it('a verifier returning a NON-BOOLEAN truthy value does not count as verified', async () => {
    // Guards the looser `await verifyGone(pid)` form: a probe that returns a string or an object
    // (a tri-state result, say) would have been read as success by truthiness.
    const { d } = deps({ verifyGone: vi.fn(async () => 'PROBE_FAILED') });
    const r = await gracefulKillSession({}, 'sess-1', d);
    expect(r.outcome).toBe('refused');
  });

  it('NEGATIVE CONTROL — a real verifier returning true still reports killed', async () => {
    // Without this, "always refuse" would satisfy the three assertions above.
    const { d } = deps({ verifyGone: vi.fn(async () => true) });
    const r = await gracefulKillSession({}, 'sess-1', d);
    expect(r.outcome).toBe('killed');
  });
});
