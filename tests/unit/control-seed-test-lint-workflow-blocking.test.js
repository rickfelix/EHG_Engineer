/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-001: pins control-seed-test-lint.yml's flip from advisory
 * (continue-on-error: true) to blocking (continue-on-error: false) now that the soak (2026-07-31
 * to 2026-08-15, 15 days) held clean at the phenomenon level.
 *
 * Parses the YAML rather than regex-matching raw text: a regex-only assertion is wrong on a file
 * whose header legitimately mentions the string "continue-on-error: true" in prose (e.g. the
 * rollback/escape-hatch instructions), and a naive positive regex can match true even on an
 * unflipped file with a decoy comment. Modeled on tests/unit/schema-reference-lint-workflow-blocking.test.js
 * and the parsed-job pattern in tests/unit/crossrepo-drift-guards.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, '../../.github/workflows/control-seed-test-lint.yml');
const SOURCE = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const DOC = yaml.load(SOURCE);
const JOB = DOC.jobs['control-seed-test-lint'];

describe('control-seed-test-lint.yml is blocking (SD-LEARN-FIX-ADDRESS-PAT-LES-001)', () => {
  it('the job sets continue-on-error: false', () => {
    expect(JOB['continue-on-error']).toBe(false);
  });

  it('the job does not set continue-on-error: true', () => {
    expect(JOB['continue-on-error']).not.toBe(true);
  });

  it('documents the flip and the soak-completion rationale in the header', () => {
    expect(SOURCE).toMatch(/SD-LEARN-FIX-ADDRESS-PAT-LES-001/);
    expect(SOURCE).toMatch(/soak[\s\S]*held clean/i);
  });

  it('does not still narrate itself as an open, still-pending advisory soak', () => {
    expect(SOURCE).not.toMatch(/FLIP CRITERION/i);
    expect(SOURCE).not.toMatch(/zero\s+false[- ]positive/i);
  });

  it('names the one false positive found during the soak and its fix, not a bare "clean" claim', () => {
    expect(SOURCE).toMatch(/HARNESS_ERROR/);
    expect(SOURCE).toMatch(/eb48a344bf4/);
  });

  it('still preserves the SECURITY tripwire block (out of scope for this flip)', () => {
    expect(SOURCE).toMatch(/--ignore-scripts/);
    expect(SOURCE).toMatch(/SAFETY BY COINCIDENCE/);
  });
});
