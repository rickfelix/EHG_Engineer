/**
 * Regression test: complete-quick-fix --skip-tests must work standalone
 * QF-20260423-753
 *
 * RCA traced the bug to orchestrator.js:119-136 where an AND-gate required
 * BOTH --skip-tests AND --tests-pass before honoring the skip path. Fixed
 * by making --skip-tests alone default testsPass=true (matches sibling
 * --skip-typecheck pattern at test-runner.js:108-113).
 *
 * Bug introduced by commit 20f80b8e95 (2026-04-19), first reported 2026-04-24.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ORCH_PATH = path.resolve(process.cwd(), 'scripts/modules/complete-quick-fix/orchestrator.js');
const CLI_PATH = path.resolve(process.cwd(), 'scripts/modules/complete-quick-fix/cli.js');

describe('complete-quick-fix --skip-tests flag semantics', () => {
  const orchSrc = readFileSync(ORCH_PATH, 'utf8');
  const cliSrc = readFileSync(CLI_PATH, 'utf8');

  it('orchestrator gates the skip path on skipTestRun alone (no AND with testsPass)', () => {
    // Must NOT contain the old AND-gate
    expect(orchSrc).not.toMatch(/options\.testsPass\s*!==\s*undefined\s*&&\s*options\.skipTestRun/);
    // Must contain the new single-flag gate
    expect(orchSrc).toMatch(/if\s*\(\s*options\.skipTestRun\s*\)/);
  });

  it('orchestrator defaults testsPass=true when --skip-tests is passed without --tests-pass', () => {
    // The default-when-skipping logic must be present
    expect(orchSrc).toMatch(/testsPass\s*=\s*options\.testsPass\s*!==\s*undefined\s*\?\s*options\.testsPass\s*:\s*true/);
  });

  it('cli help text no longer says --tests-pass is required with --skip-tests', () => {
    // Old wording: "use with --tests-pass" / "requires --skip-tests flag"
    expect(cliSrc).not.toMatch(/use with --tests-pass to use cached results/);
    expect(cliSrc).not.toMatch(/requires --skip-tests flag/);
    // New wording mentions trusts-CI and optional override
    expect(cliSrc).toMatch(/trusts CI|testsPass=true by default|Override testsPass/);
  });

  it('orchestrator logs the chosen testsPass value when skipping', () => {
    expect(orchSrc).toMatch(/Skipping test run.*testsPass=/);
  });
});
