/**
 * SD-LEO-INFRA-MINUS-GATE-SSOT-001, FR-7 -- unit coverage for the gate-stage hardcoded-literal
 * lint (cloned from scripts/lint/stage-advancement-chokepoint-lint.mjs's proven template, per
 * TR-8; see that file's own test for the sibling pattern this mirrors).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The lint's --all sweep only walks RUNTIME_DIRS = ['scripts', 'lib', 'tests'] relative to cwd
// -- every fixture below must nest under one of those.
function libFile(dir, name, content) {
  const libDir = join(dir, 'lib');
  mkdirSync(libDir, { recursive: true });
  const p = join(libDir, name);
  writeFileSync(p, content);
  return p;
}

const LINT_SCRIPT = join(process.cwd(), 'scripts/lint/gate-stage-hardcoded-literal-lint.mjs');

describe('gate-stage-hardcoded-literal-lint: full-sweep sanity', () => {
  it('the current codebase state has zero violations (allowlist covers the known pre-existing uses)', () => {
    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: process.cwd() });
    expect(output).toMatch(/0 violations/);
  });
});

describe('gate-stage-hardcoded-literal-lint: fixture detection (isolated tmp repo, RED-first proof)', () => {
  it('TS-6: flags a NEW hardcoded KILL_GATE_STAGES literal outside the allowlist, and passes once removed', () => {
    // --all mode walks RUNTIME_DIRS directly (readdirSync), no git involved -- no repo setup needed.
    const dir = mkdtempSync(join(tmpdir(), 'gate-stage-lint-fixture-'));
    const fixturePath = libFile(dir, 'new_kill_gate_reintroduction.js', `
export const KILL_GATE_STAGES = new Set([3, 5, 13]);
`);

    // RED: the lint must fail and cite this exact fixture + identifier.
    let redOutput = '';
    let redFailed = false;
    try {
      execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      redFailed = true;
      redOutput = err.stdout?.toString() || err.message;
    }
    expect(redFailed).toBe(true);
    expect(redOutput).toMatch(/violation/);
    expect(redOutput).toMatch(/new_kill_gate_reintroduction\.js/);
    expect(redOutput).toMatch(/KILL_GATE_STAGES/);

    // GREEN: removing the literal makes the lint pass again (proves this isn't a permanently
    // broken/always-red check).
    writeFileSync(fixturePath, `
// KILL_GATE_STAGES literal removed -- derive from stage-governance.js instead.
`);
    const greenOutput = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(greenOutput).toMatch(/0 violations/);
  });

  it('flags a NEW hardcoded PROMOTION_GATES literal (a different banned identifier) outside the allowlist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-stage-lint-fixture-promo-'));
    libFile(dir, 'reintroduced.mjs', `
const PROMOTION_GATES = [17, 18, 23];
`);

    let output = '';
    let failed = false;
    try {
      output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      failed = true;
      output = err.stdout?.toString() || err.message;
    }
    rmSync(dir, { recursive: true, force: true });

    expect(failed).toBe(true);
    expect(output).toMatch(/PROMOTION_GATES/);
  });

  it('does NOT flag a KNOWN pre-existing use listed in the allowlist', () => {
    // The real allowlist entry lib/proving-companion/gate-discipline-checker.js already carries
    // a live `const KILL_GATES = [3, 5, 13];` -- covered by the full-sweep sanity test above
    // reporting 0 violations. This test proves the SAME literal, unallowlisted, WOULD be caught.
    const dir = mkdtempSync(join(tmpdir(), 'gate-stage-lint-fixture-notallowed-'));
    libFile(dir, 'not_allowlisted.js', `
const KILL_GATES = [3, 5, 13];
`);

    let failed = false;
    try {
      execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch {
      failed = true;
    }
    rmSync(dir, { recursive: true, force: true });

    expect(failed).toBe(true);
  });

  it('does NOT flag ADVISORY_GATE_STAGES/SOFT_KILL_STAGES/TASTE_GATE_STAGES (untouched identifiers, name-based not file-based)', () => {
    // Proves the FR-4/TR-8 finding this lint is built around: a file-level allowlist would be
    // the wrong mechanism for stage-gates.js, which legitimately retains these 3 OTHER
    // identifiers alongside the (removed) banned ones. This fixture mirrors that shape exactly.
    const dir = mkdtempSync(join(tmpdir(), 'gate-stage-lint-fixture-untouched-'));
    libFile(dir, 'sibling_identifiers.js', `
export const ADVISORY_GATE_STAGES = new Set([5, 13]);
export const SOFT_KILL_STAGES = new Set([3]);
export const TASTE_GATE_STAGES = new Set([10, 13, 16]);
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });

  it('does NOT flag a comment referencing a banned identifier name in prose', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-stage-lint-fixture-comment-'));
    libFile(dir, 'comment_only.js', `
// A prior version of this file hardcoded KILL_GATE_STAGES=[3,5,13,24] -- now SSOT-derived.
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });

  it('respects the inline disable pragma for a single intentional line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-stage-lint-fixture-pragma-'));
    libFile(dir, 'pragma.js', `
const KILL_GATES = [3, 5, 13]; // gate-stage-lint-disable-line
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });
});
