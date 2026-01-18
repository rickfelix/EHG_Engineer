#!/usr/bin/env node
/**
 * Multi-Repo Status Check
 *
 * Scans all EHG repositories for uncommitted changes before shipping.
 * This catches the common case where work spans multiple repos but only
 * one repo is being shipped.
 *
 * Usage:
 *   node scripts/multi-repo-status.js              # Check all repos
 *   node scripts/multi-repo-status.js --json       # JSON output
 *   node scripts/multi-repo-status.js --quiet      # Only show if issues found
 *
 * Exit codes:
 *   0 - No uncommitted changes found
 *   1 - Uncommitted changes found in one or more repos
 *
 * @module multi-repo-status
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base directory containing all EHG repos
const EHG_BASE_DIR = resolve(__dirname, '../..');

// Repos to ignore (archive/inactive)
const IGNORED_REPOS = ['ehg-replit-archive', 'solara2', 'node_modules', '.git'];

// Parse arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    quiet: args.includes('--quiet'),
    help: args.includes('--help') || args.includes('-h')
  };
}

// Discover git repositories
function discoverRepos() {
  const repos = [];

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
          repos.push({
            name: entry,
            path: fullPath
          });
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

// Get git status for a repo
function getRepoStatus(repoPath) {
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

        changes.push({ status, file, changeType });
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
      hasUnpushed: unpushedCount > 0
    };
  } catch (error) {
    return {
      error: error.message,
      branch: 'unknown',
      changes: [],
      unpushedCount: 0,
      hasUncommitted: false,
      hasUnpushed: false
    };
  }
}

// Categorize files by likely SD relationship
function categorizeChanges(changes) {
  const categories = {
    quality: [],
    api: [],
    ui: [],
    config: [],
    docs: [],
    other: []
  };

  for (const change of changes) {
    const file = change.file.toLowerCase();

    if (file.includes('quality') || file.includes('feedback') || file.includes('triage')) {
      categories.quality.push(change);
    } else if (file.includes('api') || file.includes('server') || file.includes('route')) {
      categories.api.push(change);
    } else if (file.includes('component') || file.includes('page') || file.includes('.tsx')) {
      categories.ui.push(change);
    } else if (file.includes('config') || file.includes('.json') || file.includes('.md')) {
      categories.config.push(change);
    } else if (file.includes('doc') || file.includes('readme')) {
      categories.docs.push(change);
    } else {
      categories.other.push(change);
    }
  }

  return categories;
}

// Print results
function printResults(results, options) {
  const reposWithChanges = results.filter(r => r.status.hasUncommitted || r.status.hasUnpushed);

  if (options.json) {
    console.log(JSON.stringify({
      totalRepos: results.length,
      reposWithChanges: reposWithChanges.length,
      repos: results.map(r => ({
        name: r.name,
        path: r.path,
        branch: r.status.branch,
        uncommittedCount: r.status.changes.length,
        unpushedCount: r.status.unpushedCount,
        changes: r.status.changes
      }))
    }, null, 2));
    return;
  }

  if (reposWithChanges.length === 0) {
    if (!options.quiet) {
      console.log('\n' + '═'.repeat(60));
      console.log('  MULTI-REPO STATUS CHECK');
      console.log('═'.repeat(60));
      console.log(`\n  Scanned ${results.length} repositories`);
      console.log('\n  ✅ All repositories are clean');
      console.log('     No uncommitted changes or unpushed commits found\n');
    }
    return;
  }

  // Print header
  console.log('\n' + '═'.repeat(60));
  console.log('  MULTI-REPO STATUS CHECK');
  console.log('═'.repeat(60));
  console.log(`\n  Scanned ${results.length} repositories`);
  console.log(`  ⚠️  Found changes in ${reposWithChanges.length} repo(s)\n`);

  // Print each repo with changes
  for (const repo of reposWithChanges) {
    const { name, status } = repo;

    console.log('─'.repeat(60));
    console.log(`📂 ${name} (branch: ${status.branch})`);

    if (status.hasUncommitted) {
      console.log(`   📝 ${status.changes.length} uncommitted change(s):`);

      // Group by change type for cleaner output
      const byType = {};
      for (const change of status.changes) {
        if (!byType[change.changeType]) byType[change.changeType] = [];
        byType[change.changeType].push(change.file);
      }

      for (const [type, files] of Object.entries(byType)) {
        const icon = type === 'untracked' ? '?' : type === 'added' ? '+' : type === 'deleted' ? '-' : 'M';
        for (const file of files.slice(0, 10)) { // Limit to 10 per type
          console.log(`      ${icon} ${file}`);
        }
        if (files.length > 10) {
          console.log(`      ... and ${files.length - 10} more ${type} files`);
        }
      }
    }

    if (status.hasUnpushed) {
      console.log(`   📤 ${status.unpushedCount} unpushed commit(s)`);
    }
  }

  // Print summary and recommendations
  console.log('\n' + '═'.repeat(60));
  console.log('  RECOMMENDATIONS');
  console.log('═'.repeat(60));

  for (const repo of reposWithChanges) {
    const { name, path, status } = repo;

    if (status.hasUncommitted) {
      console.log(`\n  📂 ${name}:`);
      console.log(`     cd ${path}`);
      if (status.branch === 'main') {
        console.log('     git checkout -b feat/SD-XXX-description  # Create feature branch');
      }
      console.log('     git add .');
      console.log('     git commit -m "feat: description"');
      console.log('     git push -u origin HEAD');
    } else if (status.hasUnpushed) {
      console.log(`\n  📂 ${name}:`);
      console.log(`     cd ${path}`);
      console.log('     git push');
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('  ⚠️  Ship these changes before or with current work to avoid');
  console.log('     leaving related changes uncommitted across repositories.');
  console.log('');
}

// Main
async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
Multi-Repo Status Check

Scans all EHG repositories for uncommitted changes before shipping.

Usage:
  node scripts/multi-repo-status.js              # Check all repos
  node scripts/multi-repo-status.js --json       # JSON output
  node scripts/multi-repo-status.js --quiet      # Only show if issues found
  node scripts/multi-repo-status.js --help       # Show this help

Exit codes:
  0 - No uncommitted changes found
  1 - Uncommitted changes found in one or more repos
`);
    process.exit(0);
  }

  // Discover repos
  const repos = discoverRepos();

  if (repos.length === 0) {
    console.error('No repositories found in', EHG_BASE_DIR);
    process.exit(1);
  }

  // Check each repo
  const results = repos.map(repo => ({
    ...repo,
    status: getRepoStatus(repo.path)
  }));

  // Print results
  printResults(results, options);

  // Exit with appropriate code
  const hasChanges = results.some(r => r.status.hasUncommitted || r.status.hasUnpushed);
  process.exit(hasChanges ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
