/**
 * SD-LEO-INFRA-REMOVE-EVERY-BINDING-001, FR-8 -- unit coverage for the venture-role
 * stage-binding reintroduction lint (cloned from
 * scripts/lint/gate-stage-hardcoded-literal-lint.mjs's proven template).
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

const LINT_SCRIPT = join(process.cwd(), 'scripts/lint/venture-role-stage-binding-lint.mjs');

describe('venture-role-stage-binding-lint: full-sweep sanity', () => {
  it('the current codebase state has zero violations', () => {
    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: process.cwd() });
    expect(output).toMatch(/0 violations/);
  });
});

describe('venture-role-stage-binding-lint: fixture detection (isolated tmp repo, RED-first proof)', () => {
  it('TS-5: flags a reintroduced stage_ownership object key, and passes once removed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-'));
    const fixturePath = libFile(dir, 'reintroduced_stage_ownership.js', `
export const VP_PRODUCT = {
  agent_role: 'vp_product',
  stage_ownership: [10, 11, 12],
};
`);

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
    expect(redOutput).toMatch(/reintroduced_stage_ownership\.js/);
    expect(redOutput).toMatch(/stage_ownership/);

    writeFileSync(fixturePath, `
export const VP_PRODUCT = {
  agent_role: 'vp_product',
};
`);
    const greenOutput = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(greenOutput).toMatch(/0 violations/);
  });

  it('flags a reintroduced can_advance_stage key on a CEO delegation_authority block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-cas-'));
    libFile(dir, 'reintroduced_can_advance.js', `
delegation_authority: {
  can_advance_stage: true,
},
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
    expect(output).toMatch(/can_advance_stage/);
  });

  it('flags a reintroduced requires_advisory_approval key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-raa-'));
    libFile(dir, 'reintroduced_raa.js', `
requires_advisory_approval: [13, 14, 15, 16],
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
    expect(output).toMatch(/requires_advisory_approval/);
  });

  it('TS-6: flags a stage-number token inside post_stage_mandate, and passes once rewritten', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-mandate-'));
    const fixturePath = libFile(dir, 'reintroduced_mandate_token.js', `
post_stage_mandate: 'live-iteration past S12: keep shipping',
`);

    let redOutput = '';
    let redFailed = false;
    try {
      execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      redFailed = true;
      redOutput = err.stdout?.toString() || err.message;
    }
    expect(redFailed).toBe(true);
    expect(redOutput).toMatch(/post_stage_mandate/);

    writeFileSync(fixturePath, `
post_stage_mandate: 'live-iteration once the venture is live: keep shipping',
`);
    const greenOutput = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(greenOutput).toMatch(/0 violations/);
  });

  it('flags a stage-number token inside honest_idle or duty_cycle strings too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-idle-'));
    libFile(dir, 'reintroduced_idle_token.js', `
honest_idle: 'idle until S21 begins',
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
    expect(output).toMatch(/honest_idle/);
  });

  it('flags a QUOTED object key too (a role definition round-tripped through JSON/DB quotes every key)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-quoted-key-'));
    libFile(dir, 'quoted_key.js', `
const role = {
  'stage_ownership': [10, 11, 12],
};
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
    expect(output).toMatch(/stage_ownership/);
  });

  it('flags a quoted stage-token field key too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-quoted-field-'));
    libFile(dir, 'quoted_field.js', `
const role = {
  "post_stage_mandate": "live-iteration past S12: keep shipping",
};
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
    expect(output).toMatch(/post_stage_mandate/);
  });

  it('flags a COMPUTED/bracket-property key too (["stage_ownership"]: ... evades a plain \\b(KEY) match)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-bracket-key-'));
    libFile(dir, 'bracket_key.js', `
const role = {
  ['stage_ownership']: [10, 11, 12],
};
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
    expect(output).toMatch(/stage_ownership/);
  });

  it('flags a bracket-property stage-token field key too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-bracket-field-'));
    libFile(dir, 'bracket_field.js', `
const role = {
  [\`post_stage_mandate\`]: 'live-iteration past S12: keep shipping',
};
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
    expect(output).toMatch(/post_stage_mandate/);
  });

  it('does NOT flag a comment referencing a banned key or stage token in prose', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-comment-'));
    libFile(dir, 'comment_only.js', `
// A prior version of this file carried stage_ownership: [10, 11, 12] and a mandate past S12.
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });

  it('does NOT flag an unrelated field/string sharing no banned name or stage token', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-unrelated-'));
    libFile(dir, 'unrelated.js', `
export const VP_MARKETING = {
  agent_role: 'vp_marketing',
  capabilities: ['campaign_planning', 'channel_analysis'],
  post_stage_mandate: 'always-on: campaign performance monitoring never stops',
};
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });

  it('respects the inline disable pragma for a single intentional line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-role-stage-lint-fixture-pragma-'));
    libFile(dir, 'pragma.js', `
stage_ownership: [1, 2, 3], // venture-role-stage-binding-lint-disable-line
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });
});
