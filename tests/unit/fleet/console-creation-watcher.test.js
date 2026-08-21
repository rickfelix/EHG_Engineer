/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 — TS-1/TS-2: the injectable decision core
 * (lib/fleet/console-creation-watcher.mjs), exercised with a fake event + a fake lookupFn.
 * No live WMI dependency.
 */
import { describe, it, expect } from 'vitest';
import {
  isConsoleCreationEvent,
  resolveParentage,
  handleProcessCreationEvent,
  printLiveExecutionPrecondition,
} from '../../../lib/fleet/console-creation-watcher.mjs';

describe('isConsoleCreationEvent', () => {
  it('matches OpenConsole.exe case-insensitively', () => {
    expect(isConsoleCreationEvent({ image: 'OpenConsole.exe' })).toBe(true);
    expect(isConsoleCreationEvent({ image: 'openconsole.exe' })).toBe(true);
  });
  it('rejects an unrelated process image', () => {
    expect(isConsoleCreationEvent({ image: 'notepad.exe' })).toBe(false);
    expect(isConsoleCreationEvent({})).toBe(false);
  });
});

describe('resolveParentage', () => {
  it('walks the parent chain via the injected lookupFn to resolve the grandparent', async () => {
    const lookupFn = async (pid) => {
      if (pid === 200) return { pid: 200, parentPid: 100, image: 'cmd.exe' };
      if (pid === 100) return { pid: 100, parentPid: null, image: 'explorer.exe' };
      return null;
    };
    const { ok, record } = await resolveParentage(
      { pid: 999, parentPid: 200, parentImage: 'cmd.exe', parentCommandLine: 'cmd.exe /c foo', observedAt: '2026-08-21T00:00:00.000Z' },
      lookupFn,
    );
    expect(ok).toBe(true);
    expect(record.console_pid).toBe(999);
    expect(record.parent_pid).toBe(200);
    expect(record.parent_image).toBe('cmd.exe');
    expect(record.grandparent_pid).toBe(100);
    expect(record.grandparent_image).toBe('explorer.exe');
  });

  it('is fail-open when lookupFn throws — still returns the record with what it has', async () => {
    const lookupFn = async () => { throw new Error('WMI unavailable'); };
    const { record } = await resolveParentage(
      { pid: 999, parentPid: 200, parentImage: 'cmd.exe', observedAt: '2026-08-21T00:00:00.000Z' },
      lookupFn,
    );
    expect(record.console_pid).toBe(999);
    expect(record.parent_pid).toBe(200);
    expect(record.grandparent_pid).toBeNull();
  });

  it('marks the record unattributed when the parent pid is missing', async () => {
    const { ok, record } = await resolveParentage({ pid: 999, observedAt: '2026-08-21T00:00:00.000Z' }, async () => null);
    expect(ok).toBe(false);
    expect(record.attribution).toBe('unattributed');
  });
});

describe('handleProcessCreationEvent — TS-1/TS-2', () => {
  it('TS-1: a synthetic OpenConsole.exe creation event produces a persisted parentage record', async () => {
    const persisted = [];
    const result = await handleProcessCreationEvent(
      { pid: 42, image: 'OpenConsole.exe', parentPid: 7, parentImage: 'wt.exe', parentCommandLine: 'wt.exe', observedAt: '2026-08-21T00:00:00.000Z' },
      {
        lookupFn: async (pid) => (pid === 7 ? { pid: 7, parentPid: 3, image: 'wt.exe' } : { pid: 3, parentPid: null, image: 'explorer.exe' }),
        persistFn: (records) => { persisted.push(...records); return { written: records.length, skipped: 0, error: null }; },
      },
    );
    expect(result.handled).toBe(true);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].record.console_pid).toBe(42);
    expect(persisted[0].record.parent_pid).toBe(7);
    expect(persisted[0].record.grandparent_pid).toBe(3);
  });

  it('TS-2: a non-OpenConsole.exe creation event is filtered — persistFn is never called', async () => {
    let called = false;
    const result = await handleProcessCreationEvent(
      { pid: 42, image: 'notepad.exe', parentPid: 7 },
      { persistFn: () => { called = true; return { written: 0, skipped: 0, error: null }; } },
    );
    expect(result.handled).toBe(false);
    expect(result.reason).toBe('not-console-creation');
    expect(called).toBe(false);
  });
});

describe('printLiveExecutionPrecondition — TS-5', () => {
  it('reports MECHANISM-READY, NOT live-executed', () => {
    const text = printLiveExecutionPrecondition();
    expect(text).toMatch(/MECHANISM-READY, NOT live-executed/);
    expect(text).toMatch(/console-creation-watcher-drill\.md/);
  });
});
