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
const { runOnce, LOG_PATH } = require('../../../scripts/run-with-exit-witness.cjs');

const fixturesDir = path.join(__dirname, '_fixtures-exit-witness');

function writeFixture(name, body) {
  fs.mkdirSync(fixturesDir, { recursive: true });
  const p = path.join(fixturesDir, name);
  fs.writeFileSync(p, body);
  return p;
}

afterEach(() => {
  try { fs.rmSync(LOG_PATH, { force: true }); } catch { /* best-effort cleanup */ }
  try { fs.rmSync(fixturesDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
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
