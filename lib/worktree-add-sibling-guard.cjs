'use strict';
/**
 * worktree-placement sibling guard — SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001 FR-1.
 *
 * A model-typed `git worktree add ../<sibling>` (no path prescribed anywhere in the QF
 * self-claim path) registers a worktree OUTSIDE the repo root. A session's working
 * directory is the repo root, so every Read/Edit inside that sibling raises the Claude
 * Code outside-working-directory permission prompt and the seat freezes until a human
 * answers (witnessed live 2026-09-01, including this SD's own trigger: EHG_Engineer-qf-117).
 *
 * Reuses the existing validateWorktreePath (scripts/resolve-sd-workdir.js) rather than a
 * second regex, per this SD's own design constraint (TR-1). ADDITIONALLY closes a measured
 * gap in that function (TESTING sub-agent, evidence b2155fb0, F5): validateWorktreePath's
 * `startsWith(path.join(root, '.worktrees'))` has no separator anchor, so a sibling named
 * `.worktrees-evil` or `.worktreesX` wrongly passes. This module adds the separator-anchor
 * check itself (does not modify validateWorktreePath, per TR-1) — BOTH checks must pass.
 *
 * Pure + fs-free, same shape as lib/worktree-remove-junction-guard.cjs.
 */
const path = require('path');

// Command-start-boundary matching (mirrors WORKTREE_REMOVE_RE) to avoid quoted-string
// false positives. Captures the target path (first non-flag token after `add`).
const WORKTREE_ADD_RE = /(?:^|[;&|(\n])\s*git\s+worktree\s+add\s+(?:(-[-\w]+\s+)*)["']?([^"'\s]+)["']?/;

function extractTargetPath(command) {
  const m = WORKTREE_ADD_RE.exec(command);
  return m ? m[2] : null;
}

/**
 * Separator-anchored containment check (closes F5 — the bare startsWith bypass).
 * A resolved path is "under" worktreesDir only if it equals worktreesDir or the very next
 * character after the worktreesDir prefix is a path separator.
 */
function isSeparatorAnchoredUnder(resolved, worktreesDir) {
  if (resolved === worktreesDir) return true;
  if (!resolved.startsWith(worktreesDir)) return false;
  const nextChar = resolved.charAt(worktreesDir.length);
  return nextChar === path.sep || nextChar === '/';
}

/**
 * @param {object} opts
 * @param {string} opts.command - the Bash command text
 * @param {string} [opts.cwd] - cwd the command would run in (defaults to process.cwd())
 * @param {string} opts.repoRoot - the repo root to anchor .worktrees/ under
 * @param {(resolved: string, repoRoot: string) => boolean} opts.validateWorktreePath -
 *   reused from scripts/resolve-sd-workdir.js (TR-1) — the caller passes it in so this
 *   module stays fs/import-free and independently unit-testable.
 * @returns {{ isSibling: boolean, reason: string, resolved?: string }}
 */
function worktreeAddIsSibling({ command, cwd, repoRoot, validateWorktreePath }) {
  if (typeof command !== 'string') return { isSibling: false, reason: 'not_a_string' };
  const target = extractTargetPath(command);
  if (!target) return { isSibling: false, reason: 'not_a_worktree_add' };

  const base = cwd || process.cwd();
  const resolved = path.isAbsolute(target) ? path.resolve(target) : path.resolve(base, target);
  const resolvedRoot = path.resolve(repoRoot);
  const worktreesDir = path.join(resolvedRoot, '.worktrees');

  if (!isSeparatorAnchoredUnder(resolved, worktreesDir)) {
    return { isSibling: true, reason: 'outside_worktrees_dir_separator_anchor', resolved };
  }
  if (typeof validateWorktreePath === 'function' && !validateWorktreePath(resolved, resolvedRoot)) {
    return { isSibling: true, reason: 'outside_worktrees_dir', resolved };
  }
  return { isSibling: false, reason: 'inside_worktrees_dir', resolved };
}

module.exports = { worktreeAddIsSibling, extractTargetPath, isSeparatorAnchoredUnder };
