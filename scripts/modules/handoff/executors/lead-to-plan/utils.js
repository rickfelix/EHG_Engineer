/**
 * Utility Functions for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 */

import path from 'path';
import { fileURLToPath } from 'url';

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
  const normalizedName = repoName.toLowerCase();
  if (normalizedName.includes('engineer')) {
    return path.resolve(__dirname, '../../../../../');
  }
  return path.resolve(__dirname, '../../../../../../ehg');
}
