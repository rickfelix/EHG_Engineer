/**
 * pinned-skill-read — resolve and read a .claude/skills/*.skill.md file at an immutable
 * git-commit pin, reusing lib/chairman/pinned-contract-read.mjs's git primitives rather than
 * duplicating them. SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001, FR-2.
 *
 * A role pinned to a skill at commit A must keep resolving to commit A's content even after a
 * later commit edits the live file — this module never reads the working tree for a pinned
 * lookup, only `git show <commit>:<path>` (via readContractAtCommit).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  isCommitObject,
  readContractAtCommit,
  PinnedReadError,
} from '../chairman/pinned-contract-read.mjs';
import { parseSkillContent } from './skill-loader.js';

const execFileAsync = promisify(execFile);
const DEFAULT_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

export { isCommitObject, PinnedReadError };

/**
 * Repo-relative path for a skill file living in .claude/skills/.
 */
function skillRelPath(skillFileName) {
  return `.claude/skills/${skillFileName}`;
}

/**
 * Most recent commit touching .claude/skills/<skillFileName> as of HEAD.
 * Mirrors lastCommitTouchingBefore() from the precedent, but bounded by "now" (HEAD) rather
 * than a historical whenIso.
 * @returns {Promise<string|null>} a commit SHA, or null if the file has no history yet
 */
export async function resolveCurrentSkillPin(skillFileName, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const relPath = skillRelPath(skillFileName);
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--format=%H', '-n', '1', 'HEAD', '--', relPath],
      { cwd: repoRoot, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, windowsHide: true }
    );
    const sha = stdout.trim();
    return sha === '' ? null : sha;
  } catch {
    return null;
  }
}

/**
 * Read a skill file's parsed content as it existed at a pinned commit. Never touches the
 * working tree — a later edit to the live file cannot change what this returns for a fixed
 * `pinnedCommit`.
 * @throws {PinnedReadError} if the commit or path is invalid/unreadable
 */
export async function readSkillAtPin(skillFileName, pinnedCommit, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const relPath = skillRelPath(skillFileName);
  const raw = await readContractAtCommit(pinnedCommit, relPath, { repoRoot });
  return parseSkillContent(raw, { filePath: skillFileName });
}
