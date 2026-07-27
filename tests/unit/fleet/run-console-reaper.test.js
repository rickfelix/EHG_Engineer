// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — the reaper runner.

import { describe, it, expect, vi } from 'vitest';
import {
  runReaperOnce,
  parseProcessCsv,
  descendantCountOf,
  findConsoles,
  parentageFor,
  isConsoleReaperEnabled,
} from '../../../scripts/run-console-reaper.mjs';

const ON = { FLEET_CONSOLE_REAPER_ENABLED: 'on' };

// pid 100 = empty console; pid 200 = occupied console (child 201).
const PROCS = [
  { pid: 10, ppid: 1, name: 'Cursor.exe', cmd: 'cursor' },
  { pid: 20, ppid: 10, name: 'powershell.exe', cmd: 'powershell -c ...' },
  { pid: 100, ppid: 20, name: 'OpenConsole.exe', cmd: 'openconsole' },
  { pid: 200, ppid: 20, name: 'OpenConsole.exe', cmd: 'openconsole' },
  { pid: 201, ppid: 200, name: 'claude.exe', cmd: 'claude' },
];
const okSnap = async () => ({ ok: true, processes: PROCS, error: null });

describe('FR5-RUN: the flag is opt-in', () => {
  it('does nothing unless FLEET_CONSOLE_REAPER_ENABLED is exactly "on"', async () => {
    expect(isConsoleReaperEnabled({})).toBe(false);
    expect(isConsoleReaperEnabled({ FLEET_CONSOLE_REAPER_ENABLED: 'true' })).toBe(false);
    const r = await runReaperOnce({ env: {}, snapshot: okSnap, kill: vi.fn() });
    expect(r.ran).toBe(false);
  });
});

describe('FR5-RUN: FAIL-CLOSED — "could not look" never becomes "nothing to see"', () => {
  it('a failed snapshot reaps NOTHING', async () => {
    // This is the FR-5a defect in runner form: degrading to "zero consoles" would let the
    // reaper reason about a process table it never observed.
    const kill = vi.fn();
    const r = await runReaperOnce({
      env: ON,
      snapshot: async () => ({ ok: false, processes: null, error: { code: 'GUARD_UNAVAILABLE', timedOut: true, message: 'timeout' } }),
      kill,
    });
    expect(r.ran).toBe(false);
    expect(r.reason).toBe('GUARD_UNAVAILABLE');
    expect(kill).not.toHaveBeenCalled();
  });

  it('refuses the kill when the PRE-KILL re-check cannot observe', async () => {
    const kill = vi.fn();
    let n = 0;
    const snapshot = async () => (n++ === 0
      ? { ok: true, processes: PROCS, error: null }
      : { ok: false, processes: null, error: { code: 'GUARD_UNAVAILABLE', timedOut: false, message: 'wmi down' } });
    const r = await runReaperOnce({ env: ON, snapshot, kill });
    expect(kill).not.toHaveBeenCalled();
    expect(r.spared[0].why).toMatch(/not actually observed/);
  });
});

describe('FR5-RUN: only zero-descendant consoles, re-checked immediately before the kill', () => {
  it('kills the empty console and spares the occupied one', async () => {
    const kill = vi.fn(async () => {});
    const r = await runReaperOnce({ env: ON, snapshot: okSnap, kill });
    expect(r.killed).toEqual([100]);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(100);
  });

  it('spares a console that GAINED a child between the scan and the kill', async () => {
    const kill = vi.fn(async () => {});
    let n = 0;
    const snapshot = async () => {
      n += 1;
      if (n === 1) return { ok: true, processes: PROCS, error: null };
      return { ok: true, processes: [...PROCS, { pid: 101, ppid: 100, name: 'claude.exe', cmd: 'c' }], error: null };
    };
    const r = await runReaperOnce({ env: ON, snapshot, kill });
    expect(kill).not.toHaveBeenCalled();
    expect(r.killed).toEqual([]);
  });

  it('--dry-run reports candidates and kills nothing', async () => {
    const kill = vi.fn();
    const r = await runReaperOnce({ env: ON, snapshot: okSnap, kill, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.candidates).toBe(1);
    expect(kill).not.toHaveBeenCalled();
  });
});

describe('FR5-RUN: parentage is captured for EVERY console, not only the reaped ones', () => {
  it('attributes both consoles, including the occupied one', async () => {
    const r = await runReaperOnce({ env: ON, snapshot: okSnap, kill: vi.fn(async () => {}) });
    expect(r.parentage).toHaveLength(2);
    expect(r.parentage.every((p) => p.ok)).toBe(true);
  });

  it('names the GRANDPARENT, which is what identifies the culprit', () => {
    // The immediate parent is powershell; Cursor.exe is the informative one.
    const rec = parentageFor(PROCS[2], PROCS, '2026-07-27T00:00:00Z');
    expect(rec.record.parent_image).toBe('powershell.exe');
    expect(rec.record.grandparent_image).toBe('Cursor.exe');
    expect(rec.record.attribution).toBe('powershell.exe (via Cursor.exe)');
  });
});

describe('FR5-RUN: CSV parsing', () => {
  it('parses quoted command lines containing commas', () => {
    const csv = '"ProcessId","ParentProcessId","Name","CommandLine"\n"12","3","a.exe","x.exe -a 1,2 -b ""q"""';
    const rows = parseProcessCsv(csv);
    expect(rows).toEqual([{ pid: 12, ppid: 3, name: 'a.exe', cmd: 'x.exe -a 1,2 -b "q"' }]);
  });

  it('a header-only result is zero processes, not a crash', () => {
    expect(parseProcessCsv('"ProcessId","ParentProcessId","Name","CommandLine"')).toEqual([]);
    expect(parseProcessCsv('')).toEqual([]);
  });

  it('counts direct children and finds consoles case-insensitively', () => {
    expect(descendantCountOf(200, PROCS)).toBe(1);
    expect(descendantCountOf(100, PROCS)).toBe(0);
    expect(findConsoles(PROCS).map((c) => c.pid)).toEqual([100, 200]);
  });
});
