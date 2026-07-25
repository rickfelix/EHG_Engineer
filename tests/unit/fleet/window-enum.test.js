/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-4 — top-level window enumeration + set-difference selection.
 *
 * THE FIXTURE BELOW IS REAL CAPTURED STDOUT, not hand-written. Captured 2026-07-25 on the fleet host
 * with ONE read-only enumeration (no spawn, no drill, nothing mutated), by running the exported
 * WINDOW_ENUM_COMMAND verbatim:
 *
 *   node -e "import('./lib/fleet/window-handle.js').then(async m => {
 *     const {promisify} = await import('node:util'); const {execFile} = await import('node:child_process');
 *     const c = m.buildWindowEnumCommand();
 *     console.log((await promisify(execFile)(c.program, c.args)).stdout); })"
 *
 * WHAT THE REAL CAPTURE PROVED, and why each shaped the implementation:
 *   - 11 of 17 visible windows had an EMPTY title. Titles are not reliably present.
 *   - TWO DIFFERENT processes (SystemSettings and ApplicationFrameHost) both presented a window
 *     titled exactly "Settings". Titles are not unique either. Between those two facts, matching on
 *     title is unsound -- which is why selection is a SET DIFFERENCE on handles. The SD's own field
 *     note agrees: both observed session windows were titled simply "Claude Code".
 *   - A process name contains a SPACE ("Wispr Flow"), so parsing must never tokenize on whitespace.
 *   - ZERO WindowsTerminal windows existed at capture time: the fleet on this host is running under
 *     Cursor. That is consistent with the SD's premise that LEO has spawned none of the sessions it
 *     displays. It also means the WindowsTerminal rows in the SYNTHETIC fixtures further down are
 *     labelled as such -- they are constructed, and only the shape is borrowed from the real capture.
 *
 * ENV-INDEPENDENCE: every test here is pure or uses an injected execFn. Nothing shells to PowerShell,
 * so these are identical on the Windows fleet host and on ubuntu CI.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  WINDOW_ENUM_COMMAND,
  TERMINAL_PROCESS_NAME,
  buildWindowEnumCommand,
  parseWindowListOutput,
  selectNewWindowHandle,
  enumerateWindows,
} from '../../../lib/fleet/window-handle.js';

/** VERBATIM real stdout — 17 lines, unedited. */
const REAL_CAPTURE = [
  '18418318|61288|explorer|',
  '264098|57304|Wispr Flow|Status',
  '198798|20604|Cursor|EHG_Engineer - Cursor',
  '197144|61288|explorer|',
  '10230602|61288|explorer|',
  '10361732|23728|TextInputHost|Windows Input Experience',
  '18418244|61288|explorer|',
  '1508424|61288|explorer|',
  '10355186|61288|explorer|',
  '262624|61288|explorer|',
  '197084|61288|explorer|',
  '197070|61288|explorer|',
  '197068|61288|explorer|',
  '198868|41504|Superhuman.WebUI|',
  '788846|15964|SystemSettings|Settings',
  '1050702|27040|ApplicationFrameHost|Settings',
  '331588|61288|explorer|Program Manager',
].join('\r\n');

/** SYNTHETIC (no WindowsTerminal window existed at capture time) — shape copied from the real rows. */
const wt = (handle, title = 'Claude Code') => ({ handle, pid: 5555, proc: 'WindowsTerminal', title });

describe('FR-4 buildWindowEnumCommand — constant, zero injection surface', () => {
  it('interpolates NOTHING and takes no argument', () => {
    // Contrast buildHandleCaptureCommand, which must coerce a pid. This one has no inputs at all,
    // so there is no injection surface to reason about.
    expect(buildWindowEnumCommand.length).toBe(0);
    expect(buildWindowEnumCommand().args[3]).toBe(WINDOW_ENUM_COMMAND);
    expect(buildWindowEnumCommand().args[3]).toBe(buildWindowEnumCommand().args[3]);
    expect(WINDOW_ENUM_COMMAND).not.toMatch(/\$\{/); // no template interpolation survived into the constant
  });

  it('runs non-interactively without loading a profile', () => {
    const { program, args } = buildWindowEnumCommand();
    expect(program).toBe('powershell');
    expect(args).toContain('-NoProfile');
    expect(args).toContain('-NonInteractive');
  });

  it('enumerates TOP-LEVEL windows rather than reading a per-process MainWindowHandle', () => {
    // The distinction is the whole point: MainWindowHandle is per-PROCESS, and many terminal windows
    // share one host process, so it can never name a particular session's window.
    expect(WINDOW_ENUM_COMMAND).toMatch(/EnumWindows/);
    expect(WINDOW_ENUM_COMMAND).not.toMatch(/MainWindowHandle/);
  });
});

describe('FR-4 parseWindowListOutput — against REAL captured stdout', () => {
  it('parses every row of the real capture', () => {
    expect(parseWindowListOutput(REAL_CAPTURE)).toHaveLength(17);
  });

  it('keeps rows with an EMPTY title (11 of 17 in the real capture)', () => {
    const rows = parseWindowListOutput(REAL_CAPTURE);
    expect(rows.filter((r) => r.title === '')).toHaveLength(11);
  });

  it('handles a process name containing a space', () => {
    const rows = parseWindowListOutput(REAL_CAPTURE);
    expect(rows.find((r) => r.handle === 264098)).toEqual({
      handle: 264098, pid: 57304, proc: 'Wispr Flow', title: 'Status',
    });
  });

  it('shows why title matching is unsound: one title, two different processes', () => {
    const settings = parseWindowListOutput(REAL_CAPTURE).filter((r) => r.title === 'Settings');
    expect(settings).toHaveLength(2);
    expect(new Set(settings.map((r) => r.proc)).size).toBe(2);
  });

  it('keeps a "|" that belongs to the TITLE instead of truncating or dropping the row', () => {
    const rows = parseWindowListOutput('123|44|WindowsTerminal|Claude Code | EHG_Engineer');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Claude Code | EHG_Engineer');
  });

  it('DROPS a row with a non-numeric or zero handle rather than emitting NaN', () => {
    // A NaN handle would poison the set difference downstream and could never be matched or excluded.
    const rows = parseWindowListOutput(['abc|1|explorer|x', '0|1|explorer|y', '5|1|explorer|z'].join('\n'));
    expect(rows.map((r) => r.handle)).toEqual([5]);
  });

  it('tolerates junk, blank lines and CRLF without throwing', () => {
    expect(parseWindowListOutput('\r\n\r\n')).toEqual([]);
    expect(parseWindowListOutput(undefined)).toEqual([]);
    expect(parseWindowListOutput('nonsense')).toEqual([]);
  });
});

describe('FR-4 selectNewWindowHandle — set difference, FAILS CLOSED', () => {
  it('returns the one window that appeared', () => {
    const before = [wt(100), wt(200)];
    const after = [wt(100), wt(200), wt(300)];
    const r = selectNewWindowHandle(before, after);
    expect(r.handle).toBe(300);
    expect(r.reason).toBe('ok');
  });

  it('is AFTER MINUS BEFORE, not a symmetric difference — a window CLOSING is not an opening', () => {
    // The regression this pins: a symmetric difference would surface the CLOSED window's handle and
    // bind a session card to a window that no longer exists.
    const before = [wt(100), wt(200)];
    const after = [wt(100)]; // 200 closed between snapshots; nothing opened
    const r = selectNewWindowHandle(before, after);
    expect(r.handle).toBeNull();
    expect(r.reason).toBe('no_new_window');
  });

  it('still resolves when a window closes AND another opens in the same interval', () => {
    const before = [wt(100), wt(200)];
    const after = [wt(100), wt(300)]; // 200 closed, 300 opened
    expect(selectNewWindowHandle(before, after).handle).toBe(300);
  });

  it('fails CLOSED on zero new windows', () => {
    expect(selectNewWindowHandle([wt(1)], [wt(1)])).toMatchObject({ handle: null, reason: 'no_new_window' });
  });

  it('fails CLOSED on two new windows rather than guessing', () => {
    // Guessing would bind this session card to another session's window.
    const r = selectNewWindowHandle([wt(1)], [wt(1), wt(2), wt(3)]);
    expect(r.handle).toBeNull();
    expect(r.reason).toBe('ambiguous');
  });

  it('treats string and number handles as the SAME window (PowerShell output is text)', () => {
    // A mixed-type snapshot must not make an already-present window look new.
    const r = selectNewWindowHandle(['100', 200], [100, '200']);
    expect(r.reason).toBe('no_new_window');
  });

  it('filters to the terminal host so an unrelated app opening a window does not force ambiguous', () => {
    const before = [wt(100)];
    const after = [wt(100), wt(300), { handle: 999, pid: 7, proc: 'Cursor', title: 'EHG_Engineer - Cursor' }];
    expect(selectNewWindowHandle(before, after).handle).toBe(300);
  });

  it('honours processName:null to disable filtering', () => {
    const after = [{ handle: 999, pid: 7, proc: 'Cursor', title: 'x' }];
    expect(selectNewWindowHandle([], after, { processName: null }).handle).toBe(999);
  });

  it('deduplicates a handle repeated within the after snapshot', () => {
    expect(selectNewWindowHandle([], [wt(300), wt(300)]).handle).toBe(300);
  });

  it('returns diagnostics on FAILURE so one live run is a diagnosis, not a re-run', () => {
    // This is the operational point of FR-4: a bare "capture failed" is unactionable. The counts
    // distinguish "nothing opened" from "the filter excluded everything" from "too many opened".
    const r = selectNewWindowHandle([wt(1)], [wt(1), wt(2), wt(3)]);
    expect(r.diagnostics).toMatchObject({
      beforeCount: 1, afterCount: 3, appearedCount: 2, reason: 'ambiguous', processFilter: TERMINAL_PROCESS_NAME,
    });
    expect(r.diagnostics.appeared).toEqual([2, 3]);
  });

  it('bounds the diagnostics payload rather than dumping every handle', () => {
    const after = Array.from({ length: 50 }, (_, i) => wt(1000 + i));
    expect(selectNewWindowHandle([], after).diagnostics.appeared).toHaveLength(8);
  });

  it('degrades to no_new_window on malformed/absent snapshots instead of throwing', () => {
    expect(selectNewWindowHandle(undefined, undefined).reason).toBe('no_new_window');
    expect(selectNewWindowHandle(null, [null, undefined]).reason).toBe('no_new_window');
  });
});

describe('FR-4 enumerateWindows — fail-soft, never shells in unit tests', () => {
  it('parses injected stdout without invoking PowerShell', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: REAL_CAPTURE });
    const rows = await enumerateWindows({ execFn });
    expect(rows).toHaveLength(17);
    expect(execFn.mock.calls[0][0]).toBe('powershell');
  });

  it('returns [] rather than throwing when the shell fails', async () => {
    // An empty snapshot degrades to no_new_window downstream -- fail-closed, never a wrong handle.
    const rows = await enumerateWindows({ execFn: vi.fn().mockRejectedValue(new Error('powershell missing')) });
    expect(rows).toEqual([]);
  });
});
