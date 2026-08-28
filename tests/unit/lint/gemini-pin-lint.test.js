/**
 * SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-B -- unit coverage for the Gemini pin lint (cloned from
 * scripts/lint/gate-stage-hardcoded-literal-lint.mjs's proven template; see that file's own test
 * for the sibling pattern this mirrors).
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

const LINT_SCRIPT = join(process.cwd(), 'scripts/lint/gemini-pin-lint.mjs');

describe('gemini-pin-lint: full-sweep sanity against the real repo', () => {
  it('reports exactly the 24 KNOWN, not-yet-consolidated routing pins (allowlist covers the other 11 non-routing occurrences)', () => {
    // 24 is not "0 violations" -- that is the point at THIS stage of the SD. The 5 sibling
    // subsystem-consolidation SDs (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-C through -G) migrate these
    // remaining pins onto model-config.js; the CI gate flips from allow-fail to blocking only once
    // this count reaches 0 (tracked on SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-G). A regression that
    // ADDS a new unallowlisted pin, or an allowlist entry drifting stale, changes this number --
    // which is exactly what this pinned-count test is designed to catch.
    let output = '';
    try {
      execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: process.cwd() });
    } catch (err) {
      output = err.stdout?.toString() || err.message;
    }
    expect(output).toMatch(/24 unallowlisted violation/);
  });

  it('the allowlist has zero stale entries against the real repo', () => {
    // --json still exits 1 when there are (expected, at this stage) unallowlisted violations --
    // catch and read stdout regardless of exit code, same as the other assertions in this file.
    let output = '';
    try {
      output = execSync(`node "${LINT_SCRIPT}" --all --json`, { encoding: 'utf8', cwd: process.cwd() });
    } catch (err) {
      output = err.stdout?.toString() || '';
    }
    const parsed = JSON.parse(output);
    expect(parsed.stale_allowlist_entries).toEqual([]);
  });
});

describe('gemini-pin-lint: fixture detection (isolated tmp repo, RED-first proof)', () => {
  it('flags a NEW hardcoded gemini- literal outside the allowlist, and passes once removed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-pin-lint-fixture-'));
    const fixturePath = libFile(dir, 'new_pin_reintroduction.js', `
const model = 'gemini-2.5-flash';
`);

    // RED: the lint must fail and cite this exact fixture.
    let redOutput = '';
    let redFailed = false;
    try {
      execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      redFailed = true;
      redOutput = err.stdout?.toString() || err.message;
    }
    expect(redFailed).toBe(true);
    expect(redOutput).toMatch(/unallowlisted violation/);
    expect(redOutput).toMatch(/new_pin_reintroduction\.js/);

    // GREEN: removing the literal makes the lint pass again.
    writeFileSync(fixturePath, `
// gemini- literal removed -- derive from lib/config/model-config.js getGoogleModel() instead.
`);
    const greenOutput = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(greenOutput).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag lib/config/model-config.js itself, regardless of how many pins it holds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-pin-lint-fixture-modelconfig-'));
    const configDir = join(dir, 'lib', 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'model-config.js'), `
export const MODEL_DEFAULTS = { google: { validation: 'gemini-3.7-flash', fast: 'gemini-2.5-flash' } };
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag a non-gemini identifier like "gemini-ladder" or a GEMINI_MODEL env var name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-pin-lint-fixture-notversioned-'));
    libFile(dir, 'unrelated.js', `
const laneName = 'gemini-ladder-tick';
const envKey = 'GEMINI_MODEL_REASONING';
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('does NOT flag a comment referencing a gemini- model in prose', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-pin-lint-fixture-comment-'));
    libFile(dir, 'comment_only.js', `
// A prior version of this file hardcoded 'gemini-2.5-flash' -- now SSOT-derived.
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('respects the inline disable pragma for a single intentional line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-pin-lint-fixture-pragma-'));
    libFile(dir, 'pragma.js', `
const model = 'gemini-2.5-flash'; // gemini-pin-lint-disable-line
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 unallowlisted violations/);
  });

  it('a fixture allowlist entry suppresses its exact file:line, and warns as stale once the line content changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-pin-lint-fixture-allowlist-'));
    const libDir = join(dir, 'lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'pricing.js'), `
const PRICING = {
  'gemini-2.5-pro': { in: 1.25, out: 10.00 },
};
`);
    const scriptsLintDir = join(dir, 'scripts', 'lint');
    mkdirSync(scriptsLintDir, { recursive: true });
    writeFileSync(join(scriptsLintDir, 'gemini-pin-allowlist.json'), JSON.stringify({
      entries: [{ file: 'lib/pricing.js', line: 3, category: 'pricing_table', note: 'fixture' }]
    }));

    const output = execSync(`node "${LINT_SCRIPT}" --all --json`, { encoding: 'utf8', cwd: dir });
    const parsed = JSON.parse(output);
    expect(parsed.violations).toEqual([]);
    expect(parsed.stale_allowlist_entries).toEqual([]);

    // Now shift the literal off line 3 -- the allowlist entry is stale (still trusted for its
    // OWN line, but that line no longer holds a gemini- literal, so the entry should be warned).
    writeFileSync(join(libDir, 'pricing.js'), `
const PRICING = {
  // moved
  'gemini-2.5-pro': { in: 1.25, out: 10.00 },
};
`);
    let output2 = '';
    try {
      output2 = execSync(`node "${LINT_SCRIPT}" --all --json`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      output2 = err.stdout?.toString() || '';
    }
    const parsed2 = JSON.parse(output2);
    rmSync(dir, { recursive: true, force: true });

    expect(parsed2.stale_allowlist_entries.length).toBe(1);
    expect(parsed2.stale_allowlist_entries[0]).toMatch(/lib\/pricing\.js:3/);
    // The line now holding the literal (line 4) is UNallowlisted -- a real violation surfaces.
    expect(parsed2.violations.some((v) => v.file === 'lib/pricing.js' && v.line === 4)).toBe(true);
  });
});
