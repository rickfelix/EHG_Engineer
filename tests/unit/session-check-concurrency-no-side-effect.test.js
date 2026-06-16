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

  // QUARANTINED (SD-LEO-INFRA-UNIT-TIER-SOURCEPIN-REBASELINE-001, FR-3): this CLI-sanity check spawns
  // a REAL child that does LIVE DB I/O (session-check-concurrency.js self-loads .env and queries
  // claude_sessions; creds cannot be stripped from the test side). In isolation it exits in ~1s, but
  // under full-suite parallelism (~1500 files / 16 workers all touching the DB) the child's query
  // starves past the spawn timeout → SIGTERM → status=null with no banner printed, so it is
  // chronically red on main. It is NOT a source regression: the entrypoint-guard mechanism is fully
  // covered by the HERMETIC static-import test above (the actual QF-20260509-358 regression pin).
  // A non-hermetic live-DB subprocess check belongs in an integration tier, not the unit tier.
  // Rehoming tracked via /signal harness-bug. Skipped (not deleted) to preserve intent + history.
  it.skip('still runs main() when invoked as a CLI (sanity) — NON-HERMETIC, rehome to integration tier', () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 15_000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });
    // 0 = isolated, 1 = concurrent, 2 = could-not-determine — all valid; OR an observed main() banner.
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const mainRan = /\[ISOLATED\]|\[CONCURRENT SESSIONS DETECTED\]/.test(output);
    expect(mainRan || [0, 1, 2].includes(result.status)).toBe(true);
  }, 20_000);
});
