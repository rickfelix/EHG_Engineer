/**
 * GitHub Sync Watcher
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (FR-3)
 *
 * Detects new commits on venture GitHub repos from Replit branches.
 * Updates venture_stage_work advisory_data with sync status.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Check a venture's GitHub repo for Replit commits.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {object} [options]
 * @param {string} [options.branch] - Specific branch to check (default: detect replit/*)
 * @returns {Promise<{synced: boolean, commitSha: string|null, branch: string|null, repoUrl: string|null, commitCount: number}>}
 */
export async function checkReplitSync(ventureId, options = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Get the venture's GitHub repo from venture_resources
  const { data: resource } = await supabase
    .from('venture_resources')
    .select('resource_url, metadata')
    .eq('venture_id', ventureId)
    .eq('resource_type', 'github_repo')
    .maybeSingle();

  if (!resource) {
    return { synced: false, commitSha: null, branch: null, repoUrl: null, commitCount: 0, error: 'No GitHub repo registered for venture' };
  }

  const repoUrl = resource.resource_url || resource.metadata?.repo_url;
  if (!repoUrl) {
    return { synced: false, commitSha: null, branch: null, repoUrl: null, commitCount: 0, error: 'GitHub repo URL not found in resource' };
  }

  // Extract owner/repo from URL
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (!match) {
    return { synced: false, commitSha: null, branch: null, repoUrl, commitCount: 0, error: `Cannot parse repo from URL: ${repoUrl}` };
  }
  const ownerRepo = match[1];

  try {
    // Check for replit/* branches
    const targetBranch = options.branch || null;
    let branchToCheck;

    if (targetBranch) {
      branchToCheck = targetBranch;
    } else {
      // List remote branches matching replit/*
      const branchOutput = execSync(
        `gh api repos/${ownerRepo}/branches --jq '.[].name' 2>/dev/null`,
        { encoding: 'utf-8', timeout: 15000 }
      ).trim();

      const replitBranches = branchOutput.split('\n').filter(b => b.startsWith('replit/'));
      if (replitBranches.length === 0) {
        return { synced: false, commitSha: null, branch: null, repoUrl, commitCount: 0 };
      }
      // Use the most recently active replit branch
      branchToCheck = replitBranches[replitBranches.length - 1];
    }

    // Get latest commit on the branch
    const commitOutput = execSync(
      `gh api repos/${ownerRepo}/commits?sha=${branchToCheck}&per_page=1 --jq '.[0].sha'`,
      { encoding: 'utf-8', timeout: 15000 }
    ).trim();

    if (!commitOutput || commitOutput === 'null') {
      return { synced: false, commitSha: null, branch: branchToCheck, repoUrl, commitCount: 0 };
    }

    // Count commits on the branch (compare to main)
    let commitCount = 0;
    try {
      const compareOutput = execSync(
        `gh api repos/${ownerRepo}/compare/main...${branchToCheck} --jq '.ahead_by'`,
        { encoding: 'utf-8', timeout: 15000 }
      ).trim();
      commitCount = parseInt(compareOutput, 10) || 0;
    } catch { /* non-fatal */ }

    return {
      synced: true,
      commitSha: commitOutput,
      branch: branchToCheck,
      repoUrl,
      commitCount,
    };
  } catch (err) {
    return { synced: false, commitSha: null, branch: null, repoUrl, commitCount: 0, error: err.message };
  }
}

/**
 * Update venture_stage_work with Replit sync status.
 *
 * @param {string} ventureId
 * @param {object} syncResult - Output from checkReplitSync
 * @returns {Promise<boolean>} true if updated
 */
export async function updateSyncStatus(ventureId, syncResult) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Read existing advisory_data
  const { data: existing } = await supabase
    .from('venture_stage_work')
    .select('advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 20)
    .maybeSingle();

  const advisoryData = existing?.advisory_data || {};

  // Update replit_sync section
  advisoryData.replit_sync = {
    last_commit_sha: syncResult.commitSha,
    branch: syncResult.branch,
    repo_url: syncResult.repoUrl,
    commit_count: syncResult.commitCount,
    synced: syncResult.synced,
    synced_at: syncResult.synced ? new Date().toISOString() : null,
    checked_at: new Date().toISOString(),
  };

  // Preserve build_method
  if (!advisoryData.build_method) {
    advisoryData.build_method = 'replit_agent';
  }

  const { error } = await supabase
    .from('venture_stage_work')
    .upsert({
      venture_id: ventureId,
      lifecycle_stage: 20,
      advisory_data: advisoryData,
      stage_status: syncResult.synced ? 'in_progress' : 'blocked',
      work_type: 'sd_required',
    }, { onConflict: 'venture_id,lifecycle_stage' });

  if (error) {
    console.error('Failed to update sync status:', error.message);
    return false;
  }
  return true;
}

// CLI entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const ventureId = process.argv[2];
  const branch = process.argv.find(a => a.startsWith('--branch='))?.split('=')[1];

  if (!ventureId) {
    console.error('Usage: node lib/eva/bridge/github-sync-watcher.js <venture-id> [--branch=replit/sprint-1]');
    process.exit(1);
  }

  checkReplitSync(ventureId, { branch })
    .then(async (result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.synced) {
        const updated = await updateSyncStatus(ventureId, result);
        console.log(updated ? 'Stage 20 advisory_data updated' : 'Failed to update advisory_data');
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
