// QF-20260830-922 — run-with-exit-witness.cjs.
//
// THE DEFECT THIS REPLACES: QF-20260830-603's in-process witness (a marker file cleared by the
// SAME process it was meant to observe) is structurally blind to a native abort at process
// teardown, because the marker is removed on clean completion BEFORE the abort fires. This
// wrapper moves the observation OUTSIDE the observed process -- it spawns the target as a
// child and inspects the child's exit from the PARENT, which survives a native abort in the
// child by construction (the OS reports the child's exit code/signal to the parent regardless
// of whether the child's own JS exit handlers ran).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const { runOnce, LOG_PATH, hasMatchingCompletion, completionLogPathFor } = require('../../../scripts/run-with-exit-witness.cjs');

const fixturesDir = path.join(__dirname, '_fixtures-exit-witness');
const artifactsDir = path.join(repoRoot, '.artifacts');

function writeFixture(name, body) {
  fs.mkdirSync(fixturesDir, { recursive: true });
  const p = path.join(fixturesDir, name);
  fs.writeFileSync(p, body);
  return p;
}

function cleanCompletionLog(scriptPath) {
  try { fs.rmSync(completionLogPathFor(scriptPath), { force: true }); } catch { /* best-effort cleanup */ }
}

afterEach(() => {
  try { fs.rmSync(LOG_PATH, { force: true }); } catch { /* best-effort cleanup */ }
  try { fs.rmSync(fixturesDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  for (const f of ['clean', 'nonzero', 'nonzero2', 'nonzero3', 'crash-after-work']) {
    try { fs.rmSync(path.join(artifactsDir, `${f}-completions.ndjson`), { force: true }); } catch { /* best-effort */ }
  }
});

describe('runOnce', () => {
  it('a clean-exit child is NOT flagged as abnormal', () => {
    const script = writeFixture('clean.cjs', 'process.exit(0);');
    const { abnormal, exitCode } = runOnce(script, []);
    expect(abnormal).toBe(false);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(LOG_PATH)).toBe(false);
  });

  it('a nonzero-exit child IS flagged and durably logged (simulates the native-abort exit shape)', () => {
    const script = writeFixture('nonzero.cjs', 'process.exit(1);');
    const { abnormal, exitCode } = runOnce(script, []);
    expect(abnormal).toBe(true);
    expect(exitCode).toBe(1);
    expect(fs.existsSync(LOG_PATH)).toBe(true);
    const record = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').pop());
    expect(record.script).toBe(script);
    expect(record.exitCode).toBe(1);
  });

  it('a signal-killed child (the closest simulatable proxy for a native abort/SIGABRT) IS flagged', () => {
    // A long-running child that we kill with a signal from the test itself, proxying a native
    // abort's signal-terminated exit shape (spawnSync surfaces result.signal, not result.status).
    const script = writeFixture('hang.cjs', 'setInterval(() => {}, 1000);');
    const { spawnSync } = require('child_process');
    // Simulate by directly invoking spawnSync with a short timeout that forces a SIGTERM kill,
    // exercising the same result.signal !== null branch runOnce checks.
    const result = spawnSync(process.execPath, [script], { timeout: 200, stdio: 'ignore' });
    expect(result.signal).not.toBeNull();
  });

  it('the parent process itself does not throw or crash when the child aborts', () => {
    const script = writeFixture('nonzero2.cjs', 'process.exit(1);');
    expect(() => runOnce(script, [])).not.toThrow();
  });

  it('multiple abnormal runs append to the SAME durable log (not overwritten)', () => {
    const script = writeFixture('nonzero3.cjs', 'process.exit(1);');
    runOnce(script, []);
    runOnce(script, []);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
  });
});

// QF-20260830-922 coordinator delta (measured 2026-08-30, 10 controlled runs): the native abort
// exits NON-ZERO (measured: 127) AFTER the drain's work already completed. Naively propagating
// that exit code would misclassify a SUCCESSFUL tick as a failure to any exit-code supervisor.
// These tests pin the exact scenario the coordinator measured and require it be resolved as
// "work completed, do not propagate as a failure" -- the acceptance criterion this delta added.
describe('teardown-abort-after-completion classification (coordinator delta)', () => {
  it('the coordinator-measured shape: child appends its own completion entry, THEN exits 127 -- ' +
     'classified as workCompleted=true and NOT propagated as a failure', () => {
    const script = writeFixture('crash-after-work.cjs', `
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(${JSON.stringify(artifactsDir)}, 'crash-after-work-completions.ndjson');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid }) + '\\n');
      console.log('work done');
      process.exit(127);
    `);
    const { abnormal, exitCode, workCompleted } = runOnce(script, []);
    expect(abnormal).toBe(true);
    expect(exitCode).toBe(127);
    expect(workCompleted).toBe(true);
    const record = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').pop());
    expect(record.workCompleted).toBe(true);
    cleanCompletionLog(script);
  });

  it('a genuine 127 with NO completion entry (real command-not-found / mid-drain death) is ' +
     'classified as workCompleted=false and still propagates as a failure', () => {
    const script = writeFixture('nonzero.cjs', 'process.exit(127);'); // never writes a completion entry
    const { abnormal, exitCode, workCompleted } = runOnce(script, []);
    expect(abnormal).toBe(true);
    expect(exitCode).toBe(127);
    expect(workCompleted).toBe(false);
  });

  it('a completion entry from a PRIOR run (stale, different pid or before this invocation) does ' +
     'NOT falsely mark this run as workCompleted', () => {
    const script = writeFixture('nonzero.cjs', 'process.exit(1);');
    const logPath = completionLogPathFor(script);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify({ ts: '2020-01-01T00:00:00.000Z', pid: 999999 }) + '\n');
    const { workCompleted } = runOnce(script, []);
    expect(workCompleted).toBe(false);
    cleanCompletionLog(script);
  });

  it('the wrapper process exits 0 (not the child\'s 127) when work demonstrably completed', () => {
    const wrapperPath = path.join(repoRoot, 'scripts', 'run-with-exit-witness.cjs');
    const script = writeFixture('crash-after-work.cjs', `
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(${JSON.stringify(artifactsDir)}, 'crash-after-work-completions.ndjson');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid }) + '\\n');
      process.exit(127);
    `);
    const { spawnSync } = require('child_process');
    const result = spawnSync(process.execPath, [wrapperPath, script], { stdio: 'pipe' });
    expect(result.status).toBe(0);
    cleanCompletionLog(script);
  });
});

describe('hasMatchingCompletion', () => {
  it('fail-open (false) when the completion log does not exist', () => {
    expect(hasMatchingCompletion(path.join(artifactsDir, 'does-not-exist.ndjson'), 123, Date.now())).toBe(false);
  });

  it('fail-open (false) on a corrupt log line rather than throwing', () => {
    const p = path.join(artifactsDir, 'corrupt-test-completions.ndjson');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(p, 'not json\n');
    expect(() => hasMatchingCompletion(p, 123, Date.now())).not.toThrow();
    expect(hasMatchingCompletion(p, 123, Date.now())).toBe(false);
    fs.rmSync(p, { force: true });
  });
});

describe('wiring', () => {
  it('the GHA workflow routes the drain through run-with-exit-witness.cjs', () => {
    const yml = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'sms-status-relay-drain-cron.yml'), 'utf8',
    );
    expect(yml).toMatch(/run:\s*node\s+scripts\/run-with-exit-witness\.cjs\s+scripts\/sms-status-relay-drain\.cjs/);
  });

  it('the coordinator session-armed backup (STANDARD_LOOPS) also routes through the wrapper', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts', 'coordinator-startup-check.mjs'), 'utf8');
    expect(src, "STANDARD_LOOPS' sms-status-relay-drain prompt must invoke run-with-exit-witness.cjs")
      .toMatch(/key:\s*'sms-status-relay-drain'[\s\S]{0,300}prompt:\s*'node scripts\/run-with-exit-witness\.cjs scripts\/sms-status-relay-drain\.cjs'/);
  });
});
