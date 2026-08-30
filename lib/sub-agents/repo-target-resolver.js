/**
 * Repo Target Resolver
 *
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-1): extracted from
 * scripts/modules/handoff/executors/lead-final-approval/gates.js so lib/-layer
 * consumers (e.g. the TESTING sub-agent) can resolve an SD's target repos without
 * importing from scripts/modules/handoff/executors/ (layering inversion).
 *
 * @module lib/sub-agents/repo-target-resolver
 */

import { resolveRepoPath, resolveGitHubRepo, ENGINEER_ROOT } from '../repo-paths.js';

/**
 * Get repository path by name
 * @param {string} repoName - Repository name
 * @returns {string} Repository path
 */
function getRepoPath(repoName) {
  return resolveRepoPath(repoName) || ENGINEER_ROOT;
}

/**
 * Compute the list of repos to scan for a given SD.
 *
 * SD-LEO-INFRA-CROSS-REPO-MERGE-001: Closes the gate-side phantom-branch class
 * where single-repo SDs were blocked by stale branches in the OTHER repo.
 *
 * Precedence:
 *   1. sd.metadata.target_repos[] — explicit allowlist (canonical for cross-repo SDs)
 *   2. sd.target_application — single-repo derivation (case-insensitive)
 *   3. fallback to both repos with WARN log (legacy SDs without metadata)
 *
 * @param {Object} sd - Strategic Directive record
 * @returns {Array<{githubRepo: string, localPath: string}>}
 */
export function computeReposForSD(sd) {
  const sdId = sd?.sd_key || sd?.id || 'unknown';
  const all = [
    { githubRepo: 'rickfelix/ehg', localPath: getRepoPath('EHG') },
    { githubRepo: 'rickfelix/EHG_Engineer', localPath: getRepoPath('EHG_Engineer') }
  ];

  // Tier 1: explicit metadata.target_repos[] allowlist
  const targetRepos = sd?.metadata?.target_repos;
  if (Array.isArray(targetRepos) && targetRepos.length > 0) {
    const allowed = targetRepos.map(r => String(r).toLowerCase().trim());
    const result = all.filter(r => {
      const shortName = r.githubRepo.split('/')[1].toLowerCase();
      return allowed.includes(shortName) || allowed.includes(r.githubRepo.toLowerCase());
    });
    if (result.length > 0) {
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd?.target_application || 'NULL'} target_repos=${JSON.stringify(targetRepos)} scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
  }

  // Tier 2: derived from target_application (case-insensitive)
  const ta = (typeof sd?.target_application === 'string') ? sd.target_application.toLowerCase().trim() : '';
  if (ta) {
    if (ta.includes('engineer')) {
      const result = [all[1]]; // EHG_Engineer only
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd.target_application} target_repos=NULL scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
    if (ta === 'ehg' || ta === 'app' || ta === 'application') {
      const result = [all[0]]; // EHG only
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd.target_application} target_repos=NULL scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
    // A venture target_application resolves to its SINGLE venture repo instead of
    // falling through to the Tier-3 both-platform-repos scan. github_repo + local_path
    // come from the registry mirror via the SYNC resolvers — computeReposForSD is
    // synchronous.
    const ventureGithub = resolveGitHubRepo(sd.target_application);
    const ventureLocal = resolveRepoPath(sd.target_application);
    if (ventureGithub && ventureLocal) {
      const result = [{ githubRepo: ventureGithub, localPath: ventureLocal }];
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd.target_application} resolved=venture scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
    // Venture github_repo/local_path unresolved — fall through to Tier 3
  }

  // Tier 3: legacy fallback — scan both repos with WARN
  console.warn(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} no target_application or target_repos — scanning both repos (legacy behavior)`);
  return all;
}
