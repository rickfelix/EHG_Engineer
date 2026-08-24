/**
 * SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001 FR-2 (TS-1, TS-2, TS-3a, TS-3b).
 *
 * Proves the `.gitattributes` fix (CHANGELOG.md merge=union), not just asserts the config line
 * exists. Drives REAL git against isolated temp repositories, reusing this repo's existing
 * realgit pattern (tests/unit/fleet/source-tree-identity-realgit.test.js): fs.mkdtempSync +
 * fs.realpathSync (an un-resolved os.tmpdir() is an 8.3 short path on Windows and a symlink on
 * macOS, both of which break git path comparisons), explicit per-repo git identity (a bare
 * `git init` temp repo has none), explicit core.autocrlf=false (a fresh temp repo can inherit a
 * Windows/Git-for-Windows system default of `true` even though this repo's own local config is
 * `false`), and scrubGitEnv (lib/fleet/source-tree-refresh.cjs) to guard against
 * GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE env leakage redirecting these git calls at the real repo
 * — a near-identical unguarded fixture actually created stray branches in the live repo before
 * that guard existed.
 *
 * PLAN-phase TESTING sub-agent review (independently re-verified by PLAN with its own decisive
 * reproduction before being accepted) found the originally-drafted "merge-base precondition" was
 * factually wrong: git reads .gitattributes from the CHECKED-OUT ("ours") side's working
 * tree/history AT MERGE TIME, not the merge-base. TS-3a/TS-3b below are the two tests built
 * specifically to distinguish those two claims -- see the .gitattributes comment for the
 * corrected mechanism description.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { scrubGitEnv } = require_('../../lib/fleet/source-tree-refresh.cjs');

// No default `cwd` -- an omitted cwd falls back to process.cwd(), which is the LIVE repo. Every
// call site below must pass an explicit temp-repo dir (or REPO_ROOT for the FR-1 binding test).
const git = (args, cwd) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: scrubGitEnv(process.env),
});

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const CHANGELOG_BASE = [
  '# Changelog',
  '',
  '## 2026-08-24',
  '',
  '### Infrastructure',
  '- Entry A',
  '',
].join('\n');

const dirsToClean = [];

/**
 * A fresh, isolated real git repo under a realpath'd temp dir. Never touches the live repo.
 * Registers `dir` for cleanup IMMEDIATELY after mkdtempSync -- before any subsequent git call
 * that could throw (missing git binary, an old git lacking `init -b`, disk full) -- so a leak
 * cannot occur between directory creation and the caller's own cleanup registration.
 */
function initRepo(dirname) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), dirname)));
  dirsToClean.push(dir);
  git(['init', '-q', '-b', 'trunk'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'test'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  return dir;
}

function writeChangelog(dir, extraLine) {
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    CHANGELOG_BASE.replace('- Entry A', `- Entry A\n- ${extraLine}`),
  );
}

function commitAll(dir, message) {
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', message], dir);
}

beforeEach(() => { dirsToClean.length = 0; });
afterEach(() => {
  for (const d of dirsToClean) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('CHANGELOG.md merge=union fix (FR-1/FR-2)', () => {
  it('TS-1: the DEFAULT merge strategy CONFLICTS on a concurrent same-date/same-category append (documents the problem)', () => {
    const dir = initRepo('changelog-union-ts1-');

    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG_BASE);
    commitAll(dir, 'base, no .gitattributes at all');

    git(['checkout', '-q', '-b', 'branch1'], dir);
    writeChangelog(dir, 'Entry B (from branch1)');
    commitAll(dir, 'branch1 entry');

    git(['checkout', '-q', 'trunk'], dir);
    writeChangelog(dir, 'Entry C (from trunk-concurrent)');
    commitAll(dir, 'trunk concurrent entry');

    git(['checkout', '-q', 'branch1'], dir);
    let threw = false;
    try {
      git(['merge', 'trunk', '--no-edit'], dir);
    } catch {
      threw = true; // git merge exits non-zero on conflict
    }
    expect(threw, 'default merge strategy must conflict on this scenario').toBe(true);
    const status = git(['status', '--porcelain'], dir);
    expect(status).toMatch(/^UU CHANGELOG\.md$/m);
    git(['merge', '--abort'], dir);
  });

  it('TS-2: merge=union present in the checked-out (ours) branch resolves CLEANLY with both entries, no fixed order asserted', () => {
    const dir = initRepo('changelog-union-ts2-');

    fs.writeFileSync(path.join(dir, '.gitattributes'), 'CHANGELOG.md merge=union\n');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG_BASE);
    commitAll(dir, 'base WITH .gitattributes merge=union');

    git(['checkout', '-q', '-b', 'branch1'], dir);
    writeChangelog(dir, 'Entry B (from branch1)');
    commitAll(dir, 'branch1 entry');

    git(['checkout', '-q', 'trunk'], dir);
    writeChangelog(dir, 'Entry C (from trunk-concurrent)');
    commitAll(dir, 'trunk concurrent entry');

    git(['checkout', '-q', 'branch1'], dir);
    git(['merge', 'trunk', '--no-edit'], dir); // must not throw

    const result = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    expect(result).toContain('Entry B (from branch1)');
    expect(result).toContain('Entry C (from trunk-concurrent)');
    expect(result).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
    // Exactly one '### Infrastructure' heading -- no duplication.
    expect((result.match(/### Infrastructure/g) || []).length).toBe(1);
    expect(git(['status', '--porcelain'], dir).trim()).toBe('');
  });

  it('TS-3a: attribute present ONLY on the incoming (theirs) side STILL CONFLICTS -- ours-side presence is what matters', () => {
    const dir = initRepo('changelog-union-ts3a-');

    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG_BASE);
    commitAll(dir, 'base, no .gitattributes');

    // ours: checked-out branch, never gets the attribute.
    git(['checkout', '-q', '-b', 'ours-branch'], dir);
    writeChangelog(dir, 'Entry B (from ours-branch)');
    commitAll(dir, 'ours entry, no attribute');

    // theirs: incoming branch, DOES get the attribute.
    git(['checkout', '-q', 'trunk'], dir);
    fs.writeFileSync(path.join(dir, '.gitattributes'), 'CHANGELOG.md merge=union\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'theirs adds the attribute'], dir);
    writeChangelog(dir, 'Entry C (from theirs)');
    commitAll(dir, 'theirs entry');

    git(['checkout', '-q', 'ours-branch'], dir);
    let threw = false;
    try {
      git(['merge', 'trunk', '--no-edit'], dir);
    } catch {
      threw = true;
    }
    expect(threw, 'attribute on theirs-only must still conflict').toBe(true);
    // Pin the specific conflict shape, not just "the command exited non-zero" -- a threw-only
    // assertion is satisfied by ANY merge failure and borrows its discriminating power entirely
    // from TS-2 being green in the same run.
    expect(git(['status', '--porcelain'], dir)).toMatch(/^UU CHANGELOG\.md$/m);
    git(['merge', '--abort'], dir);
  });

  it('TS-3b: attribute present ONLY on the checked-out (ours) side, absent from the common ancestor AND theirs, resolves CLEANLY', () => {
    const dir = initRepo('changelog-union-ts3b-');

    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG_BASE);
    commitAll(dir, 'base, no .gitattributes at all');

    // ours: checked-out branch ADDS the attribute AFTER diverging.
    git(['checkout', '-q', '-b', 'ours-branch'], dir);
    fs.writeFileSync(path.join(dir, '.gitattributes'), 'CHANGELOG.md merge=union\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'ours adds the attribute after divergence'], dir);
    writeChangelog(dir, 'Entry B (from ours-branch)');
    commitAll(dir, 'ours entry');

    // theirs: incoming branch never gets the attribute at all.
    git(['checkout', '-q', 'trunk'], dir);
    writeChangelog(dir, 'Entry C (from theirs)');
    commitAll(dir, 'theirs entry, no attribute');

    git(['checkout', '-q', 'ours-branch'], dir);
    git(['merge', 'trunk', '--no-edit'], dir); // must not throw -- the decisive sensitivity check

    const result = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    expect(result).toContain('Entry B (from ours-branch)');
    expect(result).toContain('Entry C (from theirs)');
    expect(result).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
    expect(git(['status', '--porcelain'], dir).trim()).toBe('');
  });

  it('FR-1 binding: the SHIPPED .gitattributes actually resolves CHANGELOG.md to merge=union', () => {
    // TS-1..TS-3b above prove git's union mechanism works -- none of them read this repo's real
    // .gitattributes. Confirmed (EXEC-phase TESTING mutation check): deleting the real
    // `CHANGELOG.md merge=union` line does NOT fail any of the other tests, since each builds its
    // own isolated fixture repo with its own inline .gitattributes content. This test is the one
    // that actually binds to the shipped file, so a future silent removal or an overriding rule
    // added later in .gitattributes (attribute resolution is last-match-wins) is caught here.
    const out = git(['check-attr', 'merge', '--', 'CHANGELOG.md'], REPO_ROOT);
    expect(out.trim()).toBe('CHANGELOG.md: merge: union');
  });
});
