/**
 * SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A — FR-1 (verify-your-own-outcome) and FR-2 (owner-identity
 * guard), at the injected-execFn seam so no real window is touched.
 *
 * WHY THIS FILE IS SHAPED AROUND ONE IDEA. The SD's spine originally offered focusWindow as the
 * safety precedent for hide. It is not one: focusWindow returns TRUE whenever the PowerShell process
 * resolves, because buildFocusCommand never inspects SetForegroundWindow's boolean return. Its only
 * test injects a mock REJECTION, so it proves the process-failure path and never real Win32
 * behaviour. Copying that contract into a destructive verb would mean reporting a successful hide
 * for a window that is still visible. TS-1 below is the direct guard against that, and it is the
 * test most likely to be deleted by someone who thinks it is redundant.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSetVisibilityCommand,
  parseVisibilityResult,
  setWindowVisibility,
  SW_HIDE,
  SW_SHOW,
} from '../../../lib/fleet/window-handle.js';

const OWNER = { pid: 11340, procName: 'WindowsTerminal', startTicks: '638600000000000000' };
const okLine = (vis) => `RESULT|ok||${vis}`;

describe('FR-1: the verb reports what the WORLD says, not that the call returned', () => {
  it('TS-1: a RESOLVING exec with the window still visible is a FAILURE, not a success', async () => {
    // THE ANTI-VACUITY GUARD. This is the exact shape focusWindow gets wrong. The exec resolves
    // cleanly — no throw, no rejection — and the post-call visibility reading says the window is
    // still there. Anything that reports success here has inherited the bug this SD exists to avoid.
    const execFn = async () => okLine('True');
    const r = await setWindowVisibility(4242, { show: false, owner: OWNER, execFn });
    expect(r.ok).toBe(true);            // the invocation itself was well-formed
    expect(r.visibleAfter).toBe(true);  // ...and the world says the window is STILL VISIBLE
    expect(r.achieved).toBe(false);     // so the HIDE did not happen. This is the assertion that matters.
  });

  it('a hide that actually hid reports achieved', async () => {
    const r = await setWindowVisibility(4242, { show: false, owner: OWNER, execFn: async () => okLine('False') });
    expect(r).toMatchObject({ ok: true, visibleAfter: false, achieved: true });
  });

  it('a show that actually showed reports achieved', async () => {
    const r = await setWindowVisibility(4242, { show: true, owner: OWNER, execFn: async () => okLine('True') });
    expect(r).toMatchObject({ ok: true, visibleAfter: true, achieved: true });
  });

  it('a show whose window stayed hidden is NOT achieved — the symmetric case', async () => {
    const r = await setWindowVisibility(4242, { show: true, owner: OWNER, execFn: async () => okLine('False') });
    expect(r.achieved).toBe(false);
  });

  it('an exec that REJECTS refuses rather than reporting an unknown state', async () => {
    const r = await setWindowVisibility(4242, { show: false, owner: OWNER, execFn: async () => { throw new Error('boom'); } });
    expect(r).toMatchObject({ ok: false, refused: true, achieved: false });
  });

  it('unparseable output is never a success', async () => {
    for (const junk of ['', 'nothing here', 'RESULT|weird', okLine('Maybe')]) {
      const r = await setWindowVisibility(4242, { show: false, owner: OWNER, execFn: async () => junk });
      expect(r.achieved).toBe(false);
      expect(r.ok).toBe(false);
    }
  });
});

describe('FR-2: verification and the act are ONE invocation, with three conjuncts', () => {
  const script = (over = {}) => buildSetVisibilityCommand({ handle: 4242, show: false, ownerPid: OWNER.pid, ownerProcName: OWNER.procName, ownerStartTicks: OWNER.startTicks, ...over }).args[3];

  it('ATOMICITY: the owner checks and ShowWindow live in the SAME command string', () => {
    // Splitting these into two execFile calls reopens a TOCTOU window of PowerShell startup plus
    // Add-Type compilation — ~4.9s in this repo — versus microseconds in-process. Atomicity
    // dominates the CONTENT of the check, so this asserts they are inseparable.
    const s = script();
    expect(s).toContain('GetWindowThreadProcessId');
    expect(s).toContain('ShowWindow');
    expect(s).toContain('StartTime.Ticks');
    expect(s).toContain('ProcessName');
  });

  it('all THREE conjuncts are present — pid alone has zero discriminating power here', () => {
    // Measured on this host: 9 visible WindowsTerminal windows share ONE owning pid, while 9 cmd
    // windows had 9 distinct pids. A pid-equality guard therefore passes in exactly the recycled-
    // handle case it exists to catch. Start time is the conjunct that defeats pid recycling.
    const s = script();
    expect(s).toContain(String(OWNER.pid));
    expect(s).toContain(OWNER.procName);
    expect(s).toContain(OWNER.startTicks);
  });

  it('IsWindow is NOT the validity primitive', () => {
    // IsWindow(h) returns TRUE for a recycled handle, so it passes precisely when the guard should
    // refuse — and it is the first thing a builder reaches for. Grep-level is the right instrument
    // for "someone reached for the obvious wrong primitive".
    expect(script()).not.toMatch(/\bIsWindow\s*\(/);
  });

  it('emits SW_HIDE for hide and SW_SHOW for show, never SW_MINIMIZE', () => {
    expect(script({ show: false })).toContain(`ShowWindow($h,${SW_HIDE})`);
    expect(script({ show: true })).toContain(`ShowWindow($h,${SW_SHOW})`);
    expect(SW_HIDE).toBe(0);
    expect(SW_SHOW).toBe(5);
  });

  it('refuses to build a command from unusable owner identity rather than interpolating it', () => {
    // Refuse-by-default at construction: a malformed conjunct must not reach a shell, and must not
    // silently become a weaker check.
    const bad = [
      { ownerPid: null }, { ownerPid: 0 }, { ownerPid: -1 },
      { ownerStartTicks: '' }, { ownerStartTicks: 'not-ticks' },
      { ownerProcName: '' }, { ownerProcName: 'evil; rm -rf /' }, { ownerProcName: "x'; whoami #" },
      { handle: 0 }, { handle: 'abc' },
    ];
    for (const over of bad) expect(() => script(over)).toThrow();
  });
});

describe('FR-2: refusals are named, and never silently succeed', () => {
  it.each([
    ['handle_not_a_window', 'RESULT|refused|handle_not_a_window|'],
    ['owner_pid_mismatch', 'RESULT|refused|owner_pid_mismatch|'],
    ['owner_process_gone', 'RESULT|refused|owner_process_gone|'],
    ['owner_proc_name_mismatch', 'RESULT|refused|owner_proc_name_mismatch|'],
    ['owner_start_time_mismatch', 'RESULT|refused|owner_start_time_mismatch|'],
  ])('refusal %s is surfaced by name and is not achieved', async (reason, line) => {
    const r = await setWindowVisibility(4242, { show: false, owner: OWNER, execFn: async () => line });
    expect(r).toMatchObject({ ok: false, refused: true, reason, achieved: false });
  });

  it('TS-4 (non-vacuous form): a SAME-PID impostor whose start time differs is REFUSED', async () => {
    // The original TS-4 asserted a pid MISMATCH refusal — on this host that is a test that cannot
    // fail for the case it targets, because every fleet window shares one owning pid so pid equality
    // is always true. The discriminating case is same pid, different process start time.
    const r = await setWindowVisibility(4242, {
      show: false,
      owner: { ...OWNER, startTicks: '638699999999999999' },
      execFn: async () => 'RESULT|refused|owner_start_time_mismatch|',
    });
    expect(r.refused).toBe(true);
    expect(r.reason).toBe('owner_start_time_mismatch');
    expect(r.achieved).toBe(false);
  });
});

describe('parseVisibilityResult is pure and total', () => {
  it('picks the RESULT line out of surrounding noise', () => {
    expect(parseVisibilityResult(`warning: something\n${okLine('False')}\ntrailing`)).toMatchObject({ ok: true, visibleAfter: false });
  });
  it('never throws on any input', () => {
    for (const v of [undefined, null, '', 0, 'RESULT|', 'RESULT|ok', {}]) {
      expect(() => parseVisibilityResult(v)).not.toThrow();
    }
  });
});
