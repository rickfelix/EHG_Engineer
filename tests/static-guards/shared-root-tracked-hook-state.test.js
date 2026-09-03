/**
 * QF-20260902-444 — hook-written per-session state must never be TRACKED.
 *
 * MEASURED 2026-09-02 (Adam 673db833): .claude/.protocol-sync (file form) and
 * .claude/session-state.md were both tracked despite being rewritten by every session's
 * hooks. .gitignore's existing rules missed both: line 362 ignores only the DIRECTORY form
 * .claude/.protocol-sync/, and line 97's .claude/*-session-state-*.md pattern requires a
 * `*-` prefix / `-*` suffix around "session-state" that the bare session-state.md never
 * satisfies. Every session therefore showed `M .claude/.protocol-sync` and
 * `M .claude/session-state.md` in the shared root, which scripts/safe-root-resync.mjs's
 * dirty-tree check (a special-cased filter for .protocol-sync only) could not fully absorb,
 * so the shared root lagged origin/main.
 *
 * Both paths are now `git rm --cached` and covered by file-form .gitignore rules. This guard
 * is the exit predicate: a future re-tracking (e.g. an accidental `git add -f` or a chore
 * commit, as happened to session-state.md on 2026-09-02) fails loud here instead of silently
 * reintroducing the drift.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

const REPO = process.cwd();
const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });

const TRACKED_HOOK_STATE_PATHS = ['.claude/.protocol-sync', '.claude/session-state.md'];

describe('QF-20260902-444: hook-written per-session state stays untracked', () => {
  it.each(TRACKED_HOOK_STATE_PATHS)('%s is not tracked by git', (relPath) => {
    // `git ls-files -- <path>` prints the path back only if it IS tracked; empty output means
    // not tracked, which is the success state.
    const out = git(['ls-files', '--', relPath]).trim();
    expect(out, `${relPath} must not be tracked -- it is rewritten by every session's hooks`).toBe('');
  });

  it.each(TRACKED_HOOK_STATE_PATHS)('%s is ignored by .gitignore (a file-form rule exists, not just a directory rule)', (relPath) => {
    // check-ignore exits 1 (and prints nothing) when the path is NOT ignored -- execFileSync
    // throws on a non-zero exit, so a caught error here means the guard itself failed to match.
    let out = '';
    try {
      out = git(['check-ignore', relPath]).trim();
    } catch (e) {
      throw new Error(`${relPath} is not covered by any .gitignore rule (git check-ignore found none): ${e.message}`);
    }
    expect(out).toBe(relPath);
  });
});
