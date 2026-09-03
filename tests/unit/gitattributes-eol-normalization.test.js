// QF-20260903-616: guard for the "phantom dirty working tree" class — a tracked file that is
// modified in `git status` forever, because its blob was committed with CRLF *before*
// .gitattributes pinned it to `eol=lf`. git then checks it out as LF, compares against a CRLF
// index blob, and reports a whole-file diff that only `git add --renormalize` can resolve.
//
// Asserted directly rather than by shelling a hook and diffing `git status`: this repo is a
// shared root with ~30 sibling worktrees and concurrent fleet sessions, so a status-clean
// assertion would measure other sessions' dirt. This contradiction is the actual cause.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Module-relative, not process.cwd(): this asserts a property of the repo the test ships in,
// and vitest's cwd is not guaranteed to be that repo when run from a sibling worktree.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('gitattributes eol normalization', () => {
  it('no tracked blob contradicts an eol=lf .gitattributes pin', () => {
    // No try/catch by design: `git ls-files` needs no network and no remote, so it has no
    // legitimate failure mode. The FR-6 fence this replaces swallowed an unreachable
    // origin/main into a silent pass, and so could report green having compared nothing.
    const listing = execFileSync('git', ['ls-files', '--eol'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, // ~20k tracked files overflows the 1MB default
    });

    // "i/<eol>  w/<eol>  attr/<attrs>\t<path>". Only the *index* side matters: a CRLF working
    // tree is fine and expected on Windows; a CRLF index blob under eol=lf is the
    // contradiction that checkout cannot resolve.
    const violations = listing
      .split('\n')
      .filter((line) => line.startsWith('i/crlf') && line.includes('eol=lf'))
      .map((line) => line.split('\t')[1]);

    expect(
      violations,
      `CRLF index blobs pinned to eol=lf can never show clean in git status. ` +
        `Fix: git add --renormalize ${violations.join(' ')}`,
    ).toEqual([]);
  });
});
