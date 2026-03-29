/**
 * Utility Functions for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRepoPath, ENGINEER_ROOT } from '../../../../../lib/repo-paths.js';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get repository path based on repo name
 *
 * @param {string} repoName - Repository name
 * @returns {string} Resolved repository path
 */
export function getRepoPath(repoName) {
  return resolveRepoPath(repoName) || ENGINEER_ROOT;
}
