/**
 * Regression coverage for SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-5).
 *
 * runLintCheck spawns processes, so the pure outcome-classification logic was
 * extracted into classifyLintOutcome() and the on-disk config detection into
 * detectEslintConfig() — both unit-testable in isolation. The bug: a deps-less
 * sandbox produced empty/unparseable eslint output, JSON.parse threw, and the
 * old code mapped that to "No ESLint config found" — falsely reporting a
 * configured repo as unconfigured. The fix distinguishes three outcomes and
 * detects flat (eslint.config.js) + legacy (.eslintrc*) configs on disk.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  classifyLintOutcome,
  detectEslintConfig,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';

const dirs = [];
function makeRepoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-cfg-'));
  dirs.push(dir);
  for (const f of files) fs.writeFileSync(path.join(dir, f), '');
  return dir;
}
afterEach(() => {
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
  dirs.length = 0;
});

describe('FR-5: classifyLintOutcome — three-way distinction', () => {
  it('empty stdout → could_not_run (NOT no_config) — the core regression', () => {
    // Pre-fix: empty output → JSON.parse throws → "No ESLint config found".
    const r = classifyLintOutcome({ stdout: '', threw: false, configPresent: true });
    expect(r.outcome).toBe('could_not_run');
    expect(r.outcome).not.toBe('no_config');
  });

  it('whitespace-only stdout → could_not_run', () => {
    expect(classifyLintOutcome({ stdout: '   \n\t ', configPresent: false }).outcome).toBe('could_not_run');
  });

  it('a thrown spawn → could_not_run regardless of output', () => {
    expect(classifyLintOutcome({ threw: true, stdout: '[]' }).outcome).toBe('could_not_run');
  });

  it('non-empty unparseable output (eslint error banner) → could_not_run, never no_config', () => {
    const r = classifyLintOutcome({ stdout: 'Oops something went wrong: ESLint couldn\'t find a config', configPresent: false });
    expect(r.outcome).toBe('could_not_run');
    expect(r.outcome).not.toBe('no_config');
  });

  it('empty JSON array AND no config on disk → no_config', () => {
    const r = classifyLintOutcome({ stdout: '[]', threw: false, configPresent: false });
    expect(r.outcome).toBe('no_config');
  });

  it('empty JSON array WITH a config on disk → ran (configured repo never reported unconfigured)', () => {
    const r = classifyLintOutcome({ stdout: '[]', threw: false, configPresent: true });
    expect(r.outcome).toBe('ran');
    expect(Array.isArray(r.results)).toBe(true);
    expect(r.results).toHaveLength(0);
  });

  it('a real result array → ran (with results passed through)', () => {
    const payload = JSON.stringify([{ filePath: 'a.js', errorCount: 2, warningCount: 1 }]);
    const r = classifyLintOutcome({ stdout: payload, configPresent: true });
    expect(r.outcome).toBe('ran');
    expect(r.results[0].errorCount).toBe(2);
  });

  it('parseable-but-not-an-array JSON → could_not_run (defensive)', () => {
    expect(classifyLintOutcome({ stdout: '{"not":"an array"}', configPresent: true }).outcome).toBe('could_not_run');
  });

  it('handles being called with no argument object', () => {
    expect(classifyLintOutcome().outcome).toBe('could_not_run');
  });
});

describe('FR-5: detectEslintConfig — flat + legacy config detection on disk', () => {
  it('detects a flat eslint.config.js as present + flat', () => {
    const r = detectEslintConfig(makeRepoWith(['eslint.config.js']));
    expect(r.present).toBe(true);
    expect(r.flat).toBe(true);
    expect(r.file).toBe('eslint.config.js');
  });

  it('detects eslint.config.mjs / .cjs / .ts flat variants', () => {
    expect(detectEslintConfig(makeRepoWith(['eslint.config.mjs'])).present).toBe(true);
    expect(detectEslintConfig(makeRepoWith(['eslint.config.cjs'])).present).toBe(true);
    expect(detectEslintConfig(makeRepoWith(['eslint.config.ts'])).present).toBe(true);
  });

  it('detects legacy .eslintrc.json as present + not flat', () => {
    const r = detectEslintConfig(makeRepoWith(['.eslintrc.json']));
    expect(r.present).toBe(true);
    expect(r.flat).toBe(false);
    expect(r.file).toBe('.eslintrc.json');
  });

  it('detects legacy .eslintrc (extensionless) and .eslintrc.js', () => {
    expect(detectEslintConfig(makeRepoWith(['.eslintrc'])).present).toBe(true);
    expect(detectEslintConfig(makeRepoWith(['.eslintrc.js'])).present).toBe(true);
  });

  it('no config on disk → present:false', () => {
    const r = detectEslintConfig(makeRepoWith(['package.json']));
    expect(r.present).toBe(false);
    expect(r.file).toBeNull();
  });

  it('flat config takes precedence when both flat + legacy exist', () => {
    const r = detectEslintConfig(makeRepoWith(['eslint.config.js', '.eslintrc.json']));
    expect(r.flat).toBe(true);
    expect(r.file).toBe('eslint.config.js');
  });

  it('non-string input → present:false (no throw)', () => {
    expect(detectEslintConfig(null).present).toBe(false);
    expect(detectEslintConfig(undefined).present).toBe(false);
  });
});

describe('FR-5: integration — a configured repo with deps-less lint output is NOT reported unconfigured', () => {
  it('detected config + empty lint output classifies as ran, not no_config', () => {
    const repo = makeRepoWith(['eslint.config.js']);
    const config = detectEslintConfig(repo);
    // Simulate the exact deps-less sandbox scenario: empty stdout.
    const outcome = classifyLintOutcome({ stdout: '', threw: false, configPresent: config.present });
    // With a config detected, empty output is "could not run", which never
    // surfaces the misleading "No ESLint config found" finding.
    expect(outcome.outcome).toBe('could_not_run');
    expect(outcome.outcome).not.toBe('no_config');
  });
});
