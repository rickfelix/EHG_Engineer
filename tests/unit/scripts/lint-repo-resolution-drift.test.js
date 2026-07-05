// SD-LEO-INFRA-CANONICAL-REPO-APP-001 FR-4 (TS-5, TS-6)
import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLint } from '../../../scripts/lint-repo-resolution-drift.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_PATH = path.join(REPO_ROOT, 'scripts', '__lint_repo_resolution_drift_fixture__.mjs');

describe('lint-repo-resolution-drift', () => {
  it('TS-6: passes clean against the current repo state (no false-flags on allowlisted anchors)', () => {
    const { findings, filesScanned } = runLint();
    expect(filesScanned).toBeGreaterThan(0);
    expect(findings).toEqual([]);
  });

  describe('TS-5: detects a new violation outside the allowlist', () => {
    afterAll(() => {
      if (existsSync(FIXTURE_PATH)) rmSync(FIXTURE_PATH);
    });

    it('flags a literal platform-repo string introduced in a new, non-allowlisted file', () => {
      writeFileSync(FIXTURE_PATH, "export const OWNER_REPO = 'rickfelix/ehg';\n", 'utf8');
      const { findings } = runLint();
      const hit = findings.find((f) => f.file === 'scripts/__lint_repo_resolution_drift_fixture__.mjs');
      expect(hit).toBeDefined();
      expect(hit.value).toBe('rickfelix/ehg');
    });

    it('flags a fully-literal string concatenation forming the same value', () => {
      writeFileSync(FIXTURE_PATH, "export const OWNER_REPO = 'rickfelix' + '/' + 'ehg_engineer';\n", 'utf8');
      const { findings } = runLint();
      const hit = findings.find((f) => f.file === 'scripts/__lint_repo_resolution_drift_fixture__.mjs');
      expect(hit).toBeDefined();
      expect(hit.value).toBe('rickfelix/ehg_engineer');
    });

    it('does NOT flag a dynamic (non-literal) concatenation — value is not statically known', () => {
      writeFileSync(FIXTURE_PATH, "export function buildRepo(name) { return 'rickfelix/' + name; }\n", 'utf8');
      const { findings } = runLint();
      const hit = findings.find((f) => f.file === 'scripts/__lint_repo_resolution_drift_fixture__.mjs');
      expect(hit).toBeUndefined();
    });
  });

  it('does not flag literal platform-repo strings inside tests/** (allowlisted for fixtures/mocks)', () => {
    const { findings } = runLint();
    expect(findings.find((f) => f.file.startsWith('tests/'))).toBeUndefined();
  });
});
