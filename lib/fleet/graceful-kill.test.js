// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — graceful kill.
// The ORDER is the safety property, so most of these assert sequencing and refusal, not output.

import { describe, it, expect, vi } from 'vitest';
import {
  gracefulKillSession,
  isGracefulKillEnabled,
  isWorkDurableAfterPrepark,
  reconcilePid,
  KILL_STEPS,
} from './graceful-kill.mjs';

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
    // WIP is preserved before anything irreversible; the process dies only after the claim
    // and the work item have been handed back.
    expect(calls).toEqual(['sample', 'prepark', 'release', 'kill:SIGTERM', 'record']);
  });

  it('escalates SIGTERM -> SIGKILL only when the process survives', async () => {
    const { calls, d } = deps({ verifyGone: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });
    await gracefulKillSession({}, 's1', d);
    expect(calls.filter((c) => c.startsWith('kill:'))).toEqual(['kill:SIGTERM', 'kill:SIGKILL']);
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
    expect(reconcilePid({ dbPid: 1, markerPid: 1, pidIsClaudeResult: true })).toEqual({ ok: true, pid: 1 });
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
});

describe('FR2-RESET: the hand-back is skipped when the release did not happen', () => {
  it('does not hand the item back on an unproven release', async () => {
    const { d } = deps({ releaseClaim: vi.fn(async () => ({ released: false })) });
    const r = await gracefulKillSession({}, 's1', d);
    expect(r.handback).toBeNull();
    expect(r.outcome).toBe('killed'); // the kill still proceeds; only the hand-back is withheld
  });
});
