/**
 * SD-MAN-INFRA-FLIP-SHELL-INJECTION-001 (FR-5/FR-6, TS-8): pins the shell-injection-argv-lint
 * workflow's flip from advisory (continue-on-error: true, soak 2026-08-10 → 2026-10-09) to
 * BLOCKING, now that B-3 landed: violationKey identity + merge-base baseline partition in
 * scripts/lint/shell-injection-argv-lint.mjs, so only NEW sites fail and the backlog never
 * becomes the toucher's problem.
 *
 * The partition/exit LOGIC is pinned by tests/unit/lint/shell-injection-argv-lint.test.js
 * (TS-2..TS-6). This file pins only that the GHA step no longer swallows the exit code, that
 * the flip is EXPLICIT (a grep-pinnable `false`, mirroring schema-reference-lint.yml), and that
 * the header still documents the escape hatches. Modeled on
 * tests/unit/schema-reference-lint-workflow-blocking.test.js (QF-20260704-026).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, '../../.github/workflows/shell-injection-argv-lint.yml');
const SOURCE = fs.readFileSync(WORKFLOW_PATH, 'utf8');

describe('shell-injection-argv-lint.yml is blocking (SD-MAN-INFRA-FLIP-SHELL-INJECTION-001)', () => {
  it('the lint step sets continue-on-error: false explicitly', () => {
    expect(SOURCE).toMatch(/continue-on-error:\s*false/);
  });

  it('no longer contains an advisory continue-on-error: true', () => {
    expect(SOURCE).not.toMatch(/continue-on-error:\s*true/);
  });

  it('documents the flip, the B-3 mechanism and the SD in the header; the dated soak note is gone', () => {
    expect(SOURCE).toMatch(/SD-MAN-INFRA-FLIP-SHELL-INJECTION-001/);
    expect(SOURCE).toMatch(/B-3/);
    expect(SOURCE).toMatch(/merge[- ]base/i);
    expect(SOURCE).not.toContain('2026-09-09');
  });

  it('still documents the escape hatches (inline pragma + reasoned allowlist entry)', () => {
    expect(SOURCE).toMatch(/shell-injection-argv-disable-line/);
    expect(SOURCE).toMatch(/shell-injection-argv-allowlist\.json/);
  });

  it('carries a concurrency group so superseded runs on the same ref are cancelled', () => {
    expect(SOURCE).toMatch(/concurrency:\s*\n\s*group:\s*shell-injection-argv-lint-\$\{\{\s*github\.ref\s*\}\}/);
  });

  it('invokes the lint exactly once, in diff mode (no --all in CI)', () => {
    const invocations = SOURCE.split('\n').filter((l) => l.includes('shell-injection-argv-lint.mjs'));
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).not.toContain('--all');
  });
});
