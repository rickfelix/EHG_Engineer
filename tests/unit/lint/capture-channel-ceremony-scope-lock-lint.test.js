/**
 * SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001 (FR-5) — control-seed-test-lint registration for
 * scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs.
 *
 * WHY THIS IS A seedTest, NOT A fixtures TRIAL: the harness's fixture trial (control-seed-test.mjs
 * runTrial) plants files in a scratch dir with only `git init` + `git add -A` — no commit, so no
 * HEAD exists. This lint's whole job is diffing a base ref against HEAD (`${base}...HEAD`), which
 * is unexpressible without real git history. So this test builds an actual two-commit repo and
 * spawns the real CLI against it, the way schema-reference-lint.mjs's own registration does for
 * the same structural reason (see its seedTest entry's note in control-seed-specs.json).
 *
 * TWO-SIDED: asserts the lint fires on a genuine ceremony touch AND stays clean on an unrelated
 * change, so a neutered "always pass" mutant is distinguishable from a lint that never ran.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LINT = path.join(REPO, 'scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function makeFixtureRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'ceremony-lock-fx-'));
  git(['init', '-q'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'test'], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'base'], root);
  const base = git(['rev-parse', 'HEAD'], root).trim();
  return { root, base };
}

function runLint(root, base) {
  const r = spawnSync(process.execPath, [LINT, '--base', base], { cwd: root, encoding: 'utf8', timeout: 60000 });
  return { code: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

describe('capture-channel-ceremony-scope-lock-lint — real two-commit repo', () => {
  it('[CONTROL] exits 0 when the diff touches nothing in the ceremony scope', () => {
    const { root, base } = makeFixtureRepo();
    try {
      mkdirSync(path.join(root, 'src'), { recursive: true });
      writeFileSync(path.join(root, 'src', 'unrelated.js'), 'export const x = 1;\n');
      git(['add', '-A'], root);
      git(['commit', '-q', '-m', 'unrelated change'], root);

      const { code } = runLint(root, base);
      expect(code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  it('[THE SEED] exits 1 and names the file when the diff touches a banned ceremony path', () => {
    const { root, base } = makeFixtureRepo();
    try {
      mkdirSync(path.join(root, '.claude'), { recursive: true });
      writeFileSync(path.join(root, '.claude', 'settings.json'), '{"hooks":{}}\n');
      git(['add', '-A'], root);
      git(['commit', '-q', '-m', 'touch ceremony surface'], root);

      const { code, out } = runLint(root, base);
      expect(code).toBe(1);
      expect(out).toContain('.claude/settings.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
});
