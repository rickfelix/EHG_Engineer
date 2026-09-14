/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J (P5.1) -- unit coverage for the eva-stage-literal
 * lint's detection heuristic and its file-walking/allowlist logic.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINT_SCRIPT = join(process.cwd(), 'scripts/lint/eva-stage-literal-lint.mjs');

describe('eva-stage-literal-lint: full-sweep sanity', () => {
  it('the current codebase state has zero violations (allowlist covers the full census)', () => {
    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: process.cwd() });
    // Anchor to a real file count too -- a broken walker finding NOTHING would print
    // "0 file(s) checked, 0 violations" and pass a bare /0 violations/ assertion for free.
    const match = output.match(/(\d+) file\(s\) checked, 0 violations/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThan(100);
  });
});

describe('eva-stage-literal-lint: fixture detection (isolated tmp repo)', () => {
  it('flags a NEW file with a bare stage-number literal comparison outside the allowlist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-'));
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'seeded.js'), `
export function check(currentStage) {
  if (currentStage === 24) return 'launch';
  return 'other';
}
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
    expect(output).toMatch(/violation/);
    expect(output).toMatch(/seeded\.js/);
  });

  it('flags a bare literal in the 1-22 range too (FR-10: registry now covers all 27 stages)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-low-'));
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'seeded-low.js'), `
export function check(currentStage) {
  if (currentStage === 5) return 'kill-gate';
  return 'other';
}
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
    expect(output).toMatch(/seeded-low\.js/);
  });

  it('does NOT flag a numeric literal in the 23-27 range with no stage-shaped identifier', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-noise-'));
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'unrelated.js'), `
export function risk(avgScore) {
  return avgScore >= 25 ? 'medium' : 'low';
}
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    // Anchor to "1 file(s) checked" too -- a broken walker finding NOTHING would print
    // "0 file(s) checked, 0 violations" and pass a bare /0 violations/ assertion for free.
    expect(output).toMatch(/1 file\(s\) checked, 0 violations/);
  });

  it('does NOT flag the registry file itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-registry-'));
    const registryDir = join(dir, 'lib', 'eva', 'stage-templates');
    mkdirSync(registryDir, { recursive: true });
    writeFileSync(join(registryDir, 'stage-key-registry.js'), `
export const STAGE_KEY_BY_NUMBER = Object.freeze({
  23: 'dedicated_venture_uat',
  24: 'launch_readiness_gate',
});
export function check(stageNumber) {
  return stageNumber === 24;
}
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    // Anchor to "1 file(s) checked" too -- a broken walker finding NOTHING would print
    // "0 file(s) checked, 0 violations" and pass a bare /0 violations/ assertion for free.
    expect(output).toMatch(/1 file\(s\) checked, 0 violations/);
  });

  it('respects the inline disable pragma', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-pragma-'));
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'pragma.js'), `
export function check(currentStage) {
  return currentStage === 25; // eva-stage-literal-lint-disable-line
}
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    // Anchor to "1 file(s) checked" too -- a broken walker finding NOTHING would print
    // "0 file(s) checked, 0 violations" and pass a bare /0 violations/ assertion for free.
    expect(output).toMatch(/1 file\(s\) checked, 0 violations/);
  });

  it('does NOT misread an arrow (23->24) inside a trailing comment as a comparison', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-arrow-'));
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'arrow.js'), `
export const NAMES = [
  'Ops cycles (Stage 26-27)', // updated 25-26 -> 26-27
];
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    // Anchor to "1 file(s) checked" too -- a broken walker finding NOTHING would print
    // "0 file(s) checked, 0 violations" and pass a bare /0 violations/ assertion for free.
    expect(output).toMatch(/1 file\(s\) checked, 0 violations/);
  });

  it('fails LOUD (not silently empty) when the allowlist file exists but is not valid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-malformed-'));
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'seeded.js'), `
export function check(currentStage) {
  if (currentStage === 24) return 'launch';
}
`);
    const lintDir = join(dir, 'scripts', 'lint');
    mkdirSync(lintDir, { recursive: true });
    writeFileSync(join(lintDir, 'eva-stage-literal-lint-allowlist.json'), '{ this is not json');

    let output = '';
    let failed = false;
    try {
      output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      failed = true;
      output = `${err.stdout?.toString() || ''}${err.stderr?.toString() || ''}`;
    }
    rmSync(dir, { recursive: true, force: true });

    expect(failed).toBe(true);
    expect(output).toMatch(/exists but is not valid JSON/);
  });
});

describe('eva-stage-literal-lint: --diff mode', () => {
  it('only lints files git reports as changed, catching a violation in a modified tracked file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eva-stage-lint-fixture-diff-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email test@test.com', { cwd: dir });
    execSync('git config user.name test', { cwd: dir });
    const evaDir = join(dir, 'lib', 'eva');
    mkdirSync(evaDir, { recursive: true });
    writeFileSync(join(evaDir, 'base.js'), 'export const x = 1;\n');
    execSync('git add -A && git commit -q -m base', { cwd: dir });

    // A changed (tracked, modified) file with a violation IS picked up by --diff.
    writeFileSync(join(evaDir, 'base.js'), `
export function check(currentStage) {
  if (currentStage === 24) return 'launch';
}
`);

    let output = '';
    let failed = false;
    try {
      output = execSync(`node "${LINT_SCRIPT}"`, { encoding: 'utf8', cwd: dir, env: { ...process.env, EVA_STAGE_LITERAL_LINT_BASE: 'HEAD' } });
    } catch (err) {
      failed = true;
      output = `${err.stdout?.toString() || ''}${err.stderr?.toString() || ''}`;
    }
    rmSync(dir, { recursive: true, force: true });

    expect(failed).toBe(true);
    expect(output).toMatch(/base\.js/);
  });
});
