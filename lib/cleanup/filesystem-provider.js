/**
 * Filesystem Cleanup Provider
 *
 * Removes local workspace directories associated with a venture.
 * Validates paths against an allowlist to prevent accidental deletion
 * of protected directories.
 *
 * @module lib/cleanup/filesystem-provider
 * Part of SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-B
 */

import { existsSync, rmSync, realpathSync } from 'fs';
import { resolve, normalize, sep } from 'path';

/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B (FR-4): `.worktrees` was REMOVED from this
 * allowlist.
 *
 * Every other worktree deleter in this repo routes through a guarded chokepoint that asks
 * whether the tree is live-claimed or occupied. This one did not: it accepted any path
 * under `.worktrees` and deleted it having asked neither question. The guards child cannot
 * claim "a venue with a live occupant is not reapable, by any addressing scheme" while a
 * path exists that consults none of them.
 *
 * CORRECTION TO THIS FILE'S EARLIER RATIONALE (SEC-08). An earlier version of this comment
 * — and the FR-5 guard, and worktree-manager.js:1179-1191 — justified the control by
 * claiming a recursive rmSync follows a nested `node_modules` junction out of the tree.
 * SECURITY could NOT reproduce that on Node v24.12.0: the nested junction was unlinked and
 * the link target survived intact. The false premise mattered, because it pointed at a
 * safe route and concealed the one that is real — a junction in an INTERMEDIATE path
 * segment, which escapes lexical containment entirely (see validatePath). The control is
 * still correct; its justification is that this provider cannot ask the claim or residency
 * question, not a junction-following behaviour that does not occur.
 *
 * HONEST SEVERITY, because the original framing overstated it: this was LATENT, not live.
 * cleanupFilesystem does no auto-discovery (see targetPaths below), its only caller is
 * lib/cleanup/index.js, and the venture-delete path that reaches it passes no
 * `filesystemPaths` — so the rmSync was unreachable in production. It is closed because it
 * is a loaded gun in a subsystem that has had this class of accident repeatedly, not
 * because it was firing.
 *
 * Venture workspace cleanup under `tmp` is unaffected. Anything genuinely needing to remove
 * a worktree should go through the reaper or worktree-manager, which consult the guards.
 */
const realOrSelf = (p) => { try { return realpathSync.native(p); } catch { return p; } };

const ALLOWED_ROOTS = [
  realOrSelf(resolve(process.cwd(), 'tmp')),
];

/** Refused explicitly (rather than merely falling off the allowlist) so the reason is legible. */
const WORKTREE_ROOT = realOrSelf(resolve(process.cwd(), '.worktrees'));

// Never delete these regardless of matching
const PROTECTED_PATHS = new Set([
  normalize(process.cwd()),
  resolve(process.cwd(), '.git'),
  resolve(process.cwd(), 'node_modules'),
  resolve(process.cwd(), '.claude'),
]);

/**
 * Validate that a path is safe to delete.
 *
 * @param {string} targetPath - Absolute path to validate
 * @returns {{safe: boolean, reason?: string}}
 */
function validatePath(targetPath) {
  // SEC-01: resolve()/normalize() collapse `..` but do NOT resolve links, so the checks
  // below were purely LEXICAL. A junction in an INTERMEDIATE path segment escaped both the
  // worktree refusal and the tmp allowlist — SECURITY reproduced this destroying a real
  // file under .worktrees via `tmp/portal/VICTIM` where tmp/portal was a junction.
  // realpath is what makes containment a statement about the filesystem rather than about
  // the string. Note safeRecursiveRm does NOT fix this route: it lstats only the final
  // component, so it walks the intermediate junction too.
  //
  // A path that does not exist yet cannot be realpath'd; fall back to the lexical form,
  // which is safe because a non-existent path is also nothing to delete.
  let normalized;
  try {
    normalized = normalize(realpathSync.native(resolve(targetPath)));
  } catch {
    normalized = normalize(resolve(targetPath));
  }

  if (PROTECTED_PATHS.has(normalized)) {
    return { safe: false, reason: 'Protected path' };
  }

  // FR-4: named refusal. Worktree removal must go through a guarded path that can ask
  // whether the tree is claimed or occupied; this provider cannot ask either question.
  if (isUnder(normalized, WORKTREE_ROOT)) {
    return { safe: false, reason: 'Worktree paths must be removed via the guarded reaper/worktree-manager, not the cleanup provider' };
  }

  const isUnderAllowed = ALLOWED_ROOTS.some((root) => isUnder(normalized, root));
  if (!isUnderAllowed) {
    return { safe: false, reason: `Path not under allowed roots: ${ALLOWED_ROOTS.join(', ')}` };
  }

  // The RESOLVED path is returned so the caller deletes the thing that was validated.
  // Validating a realpath and then deleting the lexical path would traverse the very
  // junction the realpath was computed to see through — the check would be real and the
  // deletion would still escape.
  return { safe: true, resolvedPath: normalized };
}

/**
 * Containment WITH a separator boundary.
 *
 * The previous check was a bare `normalized.startsWith(root)`, so a sibling directory
 * whose name merely began with an allowed root — `tmp-restore`, `tmpfoo` — validated as
 * being inside `tmp` and became deletable. Same defect family as the rest of this SD: a
 * guard whose predicate is looser than the thing it claims to enforce.
 */
function isUnder(candidate, root) {
  if (candidate === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return candidate.startsWith(prefix);
}

/**
 * Clean up local filesystem resources associated with a venture.
 *
 * Searches allowed directories for venture-related workspace folders
 * and removes them safely.
 *
 * @param {string} ventureId - UUID of the venture (used to find workspace dirs)
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, report what would be deleted without acting
 * @param {string[]} [options.paths] - Explicit paths to clean (overrides auto-discovery)
 * @returns {Promise<{success: boolean, cleaned: string[], errors: Array<{path: string, error: string}>}>}
 */
export async function cleanupFilesystem(ventureId, options = {}) {
  const { dryRun = false, paths: explicitPaths } = options;
  const result = { success: true, cleaned: [], errors: [] };

  // Use explicit paths if provided, otherwise no auto-discovery for now
  const targetPaths = explicitPaths || [];

  for (const targetPath of targetPaths) {
    const absolutePath = resolve(targetPath);
    const validation = validatePath(absolutePath);

    if (!validation.safe) {
      result.errors.push({ path: absolutePath, error: validation.reason });
      continue;
    }

    // Delete what was VALIDATED, not what was requested (SEC-01).
    const deletePath = validation.resolvedPath || absolutePath;

    if (!existsSync(deletePath)) {
      continue; // Already gone, not an error
    }

    if (dryRun) {
      result.cleaned.push(absolutePath);
      continue;
    }

    try {
      rmSync(deletePath, { recursive: true, force: true });
      result.cleaned.push(absolutePath);
    } catch (err) {
      result.errors.push({ path: absolutePath, error: err.message });
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
