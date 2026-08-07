/**
 * SD-PAT-FIX-STUBBED-WRITER-BLINDNESS-001 (FR-3 / TS-7) — driver contract.
 *
 * Asserts BOTH halves, because either alone is uninformative:
 *   - exit code 0 (warn-only this increment, so it can never fail a merge), and
 *   - findings > 0 on a full sweep.
 * The second is the load-bearing one. A driver that is mis-wired — wrong glob, rule not registered,
 * plugin id mismatch — also exits 0 with zero findings, which reads as "the repo is clean". Against a
 * repo measured at 334/3082 files mocking a local module, a suspiciously clean sweep is evidence of a
 * broken driver, not a healthy codebase. Asserting only the exit code would be exactly the
 * cannot-fail shape this SD exists to eliminate.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DRIVER = path.join(REPO_ROOT, 'scripts', 'lint', 'no-mocked-sut-import-lint.mjs');

function runDriver(args) {
  const stdout = execFileSync(process.execPath, [DRIVER, ...args], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout.slice(stdout.indexOf('{')));
}

describe('no-mocked-sut-import driver (FR-3)', () => {
  it('a full sweep exits 0 AND reports a non-zero baseline — both halves matter', () => {
    // execFileSync throws on a non-zero exit, so reaching the assertions IS the exit-0 proof.
    const result = runDriver(['--all', '--json']);

    expect(result.mode).toBe('all');
    expect(result.scanned).toBeGreaterThan(1000); // the sweep actually walked the tests tree
    expect(result.violations.length).toBeGreaterThan(0); // the rule is wired and capable of firing
    expect(result.blocking).toBe(false); // warn-only this increment
    expect(result.promoted).toBe(false); // promotion flag defaults OFF
  });

  it('the known-positive fixture appears in the sweep', () => {
    // Ties the repo-wide run back to the specific file the PRD names, so a driver that scans the
    // wrong tree cannot pass merely by finding *something* somewhere.
    const result = runDriver(['--all', '--json']);
    const hit = result.violations.find((v) => v.filePath === 'tests/unit/value-authenticity/panel-assembly.test.js');
    expect(hit, 'the PRD-named known-positive must be among the sweep findings').toBeTruthy();
  });

  it('the canonical witness does NOT appear — the documented DI blind spot, asserted at driver level too', () => {
    const result = runDriver(['--all', '--json']);
    const hit = result.violations.find((v) => v.filePath === 'tests/unit/coordinator/reconcile-late-verdicts.test.js');
    expect(hit, 'reconcile-late-verdicts stubs by dependency injection; this rule is blind to it by design').toBeFalsy();
  });
});
