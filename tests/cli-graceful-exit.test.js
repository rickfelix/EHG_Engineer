/**
 * SD-FDBK-INFRA-SWEEP-CLI-EXIT-001 — shared CLI graceful-teardown primitive.
 *
 * Subprocess-based (offline, no live DB): each scenario runs a tiny child node process so we
 * can observe REAL exit codes and REAL event-loop drain — the things the helper exists to fix.
 * Plus a static pin that create-quick-fix.js's entry point routes through the helper.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HELPER = path.join(ROOT, 'lib', 'cli-graceful-exit.js').replace(/\\/g, '/');

function runChild(script, timeoutMs = 15000) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: timeoutMs, cwd: ROOT,
  });
  return { ...r, elapsedMs: Date.now() - t0 };
}

describe('armCliTeardown — child-process contract', () => {
  it('natural drain: exits 0 well under the backstop with NO process.exit call', () => {
    const r = runChild(`
      const { armCliTeardown } = await import('file://${HELPER}');
      await armCliTeardown(0, { backstopMs: 10000 });
      // no lingering handles -> loop drains; if the backstop were the exit path this would take 10s
    `);
    expect(r.status).toBe(0);
    expect(r.elapsedMs).toBeLessThan(5000); // drained naturally, nowhere near the 10s backstop
  });

  it('error path: exitCode 1 via process.exitCode (no direct exit)', () => {
    const r = runChild(`
      const { armCliTeardown } = await import('file://${HELPER}');
      await armCliTeardown(1, { backstopMs: 10000 });
    `);
    expect(r.status).toBe(1);
    expect(r.elapsedMs).toBeLessThan(5000);
  });

  it('backstop rescue: a stuck loop (ref-d interval) is force-exited at ~backstopMs', () => {
    const r = runChild(`
      const { armCliTeardown } = await import('file://${HELPER}');
      setInterval(() => {}, 1000); // ref'd handle — loop can never drain naturally
      await armCliTeardown(0, { backstopMs: 1500 });
    `);
    expect(r.status).toBe(0);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(1400); // waited for the backstop...
    expect(r.elapsedMs).toBeLessThan(8000);           // ...but did NOT hang to the caller timeout
  });

  it('idempotent: second call is a no-op (single backstop, first exitCode wins)', () => {
    const r = runChild(`
      const { armCliTeardown, _isArmed } = await import('file://${HELPER}');
      await armCliTeardown(0, { backstopMs: 10000 });
      await armCliTeardown(1, { backstopMs: 50 }); // must be ignored — would exit 1 fast if not
      if (!_isArmed()) process.exitCode = 99;
    `);
    expect(r.status).toBe(0); // second call's exitCode/backstop ignored
  });
});

describe('create-quick-fix.js entry-point wiring (static pin)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'create-quick-fix.js'), 'utf8');

  it('imports the shared helper', () => {
    expect(src).toMatch(/import \{ armCliTeardown \} from '\.\.\/lib\/cli-graceful-exit\.js'/);
  });

  it('resolve path routes through armCliTeardown(0); reject path through armCliTeardown(1)', () => {
    expect(src).toMatch(/\.then\(\(\) => armCliTeardown\(0\)\)/);
    expect(src).toMatch(/return armCliTeardown\(1\);/);
  });

  it('entry point has no bare process.exit (teardown owns the exit)', () => {
    const entry = src.slice(src.lastIndexOf('createQuickFix(options)'));
    expect(entry).not.toMatch(/process\.exit\(/);
  });
});
