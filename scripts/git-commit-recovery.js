#!/usr/bin/env node

/**
 * Git Commit Recovery Tool
 *
 * SD: SD-LEO-FIX-MULTI-SESSION-SHIP-001 (Pillar 3)
 *
 * Scans git reflog for orphaned commits that aren't reachable
 * from any branch. Useful for recovering work lost during
 * cross-session branch contamination incidents.
 *
 * Usage:
 *   node scripts/git-commit-recovery.js              # Scan last 24h
 *   node scripts/git-commit-recovery.js --hours 48   # Scan last 48h
 *   node scripts/git-commit-recovery.js --recover <SHA>  # Recover specific commit
 */

import { execSync } from 'child_process';

const HOURS = getHoursArg();
const RECOVER_SHA = getRecoverArg();

function getHoursArg() {
  const idx = process.argv.indexOf('--hours');
  return idx !== -1 ? parseInt(process.argv[idx + 1]) || 24 : 24;
}

function getRecoverArg() {
  const idx = process.argv.indexOf('--recover');
  return idx !== -1 ? process.argv[idx + 1] : null;
}

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function _getAllBranchTips() {
  const output = exec('git for-each-ref --format="%(objectname)" refs/heads/ refs/remotes/');
  return new Set(output.split('\n').filter(Boolean));
}

function isReachableFromAnyBranch(sha) {
  try {
    // Check both local and remote branches (git branch -a)
    const result = exec(`git branch -a --contains ${sha} 2>/dev/null`);
    return result.length > 0;
  } catch {
    return false;
  }
}

function getReflogEntries(hours) {
  const since = `${hours} hours ago`;
  const output = exec(`git reflog --format="%H %gd %gs" --since="${since}"`);
  return output.split('\n').filter(Boolean).map(line => {
    const [sha, refEntry, ...rest] = line.split(' ');
    return { sha, refEntry, description: rest.join(' ') };
  });
}

function getCommitInfo(sha) {
  const format = '%H%n%h%n%s%n%an%n%ar%n%ai';
  const output = exec(`git log -1 --format="${format}" ${sha}`);
  const [fullSha, shortSha, subject, author, relDate, absDate] = output.split('\n');
  const files = exec(`git diff-tree --no-commit-id --name-only -r ${sha}`);
  return {
    sha: fullSha,
    shortSha,
    subject,
    author,
    relDate,
    absDate,
    files: files.split('\n').filter(Boolean)
  };
}

function recoverCommit(sha) {
  const info = getCommitInfo(sha);
  if (!info.sha) {
    console.error(`\n  ❌ Commit ${sha} not found`);
    process.exit(1);
  }

  const branchName = `recovery/${info.shortSha}-${Date.now()}`;
  console.log('\n  🔧 RECOVERING COMMIT');
  console.log('  ' + '─'.repeat(50));
  console.log(`  SHA:     ${info.sha}`);
  console.log(`  Message: ${info.subject}`);
  console.log(`  Author:  ${info.author}`);
  console.log(`  Date:    ${info.relDate}`);
  console.log(`  Files:   ${info.files.length}`);
  console.log('');

  try {
    execSync(`git branch ${branchName} ${sha}`, { encoding: 'utf8' });
    console.log(`  ✅ Created recovery branch: ${branchName}`);
    console.log('');
    console.log('  Next steps:');
    console.log(`    git checkout ${branchName}    # Review the recovered work`);
    console.log(`    git cherry-pick ${info.shortSha}  # Or cherry-pick onto current branch`);
    console.log(`    git branch -D ${branchName}   # Delete recovery branch when done`);
  } catch (err) {
    console.error(`  ❌ Recovery failed: ${err.message}`);
    process.exit(1);
  }
}

function scanForOrphans() {
  console.log('\n  🔍 GIT COMMIT RECOVERY SCANNER');
  console.log('  ' + '═'.repeat(50));
  console.log(`  Scanning reflog for last ${HOURS} hours...`);
  console.log('');

  const entries = getReflogEntries(HOURS);
  if (entries.length === 0) {
    console.log('  ℹ️  No reflog entries found in the specified time range.');
    return;
  }

  console.log(`  📋 Found ${entries.length} reflog entries`);

  // Deduplicate by SHA
  const seen = new Set();
  const uniqueEntries = entries.filter(e => {
    if (seen.has(e.sha)) return false;
    seen.add(e.sha);
    return true;
  });

  // Find orphaned commits (not reachable from any branch)
  const orphans = [];
  for (const entry of uniqueEntries) {
    if (!isReachableFromAnyBranch(entry.sha)) {
      const info = getCommitInfo(entry.sha);
      if (info.sha && info.subject) {
        orphans.push({ ...entry, ...info });
      }
    }
  }

  if (orphans.length === 0) {
    console.log('\n  ✅ No orphaned commits found. All work is reachable from branches.');
    return;
  }

  console.log(`\n  ⚠️  Found ${orphans.length} ORPHANED commit(s):\n`);
  console.log('  ' + '─'.repeat(70));

  for (const orphan of orphans) {
    console.log(`  ${orphan.shortSha}  ${orphan.relDate.padEnd(15)} ${orphan.subject.substring(0, 50)}`);
    console.log(`  ${''.padEnd(8)} Files: ${orphan.files.slice(0, 3).join(', ')}${orphan.files.length > 3 ? ` (+${orphan.files.length - 3} more)` : ''}`);
    console.log('');
  }

  console.log('  ' + '─'.repeat(70));
  console.log('\n  Recovery commands:');
  for (const orphan of orphans) {
    console.log(`    node scripts/git-commit-recovery.js --recover ${orphan.shortSha}`);
  }
  console.log('');
}

// Main
if (RECOVER_SHA) {
  recoverCommit(RECOVER_SHA);
} else {
  scanForOrphans();
}
