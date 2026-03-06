/**
 * Anthropic Plugin Scanner
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
 *
 * Discovers Anthropic-authored plugins from GitHub repositories using Octokit.
 * Stores discovered plugins in anthropic_plugin_registry.
 */

import { Octokit } from '@octokit/rest';

// Anthropic org repos to scan (owner/repo format)
const ANTHROPIC_REPOS = [
  { owner: 'anthropics', repo: 'anthropic-cookbook', path: 'tool_use' },
  { owner: 'anthropics', repo: 'courses', path: 'tool_use' },
  { owner: 'anthropics', repo: 'anthropic-quickstarts', path: '' },
];

/**
 * Scan Anthropic GitHub repos for plugin-like content.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {string} [options.githubToken] - GitHub token (defaults to GITHUB_TOKEN env)
 * @returns {Promise<{discovered: number, errors: string[]}>}
 */
export async function scanAnthropicRepos(supabase, options = {}) {
  const token = options.githubToken || process.env.GITHUB_TOKEN;
  const octokit = new Octokit(token ? { auth: token } : {});
  const errors = [];
  let discovered = 0;

  for (const repo of ANTHROPIC_REPOS) {
    try {
      const items = await listRepoContents(octokit, repo);

      for (const item of items) {
        if (!isPluginCandidate(item)) continue;

        const { error } = await supabase
          .from('anthropic_plugin_registry')
          .upsert({
            plugin_name: item.name,
            source_repo: `${repo.owner}/${repo.repo}`,
            source_path: item.path,
            source_commit: item.sha || null,
            status: 'discovered',
            last_scanned_at: new Date().toISOString(),
          }, { onConflict: 'source_repo,plugin_name' });

        if (error) {
          errors.push(`Upsert ${item.name}: ${error.message}`);
        } else {
          discovered++;
        }
      }
    } catch (err) {
      const msg = `Repo ${repo.owner}/${repo.repo}: ${err.status === 404 ? 'not found or private' : err.message}`;
      errors.push(msg);
    }
  }

  return { discovered, errors };
}

/**
 * List contents of a repo directory.
 */
async function listRepoContents(octokit, { owner, repo, path }) {
  const params = { owner, repo };
  if (path) params.path = path;

  const { data } = await octokit.repos.getContent(params);
  return Array.isArray(data) ? data : [data];
}

/**
 * Check if a GitHub content item looks like a plugin/tool.
 * Plugins are directories (type=dir) or files matching known patterns.
 */
function isPluginCandidate(item) {
  if (item.type === 'dir') return true;
  const name = item.name.toLowerCase();
  return name.endsWith('.json') || name.endsWith('.yaml') || name.endsWith('.yml');
}

export { ANTHROPIC_REPOS };
