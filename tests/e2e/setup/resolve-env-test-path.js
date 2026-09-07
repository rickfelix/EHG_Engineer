/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-1): resolve '.env.test' via git's own
 * --git-common-dir instead of a bare relative path.
 *
 * '.env.test' (real e2e test credentials) is gitignored (.gitignore:5) and exists only at the
 * main repo root. `dotenv.config({ path: '.env.test' })` resolves against process.cwd() -- in a
 * worktree checkout (e.g. .worktrees/<SD>/) that directory never contains a copy, so every
 * worktree run silently fell back to the hardcoded invalid credentials
 * ('admin@ehg.com'/'test-password' or 'test@example.com'/'Test123!') baked into each spec's own
 * fallback. RCA-verified (agents a108d1bf4de57683c, auth-seed-expert): the credentials in
 * .env.test are valid; the bug is purely path resolution, not a missing/wrong seed user.
 *
 * Deliberately does NOT distribute/copy/symlink the file into worktrees -- auth-seed-expert's
 * finding: `git worktree remove` follows a junction/symlink and destroys the TARGET, which would
 * delete the only copy of the credential. Resolving via git-common-dir reads the one file in
 * place with zero copies and nothing new to gitignore.
 *
 * @param {string} [fileName] - defaults to '.env.test'; also used for the '.env.test.local'
 *   override some callers prefer.
 * @returns {string} the resolved absolute path if found, else the bare relative fallback
 *   fileName (byte-identical to the pre-fix behavior when git resolution is unavailable).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function resolveEnvTestPath(fileName = '.env.test') {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (commonDir) {
      const candidate = join(dirname(commonDir), fileName);
      if (existsSync(candidate)) return candidate;
    }
  } catch { /* not a git repo, git absent, or resolution failed -- fall through */ }
  return fileName;
}
