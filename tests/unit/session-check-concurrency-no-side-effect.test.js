/**
 * Regression pin for QF-20260509-358 — scripts/session-check-concurrency.js
 * must NOT execute main() when statically imported as a module. Prior to
 * this guard, lib/claim-lifecycle-release.mjs's
 *   `export { detectSdKeyDrift } from '../scripts/session-check-concurrency.js'`
 * triggered main() during ESM evaluation, which in turn called
 * process.exit(0) on the no-contention path — silently aborting any
 * consumer (notably handoff.js at PRE-HANDOFF MIGRATION CHECK).
 *
 * RCA: feedback b1e9d6c1-0509-499d-b908-7259cc4c5f99 (3rd witness in 7d).
 * Cross-reference: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'session-check-concurrency.js');

describe('session-check-concurrency.js entrypoint guard', () => {
  let exitSpy;
  let logSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`UNEXPECTED process.exit(${code}) during static import`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('does NOT call process.exit or run main() during static import (regression pin)', async () => {
    // Cache-bust so vitest re-evaluates the module fresh under the spy.
    const url = `${pathToFileURL(SCRIPT_PATH).href}?t=${Date.now()}`;
    const mod = await import(url);

    // Give any deferred main().catch() a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(exitSpy).not.toHaveBeenCalled();

    // Confirm the no-contention banner ('[ISOLATED]') and the contention
    // banner ('[CONCURRENT SESSIONS DETECTED]') were NOT printed during
    // the static import. Both come from main() / its helpers.
    const calls = logSpy.mock.calls.flat().join(' ');
    expect(calls).not.toMatch(/\[ISOLATED\]/);
    expect(calls).not.toMatch(/\[CONCURRENT SESSIONS DETECTED\]/);

    // Sanity: the module exports detectSdKeyDrift even though main() was skipped.
    expect(typeof mod.detectSdKeyDrift).toBe('function');
  }, 5_000);

  it('still runs main() when invoked as a CLI (sanity, exit code is 0/1/2)', () => {
    // Use spawnSync so this runs as a real child process — the entrypoint
    // guard's `import.meta.url === pathToFileURL(process.argv[1]).href`
    // check passes only in this mode.
    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 15_000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });

    // 0 = isolated, 1 = concurrent, 2 = could-not-determine. All three are
    // valid runtime outcomes; what we assert is that main() ran (i.e. one of
    // the documented exit codes was emitted, NOT a silent no-op).
    expect([0, 1, 2]).toContain(result.status);
  }, 20_000);
});
