#!/usr/bin/env node

/**
 * Verify Last 6 Completed SDs - GitHub Sync Status
 *
 * Purpose: Verify that the last 6 completed Strategic Directives have their
 * code changes properly synced to GitHub's main branch
 *
 * Steps:
 * 1. Query database for last 6 completed SDs
 * 2. Check git log for commits with SD-ID in both repos
 * 3. Verify commits are on main branch
 * 4. Confirm remote sync status
 * 5. Spot check key deliverable files
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Repository paths
const REPOS = {
  EHG: '../ehg',
  EHG_Engineer: '.'
};

/**
 * Execute git command in a specific repository
 */
function gitCommand(repo, command) {
  try {
    const result = execSync(`git -C ${repo} ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: result.trim() };
  } catch (_error) {
    return { success: false, error: error.message, output: error.stdout?.trim() || '' };
  }
}

/**
 * Get last 6 completed Strategic Directives from database
 */
async function getLastCompletedSDs() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, updated_at, created_at')
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(6);

  if (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Search for commits with SD-ID in main branch
 */
function findCommitsForSD(repo, sdId) {
  const result = gitCommand(repo, `log main --grep="${sdId}" --oneline`);
  if (!result.success) {
    return { commits: [], error: result.error };
  }

  const commits = result.output
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^(\w+)\s+(.+)$/);
      return match ? { hash: match[1], message: match[2] } : null;
    })
    .filter(Boolean);

  return { commits, error: null };
}

/**
 * Check if main branch is synced with origin/main
 */
function checkRemoteSync(repo) {
  // First, fetch latest from remote
  gitCommand(repo, 'fetch origin main');

  // Check if there are unpushed commits
  const result = gitCommand(repo, 'log origin/main..main --oneline');

  if (!result.success) {
    return { synced: false, error: result.error, unpushedCommits: [] };
  }

  const unpushedCommits = result.output
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.trim());

  return {
    synced: unpushedCommits.length === 0,
    unpushedCommits,
    error: null
  };
}

/**
 * Check if specific files exist in main branch
 */
function checkFileExists(repo, filePath) {
  try {
    const fullPath = path.join(repo, filePath);
    return fs.existsSync(fullPath);
  } catch (_error) {
    return false;
  }
}

/**
 * Get common file patterns to check based on SD type
 */
function getExpectedFiles(sdId, _sdTitle) {
  const files = [];

  // Check for PRD files
  files.push(`docs/prd/PRD-${sdId}.md`);

  // Check for handoff files
  files.push(`docs/handoffs/${sdId}-LEAD-to-PLAN.md`);
  files.push(`docs/handoffs/${sdId}-EXEC-to-PLAN.md`);

  // Check for retrospective
  files.push(`docs/retrospectives/RETRO-${sdId}.md`);

  // Check for scripts (common pattern)
  const scriptName = sdId.toLowerCase().replace(/sd-/, '').replace(/-/g, '-');
  files.push(`scripts/${scriptName}.js`);

  return files;
}

/**
 * Get detailed commit info for verification
 */
function _getCommitDetails(repo, commitHash) {
  const result = gitCommand(repo, `show ${commitHash} --stat --oneline`);
  return result.success ? result.output : null;
}

/**
 * Main verification function
 */
async function verifySDsGitHubSync() {
  console.log('='.repeat(80));
  console.log('STRATEGIC DIRECTIVES GITHUB SYNC VERIFICATION');
  console.log('='.repeat(80));
  console.log();

  // Step 1: Get last 6 completed SDs from database
  console.log('Step 1: Querying database for last 6 completed SDs...');
  const completedSDs = await getLastCompletedSDs();

  if (completedSDs.length === 0) {
    console.log('❌ No completed SDs found in database');
    return;
  }

  console.log(`✅ Found ${completedSDs.length} completed SDs`);
  console.log();

  // Step 2: Check remote sync status for both repos
  console.log('Step 2: Checking remote sync status...');
  console.log();

  const syncStatus = {};
  for (const [repoName, repoPath] of Object.entries(REPOS)) {
    console.log(`Checking ${repoName}...`);
    const sync = checkRemoteSync(repoPath);
    syncStatus[repoName] = sync;

    if (sync.synced) {
      console.log(`  ✅ ${repoName}: Synced with origin/main`);
    } else if (sync.error) {
      console.log(`  ⚠️  ${repoName}: Error checking sync - ${sync.error}`);
    } else {
      console.log(`  ⚠️  ${repoName}: ${sync.unpushedCommits.length} unpushed commit(s)`);
      sync.unpushedCommits.slice(0, 3).forEach(commit => {
        console.log(`      - ${commit}`);
      });
    }
  }
  console.log();

  // Step 3: Verify each SD
  console.log('Step 3: Verifying individual SDs...');
  console.log('='.repeat(80));
  console.log();

  const results = [];

  for (const sd of completedSDs) {
    console.log(`SD: ${sd.id}`);
    console.log(`Title: ${sd.title}`);
    console.log(`Completed: ${new Date(sd.updated_at).toLocaleString()}`);
    console.log('-'.repeat(80));

    const sdResult = {
      id: sd.id,
      title: sd.title,
      completedAt: sd.updated_at,
      repos: {}
    };

    // Check commits in both repositories
    for (const [repoName, repoPath] of Object.entries(REPOS)) {
      console.log(`\n  Repository: ${repoName}`);

      const { commits, error } = findCommitsForSD(repoPath, sd.id);

      if (error) {
        console.log(`    ❌ Error searching commits: ${error}`);
        sdResult.repos[repoName] = { error, commits: [] };
        continue;
      }

      if (commits.length === 0) {
        console.log('    ⚠️  No commits found on main branch');
        sdResult.repos[repoName] = { commits: [], status: 'no_commits' };
      } else {
        console.log(`    ✅ Found ${commits.length} commit(s) on main branch:`);
        commits.forEach((commit, idx) => {
          console.log(`       ${idx + 1}. ${commit.hash} - ${commit.message}`);
        });
        sdResult.repos[repoName] = { commits, status: 'found' };
      }

      // Check for expected files (only in EHG_Engineer for now)
      if (repoName === 'EHG_Engineer') {
        const expectedFiles = getExpectedFiles(sd.id, sd.title);
        const existingFiles = expectedFiles.filter(file => checkFileExists(repoPath, file));

        if (existingFiles.length > 0) {
          console.log(`\n    Files verified (${existingFiles.length}/${expectedFiles.length}):`);
          existingFiles.forEach(file => {
            console.log(`       ✅ ${file}`);
          });
          sdResult.repos[repoName].files = existingFiles;
        }
      }
    }

    results.push(sdResult);
    console.log();
    console.log('='.repeat(80));
    console.log();
  }

  // Step 4: Generate summary report
  console.log('\n\n');
  console.log('='.repeat(80));
  console.log('SUMMARY REPORT');
  console.log('='.repeat(80));
  console.log();

  console.log('Remote Sync Status:');
  for (const [repoName, sync] of Object.entries(syncStatus)) {
    const icon = sync.synced ? '✅' : '⚠️';
    const status = sync.synced ? 'SYNCED' : `${sync.unpushedCommits.length} UNPUSHED`;
    console.log(`  ${icon} ${repoName}: ${status}`);
  }
  console.log();

  console.log('SD Verification Summary:');
  results.forEach((result, _idx) => {
    const engineerCommits = result.repos.EHG_Engineer?.commits?.length || 0;
    const ehgCommits = result.repos.EHG?.commits?.length || 0;
    const totalCommits = engineerCommits + ehgCommits;

    const icon = totalCommits > 0 ? '✅' : '⚠️';
    console.log(`  ${icon} ${result.id}: ${totalCommits} commit(s) (Engineer: ${engineerCommits}, EHG: ${ehgCommits})`);
  });
  console.log();

  // Identify issues
  const sdsWithNoCommits = results.filter(r => {
    const engineerCommits = r.repos.EHG_Engineer?.commits?.length || 0;
    const ehgCommits = r.repos.EHG?.commits?.length || 0;
    return engineerCommits === 0 && ehgCommits === 0;
  });

  if (sdsWithNoCommits.length > 0) {
    console.log('⚠️  SDs with NO commits found on main:');
    sdsWithNoCommits.forEach(sd => {
      console.log(`     - ${sd.id}: ${sd.title}`);
    });
    console.log();
  }

  const hasUnpushedCommits = Object.values(syncStatus).some(s => !s.synced && !s.error);
  if (hasUnpushedCommits) {
    console.log('⚠️  WARNING: Some repositories have unpushed commits');
    console.log('     Run "git push origin main" in affected repositories');
    console.log();
  }

  // Final verdict
  console.log('='.repeat(80));
  if (sdsWithNoCommits.length === 0 && !hasUnpushedCommits) {
    console.log('✅ VERIFICATION PASSED: All completed SDs are synced to GitHub main');
  } else {
    console.log('⚠️  VERIFICATION INCOMPLETE: Issues detected (see above)');
  }
  console.log('='.repeat(80));

  return results;
}

// Run verification
verifySDsGitHubSync()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
