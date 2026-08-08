/**
 * EXEC SECURITY S2 (HIGH) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * THE ATTACK. The reuse branch trusted fs.existsSync(dir) alone, then ran `git -C <dir> fetch` and
 * `merge --ff-only` using THAT DIRECTORY'S OWN git config — and the reaper subsequently EXECUTES
 * from that directory with destructive privileges. A directory pre-created at the default path, or
 * pointed at by the unauthenticated FLEET_REAPER_SOURCE_DIR / FLEET_SPAWN_SOURCE_DIR override,
 * carrying a SELF-CONSISTENT fake history (its own `origin`, HEAD already equal to its own
 * origin/main) satisfies both the refresh and the independent enforceTreeCurrency re-check.
 * Precondition is only local filesystem write access.
 *
 * WHY `--git-common-dir` IS THE DISCRIMINATOR: it resolves to the MAIN repository's .git for any
 * genuine linked worktree, so a foreign repo — however well-formed — resolves somewhere else.
 * Comparing origin URLs would prove nothing; an attacker sets those freely.
 *
 * THE NEGATIVE ARM IS A CONVINCING FAKE, NOT AN EMPTY DIRECTORY. A test that only rejects an
 * unreadable dir would pass against an implementation that merely checks "is this a git repo at
 * all" — which is exactly the too-weak check this replaces.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { ensureSourceTreeWorktree, REAPER_SOURCE_DIRNAME, REAPER_SOURCE_BRANCH } =
  require_('../../../lib/fleet/source-tree-refresh.cjs');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'src-identity-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

/**
 * A runner that answers `rev-parse --git-common-dir` per-directory from a lookup, so a fixture can
 * express "this dir belongs to repo X" without building real repositories.
 */
const isProbe = (args) => args.includes('rev-parse')
  && (args.includes('--git-common-dir') || args.includes('--show-toplevel')
    || args.includes('--absolute-git-dir'));

/**
 * S2-R: the guard gained a SECOND, position-sensitive probe (--show-toplevel), because
 * --git-common-dir alone is defeated by a bare mkdir inside the repo. THIS FIXTURE CANNOT OBSERVE
 * THAT CLASS AT ALL — a per-directory lookup table has no way to express "a plain subdirectory
 * whose answers come from its parent". That is why tests/unit/fleet/source-tree-identity-realgit.js
 * exists and drives real git. Kept here only for the cases a lookup table CAN express.
 */
function runnerWith(commonDirs, log) {
  // Matched by CONTENT, not argv position: the probe gained --path-format=absolute mid-review, and
  // a position-indexed fixture would have silently stopped matching and returned '' — which reads
  // as "unverifiable => refuse" and would have turned every reuse test green for the wrong reason.
  return (args) => {
    if (log) log.push(args.join(' '));
    if (args[0] === '-C' && isProbe(args)) {
      const d = args[1];
      if (!(d in commonDirs)) throw new Error(`not a git repository: ${d}`);
      // Real git answers --show-toplevel with an ABSOLUTE path; for every directory this fixture
      // can express, that is the directory itself (a lookup table cannot model a plain subdir).
      // realpath, mirroring real git: the guard compares against fs.realpathSync.native, and on
      // Windows os.tmpdir() can differ from its canonical form, so path.resolve alone would make
      // the POSITIVE control fail for a reason that has nothing to do with identity.
      if (args.includes('--show-toplevel')) {
        try { return fs.realpathSync.native(d) + '\n'; } catch { return path.resolve(d) + '\n'; }
      }
      // CHECK 3: a genuine linked worktree's gitdir lives under <common>/worktrees/<name>. This
      // fixture can only express the honest shape — the FORGERIES that answer <common> itself
      // (a .git-file plant, a GIT_DIR env plant) live in source-tree-identity-realgit.test.js,
      // because a lookup table cannot reproduce how git resolves them.
      if (args.includes('--absolute-git-dir')) return `${commonDirs[d]}/worktrees/${path.basename(d)}\n`;
      return commonDirs[d] + '\n';
    }
    return '';
  };
}

/**
 * G1 (PLAN TESTING, re-review): every identity test asserted a VERDICT, and none asserted that git
 * had not already run in the unverified directory. Measured by the reviewer: moving the probe to
 * AFTER fetch + merge --ff-only left all 3432 tests green — the refusal still threw the same
 * message, just after git had already executed with the attacker's config, which IS the S2 threat
 * model. A verdict-only assertion cannot see ORDER. This pins the order.
 */
function expectNoGitRanBeforeRefusal(calls) {
  const nonProbe = calls.filter((c) => !isProbe(c.split(' ')));
  expect(nonProbe).toEqual([]); // fetch/merge/anything in an unverified dir = the vulnerability
}

describe('S2: an existing directory is only reused if it belongs to THIS repo', () => {
  const dirOf = (root) => path.join(root, REAPER_SOURCE_DIRNAME);

  it('REUSES a genuine linked worktree (positive control)', () => {
    const dir = dirOf(tmp);
    fs.mkdirSync(dir, { recursive: true });
    const res = ensureSourceTreeWorktree({
      repoRoot: tmp, dirname: REAPER_SOURCE_DIRNAME, branch: REAPER_SOURCE_BRANCH, label: 'reaper-source',
      exists: () => true,
      // Both resolve to the SAME common dir — that is what a real linked worktree looks like.
      runner: runnerWith({ [dir]: path.join(tmp, '.git'), [tmp]: path.join(tmp, '.git') }),
    });
    expect(res.created).toBe(false);
  });

  it('REFUSES a self-consistent FAKE repo at the expected path', () => {
    // The whole attack: a well-formed git repo that simply is not ours. It answers rev-parse
    // happily — just with a different common dir.
    const dir = dirOf(tmp);
    fs.mkdirSync(dir, { recursive: true });
    const evil = path.join(tmp, 'attacker-repo', '.git');
    const calls = [];
    expect(() => ensureSourceTreeWorktree({
      repoRoot: tmp, dirname: REAPER_SOURCE_DIRNAME, branch: REAPER_SOURCE_BRANCH, label: 'reaper-source',
      exists: () => true,
      runner: runnerWith({ [dir]: evil, [tmp]: path.join(tmp, '.git') }, calls),
    })).toThrow(/NOT a linked worktree/i);
    // G1: the refusal must come BEFORE any git runs in the attacker's directory, not after.
    expectNoGitRanBeforeRefusal(calls);
  });

  it('REFUSES a directory git cannot identify at all — fails CLOSED', () => {
    const dir = dirOf(tmp);
    fs.mkdirSync(dir, { recursive: true });
    const calls = [];
    expect(() => ensureSourceTreeWorktree({
      repoRoot: tmp, dirname: REAPER_SOURCE_DIRNAME, branch: REAPER_SOURCE_BRANCH, label: 'reaper-source',
      exists: () => true,
      runner: runnerWith({ [tmp]: path.join(tmp, '.git') }, calls), // dir throws => unverifiable
    })).toThrow(/NOT a linked worktree/i);
    expectNoGitRanBeforeRefusal(calls);
  });

  it('the refusal names the consequence, not just the rule', () => {
    // Same standard the spawn-source siting guard is held to: an operator hitting this needs to
    // know WHY it matters, or they will "fix" it by deleting the check.
    const dir = dirOf(tmp);
    fs.mkdirSync(dir, { recursive: true });
    let msg = '';
    try {
      ensureSourceTreeWorktree({
        repoRoot: tmp, dirname: REAPER_SOURCE_DIRNAME, branch: REAPER_SOURCE_BRANCH, label: 'reaper-source',
        exists: () => true,
        runner: runnerWith({ [dir]: '/somewhere/else/.git', [tmp]: path.join(tmp, '.git') }),
      });
    } catch (e) { msg = e.message; }
    expect(msg).toMatch(/destructive privileges/i);
    expect(msg).toMatch(/currency check/i);
  });

  it('a NEW tree is still created normally — the check does not block the create path', () => {
    // Negative arm on a DIFFERENT axis: absence, not identity. Guards against a fix that refuses
    // everything and would therefore also pass the three rejection tests above.
    const calls = [];
    const res = ensureSourceTreeWorktree({
      repoRoot: tmp, dirname: REAPER_SOURCE_DIRNAME, branch: REAPER_SOURCE_BRANCH, label: 'reaper-source',
      exists: () => false,
      runner: (args) => { calls.push(args.join(' ')); fs.mkdirSync(dirOf(tmp), { recursive: true }); },
    });
    expect(res.created).toBe(true);
    expect(calls.some((c) => c.startsWith('worktree add'))).toBe(true);
  });
});
