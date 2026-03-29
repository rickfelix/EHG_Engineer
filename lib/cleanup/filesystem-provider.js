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

import { existsSync, rmSync } from 'fs';
import { resolve, normalize } from 'path';

// Directories that are safe to search for venture workspaces
const ALLOWED_ROOTS = [
  resolve(process.cwd(), '.worktrees'),
  resolve(process.cwd(), 'tmp'),
];

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
  const normalized = normalize(resolve(targetPath));

  if (PROTECTED_PATHS.has(normalized)) {
    return { safe: false, reason: 'Protected path' };
  }

  const isUnderAllowed = ALLOWED_ROOTS.some(root => normalized.startsWith(root));
  if (!isUnderAllowed) {
    return { safe: false, reason: `Path not under allowed roots: ${ALLOWED_ROOTS.join(', ')}` };
  }

  return { safe: true };
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

    if (!existsSync(absolutePath)) {
      continue; // Already gone, not an error
    }

    if (dryRun) {
      result.cleaned.push(absolutePath);
      continue;
    }

    try {
      rmSync(absolutePath, { recursive: true, force: true });
      result.cleaned.push(absolutePath);
    } catch (err) {
      result.errors.push({ path: absolutePath, error: err.message });
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
