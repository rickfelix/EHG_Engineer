/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 — FR-2 adapter tests: parseEventLine and runWatcher's
 * subprocess-restart supervision, exercised with an injected fake spawnFn. No live subprocess.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import { parseEventLine, runWatcher, buildWmiListenerScript } from '../../../scripts/run-console-creation-watcher.mjs';

describe('parseEventLine', () => {
  it('parses a valid JSON event line', () => {
    const event = parseEventLine('{"pid": 42, "image": "OpenConsole.exe", "parentPid": 7}');
    expect(event).toEqual({ pid: 42, image: 'OpenConsole.exe', parentPid: 7 });
  });
  it('returns null for a blank line', () => {
    expect(parseEventLine('')).toBeNull();
    expect(parseEventLine('   ')).toBeNull();
  });
  it('returns null for malformed JSON', () => {
    expect(parseEventLine('not json')).toBeNull();
  });
  it('returns null when pid is not numeric', () => {
    expect(parseEventLine('{"pid": "not-a-number"}')).toBeNull();
  });
});

describe('buildWmiListenerScript', () => {
  it('scopes the WQL query to OpenConsole.exe', () => {
    const script = buildWmiListenerScript();
    expect(script).toContain("WHERE ProcessName='OpenConsole.exe'");
    expect(script).toContain('Register-WmiEvent');
  });
});

/** A fake ChildProcess: an EventEmitter with stdout/stderr sub-emitters. */
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('runWatcher — subprocess supervision', () => {
  it('handles each parsed event line via onEvent', async () => {
    const child = fakeChild();
    const events = [];
    let calls = 0;
    const shouldContinue = () => calls === 0; // run exactly one subprocess lifecycle

    const runPromise = runWatcher({
      spawnFn: () => { calls += 1; return child; },
      onEvent: async (event) => { events.push(event); },
      onLog: () => {},
      shouldContinue,
      delay: async () => {},
    });

    child.stdout.emit('data', Buffer.from('{"pid": 42, "image": "OpenConsole.exe"}\n'));
    child.emit('close', 0);
    await runPromise;

    expect(events).toEqual([{ pid: 42, image: 'OpenConsole.exe' }]);
  });

  it('restarts the subprocess after it exits, up to shouldContinue()', async () => {
    let spawnCount = 0;
    const children = [];
    const shouldContinue = () => spawnCount < 2;

    await runWatcher({
      spawnFn: () => { spawnCount += 1; const c = fakeChild(); children.push(c); setTimeout(() => c.emit('close', 1), 0); return c; },
      onEvent: async () => {},
      onLog: () => {},
      shouldContinue,
      delay: async () => {},
    });

    expect(spawnCount).toBe(2);
  });

  it('treats a spawn error as a restart signal, not a crash', async () => {
    let spawnCount = 0;
    const shouldContinue = () => spawnCount < 1;
    const logs = [];

    await runWatcher({
      spawnFn: () => { spawnCount += 1; const c = fakeChild(); setTimeout(() => c.emit('error', new Error('ENOENT')), 0); return c; },
      onEvent: async () => {},
      onLog: (m) => logs.push(m),
      shouldContinue,
      delay: async () => {},
    });

    expect(spawnCount).toBe(1);
    expect(logs.some((l) => l.includes('spawn error'))).toBe(true);
  });
});
