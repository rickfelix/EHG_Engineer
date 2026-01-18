/**
 * Multi-Repository Manager
 *
 * Centralized module for managing multi-repository operations across the EHG ecosystem.
 * All commands that need multi-repo awareness should import from this module.
 *
 * Features:
 * - Repository discovery
 * - Git status checking (uncommitted changes, unpushed commits)
 * - Branch analysis
 * - SD-to-repo mapping
 * - Cross-repo coordination
 *
 * @module lib/multi-repo
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

// Base directory containing all EHG repos (parent of EHG_Engineer)
const EHG_BASE_DIR = resolve(__dirname, '../../..');

// Repos to permanently ignore
const IGNORED_REPOS = ['ehg-replit-archive', 'solara2', 'node_modules', '.git'];

// Known repositories with metadata
const KNOWN_REPOS = {
  ehg: {
    name: 'ehg',
    displayName: 'EHG (Frontend)',
    purpose: 'React/Vite frontend application',
    github: 'rickfelix/ehg',
    priority: 2,
    contains: ['UI components', 'pages', 'routes', 'React hooks']
  },
  EHG_Engineer: {
    name: 'EHG_Engineer',
    displayName: 'EHG_Engineer (Backend)',
    purpose: 'Backend tooling, CLI, and infrastructure',
    github: 'rickfelix/EHG_Engineer',
    priority: 1,
    contains: ['CLI tools', 'scripts', 'lib modules', 'database migrations']
  }
};

// Component type to repository mapping
const COMPONENT_REPO_MAP = {
  // Frontend components (EHG)
  'pages': 'ehg',
  'components': 'ehg',
  'routes': 'ehg',
  'hooks': 'ehg',
  'tsx': 'ehg',
  'ui': 'ehg',
  'frontend': 'ehg',

  // Backend components (EHG_Engineer)
  'scripts': 'EHG_Engineer',
  'lib': 'EHG_Engineer',
  'cli': 'EHG_Engineer',
  'skills': 'EHG_Engineer',
  'commands': 'EHG_Engineer',
  'migrations': 'EHG_Engineer',
  'api': 'EHG_Engineer',
  'backend': 'EHG_Engineer',
  'server': 'EHG_Engineer'
};

// =============================================================================
// REPOSITORY DISCOVERY
// =============================================================================

/**
 * Discover all git repositories in the EHG base directory
 * @returns {Object} Map of repo name to repo info
 */
export function discoverRepos() {
  const repos = {};

  try {
    const entries = readdirSync(EHG_BASE_DIR);

    for (const entry of entries) {
      if (IGNORED_REPOS.includes(entry) || entry.startsWith('.')) {
        continue;
      }

      const fullPath = join(EHG_BASE_DIR, entry);
      const gitPath = join(fullPath, '.git');

      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && existsSync(gitPath)) {
          // Get known metadata or create basic entry
          const known = KNOWN_REPOS[entry] || KNOWN_REPOS[entry.toLowerCase()];

          // Try to get GitHub remote
          let github = known?.github || `rickfelix/${entry}`;
          try {
            const remoteUrl = execSync('git remote get-url origin', {
              encoding: 'utf8',
              cwd: fullPath,
              timeout: 5000
            }).trim();

            const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
            if (match) {
              github = match[1];
            }
          } catch {
            // Use default
          }

          repos[entry] = {
            name: entry,
            displayName: known?.displayName || entry,
            purpose: known?.purpose || 'Unknown',
            path: fullPath,
            github,
            priority: known?.priority || 99,
            contains: known?.contains || []
          };
        }
      } catch {
        // Skip entries we can't access
      }
    }
  } catch (error) {
    console.error(`Error discovering repos: ${error.message}`);
  }

  return repos;
}

/**
 * Get the primary EHG repositories (ehg + EHG_Engineer)
 * @returns {Object} Map of primary repos
 */
export function getPrimaryRepos() {
  const all = discoverRepos();
  const primary = {};

  for (const [name, info] of Object.entries(all)) {
    if (name === 'ehg' || name === 'EHG_Engineer') {
      primary[name] = info;
    }
  }

  return primary;
}

// =============================================================================
// GIT STATUS
// =============================================================================

/**
 * Get git status for a repository
 * @param {string} repoPath - Path to repository
 * @returns {Object} Status information
 */
export function getRepoGitStatus(repoPath) {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd: repoPath,
      timeout: 5000
    }).trim();

    // Get status (porcelain for parsing)
    const statusOutput = execSync('git status --porcelain', {
      encoding: 'utf8',
      cwd: repoPath,
      timeout: 10000
    }).trim();

    // Parse status lines
    const changes = [];
    if (statusOutput) {
      for (const line of statusOutput.split('\n')) {
        if (!line.trim()) continue;

        const status = line.substring(0, 2);
        const file = line.substring(3);

        let changeType = 'modified';
        if (status.includes('?')) changeType = 'untracked';
        else if (status.includes('A')) changeType = 'added';
        else if (status.includes('D')) changeType = 'deleted';
        else if (status.includes('R')) changeType = 'renamed';
        else if (status.includes('M')) changeType = 'modified';

        changes.push({ status: status.trim(), file, changeType });
      }
    }

    // Check for unpushed commits
    let unpushedCount = 0;
    try {
      const unpushed = execSync(`git rev-list --count origin/${branch}..HEAD`, {
        encoding: 'utf8',
        cwd: repoPath,
        timeout: 5000
      }).trim();
      unpushedCount = parseInt(unpushed) || 0;
    } catch {
      // Branch might not have upstream
    }

    return {
      branch,
      changes,
      unpushedCount,
      hasUncommitted: changes.length > 0,
      hasUnpushed: unpushedCount > 0,
      isClean: changes.length === 0 && unpushedCount === 0
    };
  } catch (error) {
    return {
      error: error.message,
      branch: 'unknown',
      changes: [],
      unpushedCount: 0,
      hasUncommitted: false,
      hasUnpushed: false,
      isClean: true
    };
  }
}

/**
 * Get git status for all discovered repositories
 * @param {boolean} primaryOnly - Only check primary repos (ehg, EHG_Engineer)
 * @returns {Array} Status for each repo
 */
export function getAllReposStatus(primaryOnly = true) {
  const repos = primaryOnly ? getPrimaryRepos() : discoverRepos();
  const results = [];

  for (const [name, info] of Object.entries(repos)) {
    results.push({
      ...info,
      status: getRepoGitStatus(info.path)
    });
  }

  // Sort by priority
  return results.sort((a, b) => a.priority - b.priority);
}

/**
 * Check if any repository has uncommitted changes
 * @param {boolean} primaryOnly - Only check primary repos
 * @returns {Object} Summary of uncommitted changes
 */
export function checkUncommittedChanges(primaryOnly = true) {
  const statuses = getAllReposStatus(primaryOnly);

  const withChanges = statuses.filter(r => r.status.hasUncommitted || r.status.hasUnpushed);
  const clean = statuses.filter(r => r.status.isClean);

  return {
    hasChanges: withChanges.length > 0,
    totalRepos: statuses.length,
    reposWithChanges: withChanges,
    cleanRepos: clean,
    summary: withChanges.map(r => ({
      name: r.name,
      displayName: r.displayName,
      path: r.path,
      branch: r.status.branch,
      uncommittedCount: r.status.changes.length,
      unpushedCount: r.status.unpushedCount,
      changes: r.status.changes
    }))
  };
}

// =============================================================================
// SD-TO-REPO MAPPING
// =============================================================================

/**
 * Determine which repos are likely affected by an SD based on its type and title
 * @param {Object} sd - Strategic Directive object
 * @returns {Array} List of affected repo names
 */
export function getAffectedRepos(sd) {
  const affected = new Set();
  const title = (sd.title || '').toLowerCase();
  const description = (sd.description || '').toLowerCase();
  const sdType = (sd.sd_type || '').toLowerCase();

  // Check title and description for component keywords
  const text = `${title} ${description}`;

  for (const [keyword, repo] of Object.entries(COMPONENT_REPO_MAP)) {
    if (text.includes(keyword)) {
      affected.add(repo);
    }
  }

  // Type-based defaults
  const typeDefaults = {
    'feature': ['ehg', 'EHG_Engineer'], // Features often span both
    'bugfix': ['ehg', 'EHG_Engineer'],
    'api': ['EHG_Engineer'],
    'database': ['EHG_Engineer'],
    'infrastructure': ['EHG_Engineer'],
    'ui': ['ehg'],
    'ux_debt': ['ehg'],
    'documentation': ['EHG_Engineer'],
    'security': ['EHG_Engineer', 'ehg'],
    'performance': ['EHG_Engineer', 'ehg']
  };

  if (affected.size === 0 && typeDefaults[sdType]) {
    typeDefaults[sdType].forEach(r => affected.add(r));
  }

  // If still empty, assume both
  if (affected.size === 0) {
    affected.add('ehg');
    affected.add('EHG_Engineer');
  }

  return Array.from(affected);
}

/**
 * Check if an SD has uncommitted work in any affected repo
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Status of uncommitted work per repo
 */
export function checkSDRepoStatus(sd) {
  const affectedRepos = getAffectedRepos(sd);
  const allStatus = getAllReposStatus(true);

  const results = {
    sdId: sd.sd_key || sd.id,
    affectedRepos,
    repoStatus: [],
    hasUncommittedWork: false,
    recommendation: null
  };

  for (const repoName of affectedRepos) {
    const repoStatus = allStatus.find(r => r.name === repoName);
    if (repoStatus) {
      results.repoStatus.push({
        name: repoName,
        displayName: repoStatus.displayName,
        path: repoStatus.path,
        hasUncommitted: repoStatus.status.hasUncommitted,
        hasUnpushed: repoStatus.status.hasUnpushed,
        uncommittedCount: repoStatus.status.changes.length,
        unpushedCount: repoStatus.status.unpushedCount
      });

      if (repoStatus.status.hasUncommitted || repoStatus.status.hasUnpushed) {
        results.hasUncommittedWork = true;
      }
    }
  }

  // Generate recommendation
  if (results.hasUncommittedWork) {
    const reposWithWork = results.repoStatus.filter(r => r.hasUncommitted || r.hasUnpushed);
    results.recommendation = `Ship changes in ${reposWithWork.map(r => r.name).join(' and ')} before marking SD complete`;
  }

  return results;
}

// =============================================================================
// BRANCH OPERATIONS
// =============================================================================

/**
 * Find branches related to an SD across all repos
 * @param {string} sdId - SD identifier (e.g., SD-QUALITY-UI-001)
 * @returns {Array} Branches found in each repo
 */
export function findSDBranches(sdId) {
  const repos = getPrimaryRepos();
  const results = [];

  const branchPrefixes = ['feat/', 'fix/', 'docs/', 'test/', 'chore/', 'refactor/'];

  for (const [repoName, repoInfo] of Object.entries(repos)) {
    try {
      // Fetch latest
      execSync('git fetch --prune', {
        cwd: repoInfo.path,
        timeout: 30000,
        stdio: 'pipe'
      });

      // Get all branches (local and remote)
      const branchList = execSync('git branch -a', {
        encoding: 'utf8',
        cwd: repoInfo.path,
        timeout: 10000
      });

      const sdIdLower = sdId.toLowerCase();
      const matching = branchList.split('\n')
        .map(b => b.trim().replace('* ', '').replace('remotes/origin/', ''))
        .filter(b => b.toLowerCase().includes(sdIdLower))
        .filter(b => !b.includes('HEAD'))
        .filter((b, i, arr) => arr.indexOf(b) === i); // Dedupe

      for (const branch of matching) {
        // Check if merged
        let isMerged = false;
        try {
          execSync(`git merge-base --is-ancestor origin/${branch} origin/main 2>/dev/null || git merge-base --is-ancestor ${branch} main`, {
            cwd: repoInfo.path,
            timeout: 10000,
            stdio: 'pipe'
          });
          isMerged = true;
        } catch {
          isMerged = false;
        }

        // Get commit count
        let commitsAhead = 0;
        try {
          const count = execSync(`git rev-list --count main..${branch} 2>/dev/null || echo 0`, {
            encoding: 'utf8',
            cwd: repoInfo.path,
            timeout: 10000
          }).trim();
          commitsAhead = parseInt(count) || 0;
        } catch {
          // Ignore
        }

        results.push({
          repo: repoName,
          repoPath: repoInfo.path,
          branch,
          isMerged,
          commitsAhead,
          needsAction: !isMerged && commitsAhead > 0
        });
      }
    } catch (error) {
      // Skip repos with errors
    }
  }

  return results;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Format multi-repo status for display
 * @param {Object} status - Result from checkUncommittedChanges
 * @returns {string} Formatted string for console output
 */
export function formatStatusForDisplay(status) {
  const lines = [];

  lines.push('');
  lines.push('═'.repeat(60));
  lines.push('  MULTI-REPO STATUS');
  lines.push('═'.repeat(60));
  lines.push(`\n  Scanned ${status.totalRepos} repositories`);

  if (!status.hasChanges) {
    lines.push('\n  ✅ All repositories are clean');
    lines.push('     No uncommitted changes or unpushed commits\n');
    return lines.join('\n');
  }

  lines.push(`  ⚠️  Changes found in ${status.reposWithChanges.length} repo(s)\n`);

  for (const repo of status.summary) {
    lines.push('─'.repeat(60));
    lines.push(`📂 ${repo.displayName} (branch: ${repo.branch})`);

    if (repo.uncommittedCount > 0) {
      lines.push(`   📝 ${repo.uncommittedCount} uncommitted change(s):`);

      // Group by change type
      const byType = {};
      for (const change of repo.changes) {
        if (!byType[change.changeType]) byType[change.changeType] = [];
        byType[change.changeType].push(change.file);
      }

      for (const [type, files] of Object.entries(byType)) {
        const icon = type === 'untracked' ? '?' : type === 'added' ? '+' : type === 'deleted' ? '-' : 'M';
        for (const file of files.slice(0, 8)) {
          lines.push(`      ${icon} ${file}`);
        }
        if (files.length > 8) {
          lines.push(`      ... and ${files.length - 8} more ${type} files`);
        }
      }
    }

    if (repo.unpushedCount > 0) {
      lines.push(`   📤 ${repo.unpushedCount} unpushed commit(s)`);
    }
  }

  lines.push('\n' + '═'.repeat(60));
  lines.push('  RECOMMENDATIONS');
  lines.push('═'.repeat(60));

  for (const repo of status.summary) {
    if (repo.uncommittedCount > 0) {
      lines.push(`\n  📂 ${repo.name}:`);
      lines.push(`     cd ${repo.path}`);
      if (repo.branch === 'main') {
        lines.push('     git checkout -b feat/SD-XXX-description');
      }
      lines.push('     git add .');
      lines.push('     git commit -m "feat: description"');
      lines.push('     git push -u origin HEAD');
    } else if (repo.unpushedCount > 0) {
      lines.push(`\n  📂 ${repo.name}:`);
      lines.push(`     cd ${repo.path}`);
      lines.push('     git push');
    }
  }

  lines.push('\n' + '─'.repeat(60));
  lines.push('  ⚠️  Ship changes before marking SD complete');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format SD repo status for display
 * @param {Object} sdStatus - Result from checkSDRepoStatus
 * @returns {string} Formatted string
 */
export function formatSDStatusForDisplay(sdStatus) {
  const lines = [];

  lines.push('');
  lines.push('═'.repeat(60));
  lines.push(`  SD REPO STATUS: ${sdStatus.sdId}`);
  lines.push('═'.repeat(60));
  lines.push(`\n  Affected repos: ${sdStatus.affectedRepos.join(', ')}`);

  lines.push('\n┌────────────────┬─────────────┬─────────────┐');
  lines.push('│ Repository     │ Uncommitted │ Unpushed    │');
  lines.push('├────────────────┼─────────────┼─────────────┤');

  for (const repo of sdStatus.repoStatus) {
    const uncommitted = repo.hasUncommitted ? `${repo.uncommittedCount} files` : '✅ clean';
    const unpushed = repo.hasUnpushed ? `${repo.unpushedCount} commits` : '✅ clean';
    lines.push(`│ ${repo.name.padEnd(14)} │ ${uncommitted.padEnd(11)} │ ${unpushed.padEnd(11)} │`);
  }

  lines.push('└────────────────┴─────────────┴─────────────┘');

  if (sdStatus.hasUncommittedWork) {
    lines.push(`\n⚠️  ${sdStatus.recommendation}`);
  } else {
    lines.push('\n✅ All repos clean - ready for SD completion');
  }

  lines.push('');
  return lines.join('\n');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Configuration
  EHG_BASE_DIR,
  KNOWN_REPOS,
  COMPONENT_REPO_MAP,

  // Discovery
  discoverRepos,
  getPrimaryRepos,

  // Git Status
  getRepoGitStatus,
  getAllReposStatus,
  checkUncommittedChanges,

  // SD Mapping
  getAffectedRepos,
  checkSDRepoStatus,

  // Branches
  findSDBranches,

  // Display
  formatStatusForDisplay,
  formatSDStatusForDisplay
};
