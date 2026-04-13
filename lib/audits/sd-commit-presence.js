/**
 * Cross-repo SD commit presence checker.
 *
 * Wraps `gh search commits --owner rickfelix` to verify whether an SD
 * has shipped code to ANY EHG repository, not just the current one.
 *
 * Usage:
 *   import { findSDCommits } from './sd-commit-presence.js';
 *   const results = await findSDCommits('SD-FEATURE-001');
 *
 * SD: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-C
 * @module lib/audits/sd-commit-presence
 */

import { execSync } from 'node:child_process';

const OWNER = 'rickfelix';
const KNOWN_REPOS = ['EHG_Engineer', 'ehg', 'commitcraft-ai'];

/**
 * Check if gh CLI is available.
 * @returns {boolean}
 */
function isGhAvailable() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Search for commits mentioning an SD key across all owner repos.
 *
 * @param {string} sdKey - The SD key to search for (e.g., 'SD-FEATURE-001')
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Max results per repo
 * @returns {Promise<{ success: boolean, commits: Array, error?: string }>}
 */
export async function findSDCommits(sdKey, options = {}) {
  const limit = options.limit || 10;

  if (!sdKey || typeof sdKey !== 'string') {
    return { success: false, commits: [], error: 'sdKey is required' };
  }

  if (!isGhAvailable()) {
    return { success: false, commits: [], error: 'gh CLI not available. Install: https://cli.github.com/' };
  }

  try {
    const raw = execSync(
      `gh search commits "${sdKey}" --owner ${OWNER} --limit ${limit} --json repository,sha,commit`,
      { encoding: 'utf-8', timeout: 30000 },
    );

    const results = JSON.parse(raw);

    const commits = results.map(r => ({
      repo: r.repository?.fullName || r.repository?.name || 'unknown',
      sha: (r.sha || '').substring(0, 10),
      message: r.commit?.message?.split('\n')[0] || '',
    }));

    return { success: true, commits };
  } catch (err) {
    return { success: false, commits: [], error: err.message?.substring(0, 200) };
  }
}

/**
 * Check if an SD has commits in specific repos.
 *
 * @param {string} sdKey
 * @returns {Promise<{ found: boolean, repos: string[], commits: Array }>}
 */
export async function checkSDPresence(sdKey) {
  const result = await findSDCommits(sdKey);

  if (!result.success) {
    return { found: false, repos: [], commits: [], error: result.error };
  }

  const repos = [...new Set(result.commits.map(c => c.repo))];

  return {
    found: result.commits.length > 0,
    repos,
    commits: result.commits,
  };
}

export { OWNER, KNOWN_REPOS };
