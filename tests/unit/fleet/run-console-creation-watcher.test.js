/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 — FR-2 adapter tests: parseEventLine and runWatcher's
 * subprocess-restart supervision, exercised with an injected fake spawnFn. No live subprocess.
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  parseEventLine, runWatcher, buildWmiListenerScript,
  acquireSingletonLock, releaseSingletonLock,
} from '../../../scripts/run-console-creation-watcher.mjs';

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
  it('QF-20260905-766: defaults to the unelevated __InstanceCreationEvent source, scoped to OpenConsole.exe', () => {
    const script = buildWmiListenerScript();
    expect(script).toContain('__InstanceCreationEvent');
    expect(script).toContain("TargetInstance.Name='OpenConsole.exe'");
    expect(script).toContain('$e.SourceEventArgs.NewEvent.TargetInstance.ProcessId');
    expect(script).not.toContain('Win32_ProcessStartTrace');
    expect(script).toContain('Register-WmiEvent');
  });
  it('elevated:true opts back into the Win32_ProcessStartTrace source', () => {
    const script = buildWmiListenerScript({ elevated: true });
    expect(script).toContain("WHERE ProcessName='OpenConsole.exe'");
    expect(script).toContain('Win32_ProcessStartTrace');
    expect(script).toContain('$e.SourceEventArgs.NewEvent.ProcessID');
    expect(script).not.toContain('__InstanceCreationEvent');
  });
});

describe('singleton pid lock (QF-20260905-766)', () => {
  let lockPath;
  afterEach(() => { try { fs.unlinkSync(lockPath); } catch { /* already removed by the test */ } });

  it('acquires the lock when no lock file exists', () => {
    lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ccw-lock-')), 'watcher.pid');
    expect(acquireSingletonLock(lockPath)).toBe(lockPath);
    expect(fs.readFileSync(lockPath, 'utf8').trim()).toBe(String(process.pid));
  });
  it('refuses to acquire when a live pid already holds the lock', () => {
    lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ccw-lock-')), 'watcher.pid');
    fs.writeFileSync(lockPath, String(process.pid)); // this test process is itself alive
    expect(acquireSingletonLock(lockPath)).toBeNull();
  });
  it('acquires the lock when the recorded pid is dead (stale lock from a crashed instance)', () => {
    lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ccw-lock-')), 'watcher.pid');
    fs.writeFileSync(lockPath, '999999999'); // astronomically unlikely to be a live pid
    expect(acquireSingletonLock(lockPath)).toBe(lockPath);
  });
  it('releaseSingletonLock removes the file and is a no-op if already gone', () => {
    lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ccw-lock-')), 'watcher.pid');
    fs.writeFileSync(lockPath, String(process.pid));
    releaseSingletonLock(lockPath);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(() => releaseSingletonLock(lockPath)).not.toThrow();
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

  it('QF-20260905-766: stops (fail loud, not hot) after 3 consecutive fast failures instead of restarting forever', async () => {
    let spawnCount = 0;
    const logs = [];
    const result = await runWatcher({
      spawnFn: () => { spawnCount += 1; const c = fakeChild(); setTimeout(() => c.emit('close', 1), 0); return c; },
      onEvent: async () => {},
      onLog: (m) => logs.push(m),
      shouldContinue: () => true, // would loop forever without the ceiling
      delay: async () => {},
    });
    expect(spawnCount).toBe(3);
    expect(result).toEqual({ stopped: 'consecutive_failures' });
    expect(logs.some((l) => l.includes('consecutive fast failures'))).toBe(true);
  });

  it('a clean exit (code 0) never counts toward the consecutive-failure ceiling', async () => {
    let spawnCount = 0;
    const shouldContinue = () => spawnCount < 5;
    const result = await runWatcher({
      spawnFn: () => { spawnCount += 1; const c = fakeChild(); setTimeout(() => c.emit('close', 0), 0); return c; },
      onEvent: async () => {},
      onLog: () => {},
      shouldContinue,
      delay: async () => {},
    });
    expect(spawnCount).toBe(5);
    expect(result).toEqual({ stopped: 'shouldContinue' });
  });
});
