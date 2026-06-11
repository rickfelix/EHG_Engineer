// SD-FDBK-INFRA-REGENERATE-LIB-PROVING-001 / FR-2: regression test that
// `node scripts/generate-stage-config.cjs --check` returns exit code 0.
//
// Background: the prior file-vs-DB drift gate failed because stage-config.js
// drifted from the SSOT (venture-workflow.ts + lifecycle_stage_config DB).
// This SD ships the regen; this test prevents future drift from going
// unnoticed in CI.
//
// Subprocess invocation (NOT in-process re-import) keeps the regression test
// tightly coupled to the actual binary behavior — matches how CI runs --check.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-stage-config.cjs');

describe('stage-config.js: --check passes on origin/main (SD-FDBK-INFRA-REGENERATE-LIB-PROVING-001)', () => {
  it('exits with code 0 (no drift between generated file and SSOT)', () => {
    // `execSync` throws on non-zero exit; success path is "no throw".
    // Inherit stdio for the parent to see the script's own output on failure;
    // pipe stdout so the test runner doesn't show CHECK PASSED for clean runs.
    let result;
    try {
      result = execSync(`node "${SCRIPT}" --check`, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 60000,
      });
    } catch (err) {
      throw new Error(
        `generate-stage-config.cjs --check failed with exit code ${err.status}.\n` +
        `stdout: ${err.stdout || '(empty)'}\n` +
        `stderr: ${err.stderr || '(empty)'}\n` +
        `Run: node scripts/generate-stage-config.cjs --write`
      );
    }
    expect(result).not.toMatch(/CHECK FAILED/);
  }, 90000);
});
