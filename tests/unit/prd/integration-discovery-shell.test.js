/**
 * STEP 0 integration discovery must not ride a shell, and must not fail silently.
 * QF-20260808-528.
 *
 * THE DEFECT. Every scanner built `git grep -l -E '<pattern>' -- <paths>` as a SHELL STRING.
 * On Windows execSync runs cmd.exe, which reads the `|` between alternation patterns as a
 * PIPE — it split the command and tried to execute `router\.post\(` as a program (exit 255).
 * Each caller wrapped that in a bare `catch {}`, so the scan returned EMPTY and STEP 0
 * reported a successful discovery over a scan that had examined nothing. Measured on win32
 * against the unmodified file: 0/0/0 results; after the argv fix: 6/32/151.
 *
 * WHY THERE ARE THREE DIFFERENT ARMS. The shell-vs-argv difference is platform-dependent —
 * the old code WORKED under POSIX sh, so a Windows-only assertion would be green on CI
 * (100% ubuntu) and prove nothing there. So this file carries one arm per failure mode:
 *   1. LOUDNESS  — cross-platform. The bare `catch {}` logged nothing; a real failure now
 *                  must reach stderr. Red on every platform before the fix.
 *   2. NO-SHELL  — fires on POSIX. A caller-supplied filename carrying $(...) would be
 *                  command-substituted by sh inside the old double-quoted string.
 *   3. RESULTS   — fires on Windows. The alternation pattern must actually return matches.
 * The assertions themselves are true on both platforms, so none of them are OS-gated; they
 * simply have different discriminating power per platform, which is stated rather than hidden.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  scanRouterRegistrations,
  scanRegistryPatterns,
  scanValidationSchemas,
  scanConsumers
} from '../../../scripts/prd/integration-discovery.js';

const REPO_ROOT = process.cwd();

describe('QF-20260808-528: STEP 0 discovery uses argv, not a shell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('LOUD: a genuine failure reaches stderr instead of being swallowed', () => {
    // THE cross-platform arm. Pre-fix this was `catch {}` — zero output, empty result, and a
    // caller that could not tell "nothing to find" from "the scan never ran".
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    spy.mockClear(); // restoreAllMocks alone left the spy installed, so a prior test's call leaked in
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'qf528-norepo-'));
    try {
      const result = scanRouterRegistrations(notARepo);
      expect(result, 'a failed scan must still return a usable empty array').toEqual([]);
      expect(spy, 'the failure was swallowed — silent empty scan is the defect').toHaveBeenCalled();
      expect(String(spy.mock.calls[0][0])).toMatch(/scanRouterRegistrations failed/);
    } finally {
      try { fs.rmSync(notARepo, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it('NO-SHELL: a caller-supplied filename carrying $(...) is never executed', () => {
    // scanConsumers interpolates path.basename(targetFile) into the pattern, and the old form
    // put that inside DOUBLE quotes — where sh performs command substitution. Fires on POSIX.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf528-inject-'));
    const marker = path.join(dir, 'pwned.txt').replace(/\\/g, '/');
    try {
      scanConsumers(REPO_ROOT, [`evil$(touch ${marker}).js`]);
      expect(
        fs.existsSync(marker),
        'command substitution executed — the pattern still reaches a shell'
      ).toBe(false);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it('RESULTS: alternation patterns actually match (0 here means the scan never ran)', () => {
    // Fires on Windows, where cmd.exe used to split the pattern on its `|`. Uses this repo as
    // the fixture: it demonstrably contains registry and validation-schema patterns.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    spy.mockClear(); // restoreAllMocks alone left the spy installed, so a prior test's call leaked in
    const registry = scanRegistryPatterns(REPO_ROOT);
    const schemas = scanValidationSchemas(REPO_ROOT);

    expect(spy, 'a scan of this repo should not be erroring at all').not.toHaveBeenCalled();
    expect(registry.length, 'registry scan returned nothing — shell breakage or a dead scan').toBeGreaterThan(0);
    expect(schemas.length, 'schema scan returned nothing — shell breakage or a dead scan').toBeGreaterThan(0);
  });

  it('NO MATCHES is not an error: git grep exit 1 returns empty and stays quiet', () => {
    // Two-sided against the loudness arm. git grep exits 1 both for "no matches" AND for a
    // pathspec that matches nothing (measured: exit 1, EMPTY stderr — indistinguishable). If
    // exit 1 were treated as a failure, every ordinary empty scan would scream.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    spy.mockClear(); // restoreAllMocks alone left the spy installed, so a prior test's call leaked in
    const result = scanConsumers(REPO_ROOT, ['no_such_file_qf528_zzz.js']);

    expect(result).toEqual([]);
    expect(spy, 'an ordinary empty result was reported as a failure').not.toHaveBeenCalled();
  });
});
