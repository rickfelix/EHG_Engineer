/**
 * QF-20260906-295
 * .husky/pre-commit ran every stage over `git diff --cached`, but never asserted the index
 * was actually non-empty before printing "Pre-commit checks passed. Proceeding with commit."
 * MEASURED by the coordinator 2026-09-07 00:21Z (advisory c63221c9): a seat edited a file in
 * the shared repo ROOT while its branch lived in a worktree, so nothing was staged in the
 * worktree's index; every stage ran over the empty diff, each printed its own "passed", and
 * the final banner read as a real commit while git itself silently no-op'd. This test pins
 * the new STAGE 12 guard's SHELL pattern (not the whole hook) via bash, mirroring
 * pre-commit-marker-count.test.js's approach for the same file.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function bashAvailable() {
  const r = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function runBash(script, cwd) {
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', cwd });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1 };
}

const d = bashAvailable() ? describe : describe.skip;

// The guard's exact predicate, isolated from the surrounding 900+ line hook.
const GUARD = `
if [ -z "$(git diff --cached --name-only)" ]; then
  echo "BLOCKED: nothing staged"
  exit 1
fi
echo "PASS: something staged"
`;

d('husky pre-commit non-empty-index guard (STAGE 12)', () => {
  let repo;

  function makeTempRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-guard-'));
    runBash('git init -q && git config user.email t@t.com && git config user.name t', dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n');
    runBash('git add a.txt && git commit -q -m init', dir);
    return dir;
  }

  function cleanup(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }

  it('BLOCKS (exit 1) when the index is empty -- the exact defect class this QF fixes', () => {
    repo = makeTempRepo();
    // No `git add` -- nothing staged, mirroring the shared-root-edit scenario.
    const r = runBash(GUARD, repo);
    cleanup(repo);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('BLOCKED: nothing staged');
  });

  it('PASSES (exit 0) when something real is staged', () => {
    repo = makeTempRepo();
    fs.writeFileSync(path.join(repo, 'a.txt'), 'hello again\n');
    runBash('git add a.txt', repo);
    const r = runBash(GUARD, repo);
    cleanup(repo);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS: something staged');
  });

  it('the actual .husky/pre-commit contains the STAGE 12 non-empty-index guard, positioned before the final success banner', () => {
    const hook = fs.readFileSync(path.resolve(process.cwd(), '.husky/pre-commit'), 'utf8');
    const guardIdx = hook.indexOf('STAGE 12: Non-Empty Index Guard');
    const bannerIdx = hook.indexOf('Pre-commit checks passed. Proceeding with commit.');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(bannerIdx);
    expect(hook).toMatch(/if \[ -z "\$\(git diff --cached --name-only\)" \]; then/);
  });
});
