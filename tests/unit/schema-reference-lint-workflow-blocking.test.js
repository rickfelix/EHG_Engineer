/**
 * QF-20260704-026: pins the schema-reference-lint workflow's flip from advisory
 * (continue-on-error: true) to blocking (continue-on-error: false) now that the
 * 7-day soak (2026-06-10 to 2026-06-17) held clean.
 *
 * The both-directions pass/fail LOGIC itself (a resolvable-base run with genuine
 * new drift exits 1; a clean or degraded run exits 0) is already pinned by
 * tests/unit/schema-lint-exit.test.js's computeExitCode tests -- this test only
 * pins that the GHA job no longer swallows that exit code via continue-on-error.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, '../../.github/workflows/schema-reference-lint.yml');
const SOURCE = fs.readFileSync(WORKFLOW_PATH, 'utf8');

describe('schema-reference-lint.yml is blocking (QF-20260704-026)', () => {
  it('the job sets continue-on-error: false', () => {
    expect(SOURCE).toMatch(/continue-on-error:\s*false/);
  });

  it('no longer contains an advisory continue-on-error: true for this job', () => {
    expect(SOURCE).not.toMatch(/continue-on-error:\s*true/);
  });

  it('documents the flip and the soak-completion rationale in the header', () => {
    expect(SOURCE).toMatch(/QF-20260704-026/);
    expect(SOURCE).toMatch(/soak[\s\S]*held clean/i);
  });

  it('still documents the escape hatches (allowlist + inline pragma) for genuine false positives', () => {
    expect(SOURCE).toMatch(/schema-reference-allowlist\.json/);
    expect(SOURCE).toMatch(/schema-lint-disable-line/);
  });
});
