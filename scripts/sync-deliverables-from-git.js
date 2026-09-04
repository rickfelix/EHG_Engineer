#!/usr/bin/env node
/**
 * Sync Deliverables from Git (US-007)
 *
 * Part of SD-DELIVERABLES-V2-001 Phase 3 - Real-Time Tracking
 * Parses git commits and matches changed files to deliverables.
 *
 * Features:
 * - Parses commits on SD branch since PLAN→EXEC handoff
 * - Matches file paths to deliverable patterns
 * - Updates completion_status with commit_hash as evidence
 * - Logs file operations to sd_exec_file_operations table
 *
 * Usage:
 *   node scripts/sync-deliverables-from-git.js <SD-ID> [--repo-path /path/to/repo]
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolveRepoPath } from '../lib/repo-paths.js';
import { anchoredKeyPattern } from '../lib/drive-loop/score/leg1-landed-alocal.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ROOT = resolveRepoPath('ehg');

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// File pattern to deliverable type mapping
const FILE_TYPE_PATTERNS = {
  database: [
    /\.sql$/,
    /migrations?\//,
    /schema\//,
    /database\//
  ],
  ui_feature: [
    /\.tsx$/,
    /\.jsx$/,
    /components?\//,
    /pages?\//,
    /views?\//
  ],
  api: [
    /api\//,
    /routes?\//,
    /controllers?\//,
    /endpoints?\//
  ],
  test: [
    /\.test\./,
    /\.spec\./,
    /tests?\//,
    /__tests__\//
  ],
  documentation: [
    /\.md$/,
    /docs?\//,
    /README/
  ],
  configuration: [
    /\.config\./,
    /\.env/,
    /package\.json/,
    /tsconfig/
  ]
};

/**
 * Infer deliverable type from file path
 */
function inferTypeFromPath(filePath) {
  for (const [type, patterns] of Object.entries(FILE_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        return type;
      }
    }
  }
  return 'other';
}

/**
 * Parse git commits for an SD
 */
function getGitCommits(sdId, repoPath, sinceBranch = 'main') {
  // Get commits on the SD branch that aren't on main
  const branchName = `feat/${sdId}`;
  let verifiedBranch = branchName;

  // First check if branch exists
  try {
    execSync(`git -C "${repoPath}" rev-parse --verify ${branchName}`, { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    console.log(`   ℹ️  Branch ${branchName} not found, trying alternate patterns...`);
    // Try to find a branch containing the SD-ID
    const branches = execSync(`git -C "${repoPath}" branch -a`, { encoding: 'utf-8' });
    const matchingBranch = branches.split('\n').find(b => b.includes(sdId));
    if (!matchingBranch) {
      return [];
    }
    // DEFECT 1 fix (QF-20260903-950): use the branch that was actually verified to exist,
    // never HEAD -- HEAD may point anywhere (main, a different worktree's branch, detached)
    // and has no relationship to the SD whose commits were asked for. Trim only the `git
    // branch -a` list decoration (leading "* " / indentation); a "remotes/origin/..." line is
    // left as-is -- that literal text is already a valid, directly resolvable git revision
    // (refs/remotes/origin/...), whereas stripping the remote prefix down to a bare branch name
    // would break resolution whenever no local branch of that name exists.
    verifiedBranch = matchingBranch.replace(/^\*?\s+/, '').trim();
  }

  // DEFECT 2 fix (QF-20260903-950): the previous command embedded a shell-level
  // `2>/dev/null || echo ""` inside the execSync string. execSync shells out via cmd.exe on
  // Windows, which has no /dev/null and cannot parse that redirect -- the git command fails,
  // the `|| echo ""` swallows the failure into an empty string, and the caller reads
  // "no commits found" (exit 0) for what was actually a crash. Let a real command failure
  // throw here -- there is no surrounding try/catch left in this function, so it propagates to
  // main()'s own .catch(), which logs it and exits non-zero, instead of being read as a
  // legitimate empty result.
  const logOutput = execSync(
    `git -C "${repoPath}" log ${sinceBranch}..${verifiedBranch} --name-status --pretty=format:"%H|%s|%ai"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  return parseCommitLog(logOutput);
}

/**
 * Parse `git log`/`git show --name-status --pretty=format:"%H|%s|%ai"` output into commit
 * objects. Shared by the branch-diff path (getGitCommits) and the main-history-by-subject path
 * (getMainHistoryCommits, DEFECT 3 fix) so both read the identical header+file-line shape one way.
 *
 * DEFECT (found while fixing QF-20260903-950's named defects 1-3, not one of the three itself --
 * called out separately per the QF's own "must not be collapsed into one" instruction): the prior
 * header-detection predicate here was `line.includes('|') && line.length === 40 +
 * line.indexOf('|') - 40 + line.length - line.lastIndexOf('|')`, which algebraically reduces to
 * `line.indexOf('|') === line.lastIndexOf('|')` -- true only when a line contains exactly ONE
 * '|' character. A real "%H|%s|%ai" header line always carries at least two, so this was
 * unsatisfiable for every genuine header line: `currentCommit` was never initialized and no
 * commit or file was ever parsed, independent of defects 1-3. Verified with a standalone
 * reproduction (a realistic 3-field header line evaluates the predicate to false). Fixed to
 * check the hash shape directly instead.
 */
function parseCommitLog(logOutput) {
  if (!logOutput || !logOutput.trim()) {
    return [];
  }

  const commits = [];
  let currentCommit = null;

  for (const line of logOutput.split('\n')) {
    if (!line.trim()) continue;

    const parts = line.split('|');
    if (parts.length >= 3 && /^[0-9a-f]{40}$/i.test(parts[0])) {
      if (currentCommit) {
        commits.push(currentCommit);
      }
      currentCommit = {
        hash: parts[0],
        message: parts[1],
        date: parts[2],
        files: []
      };
      continue;
    }

    // Parse file change line (A/M/D followed by tab and filename)
    const fileMatch = line.match(/^([AMD])\t(.+)$/);
    if (fileMatch && currentCommit) {
      currentCommit.files.push({
        operation: fileMatch[1] === 'A' ? 'create' : fileMatch[1] === 'M' ? 'modify' : 'delete',
        path: fileMatch[2]
      });
    }
  }

  if (currentCommit) {
    commits.push(currentCommit);
  }

  return commits;
}

/**
 * DEFECT 3 fix (QF-20260903-950): a branch-diff range (sinceBranch..branch) goes structurally
 * empty once a PR is squash-merged -- the branch tip becomes an ancestor of main (or the branch
 * is deleted entirely, the standard --delete-branch flow in this repo), so "commits unique to
 * the branch" finds nothing for exactly the SDs that are arriving at completion. Repairing the
 * branch-handling/redirect defects alone would still read a correct empty answer to the wrong
 * question -- the evidence model itself has to widen.
 *
 * Widens the corpus the same way the chairman-ratified drive_score leg1 amendment did
 * (lib/drive-loop/score/leg1-landed-alocal.js, decision dc828e43, "the corpus widens to EVERY
 * commit subject on main, not merge commits only"): search every commit subject on main for an
 * end-anchored match on the SD key (reusing that same ratified anchoredKeyPattern, so parent/child
 * key collisions like SD-X-001 vs SD-X-001-B are guarded identically), then read each matched
 * commit's own file changes directly via `git show` -- a single commit has no "range" to go empty.
 */
function getMainHistoryCommits(sdKey, repoPath, mainBranch = 'main') {
  const subjectsRaw = execSync(
    `git -C "${repoPath}" log ${mainBranch} --format="%H|%s"`,
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );

  const pattern = anchoredKeyPattern(sdKey);
  const matchedHashes = subjectsRaw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const i = line.indexOf('|');
      return { hash: line.slice(0, i), subject: line.slice(i + 1) };
    })
    .filter(({ subject }) => pattern.test(subject))
    .map(({ hash }) => hash);

  const commits = [];
  for (const hash of matchedHashes) {
    const showOutput = execSync(
      `git -C "${repoPath}" show ${hash} --name-status --pretty=format:"%H|%s|%ai"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    commits.push(...parseCommitLog(showOutput));
  }
  return commits;
}

/**
 * Match file to deliverable using pattern matching
 */
function matchFileToDeliverable(filePath, deliverables) {
  const fileName = path.basename(filePath);
  const fileType = inferTypeFromPath(filePath);

  // Score each deliverable for match quality
  const scores = deliverables.map(d => {
    let score = 0;
    const nameWords = d.deliverable_name.toLowerCase().split(/\s+/);
    const pathWords = filePath.toLowerCase().split(/[\/\\._-]/);

    // Type match (high weight)
    if (d.deliverable_type === fileType) {
      score += 30;
    }

    // Keyword match in path
    for (const word of nameWords) {
      if (word.length > 3 && pathWords.some(pw => pw.includes(word) || word.includes(pw))) {
        score += 20;
      }
    }

    // Filename direct match
    if (nameWords.some(w => fileName.toLowerCase().includes(w))) {
      score += 25;
    }

    return { deliverable: d, score };
  });

  // Get best match above threshold
  const threshold = 40;
  const bestMatch = scores.sort((a, b) => b.score - a.score)[0];

  if (bestMatch && bestMatch.score >= threshold) {
    return {
      deliverable: bestMatch.deliverable,
      confidence: Math.min(100, bestMatch.score)
    };
  }

  return null;
}

/**
 * Sync deliverables from git history
 */
async function syncDeliverables(sdId, options = {}) {
  const { repoPath = EHG_ROOT, silent = false } = options;

  // QF-20260705-859: callers pass either an sd_key or a UUID, but sd_phase_handoffs /
  // sd_scope_deliverables store the UUID while git branches carry the sd_key. The raw
  // arg previously went straight into .eq('sd_id', ...) — an sd_key matched zero rows
  // and the script reported a vacuous "All deliverables already completed".
  const { resolveSdInput } = await import('./lib/sd-id-resolver.js');
  const { sdId: sdUuid, sdKey } = await resolveSdInput(sdId, supabase);

  if (!silent) {
    console.log('\n📊 Sync Deliverables from Git');
    console.log(`   SD: ${sdKey} (${sdUuid})`);
    console.log(`   Repository: ${repoPath}`);
    console.log('='.repeat(60));
  }

  // Get PLAN→EXEC handoff timestamp to filter commits
  const { data: handoff } = await supabase
    .from('sd_phase_handoffs')
    .select('created_at')
    .eq('sd_id', sdUuid)
    .eq('handoff_type', 'PLAN-TO-EXEC')
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!handoff) {
    if (!silent) console.log('   ⚠️  No PLAN-TO-EXEC handoff found - using all commits');
  }

  // Get deliverables for this SD
  const { data: deliverables, error: delError } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, deliverable_type, completion_status')
    .eq('sd_id', sdUuid)
    .neq('completion_status', 'completed');

  if (delError || !deliverables) {
    if (!silent) console.log(`   ❌ Failed to fetch deliverables: ${delError?.message}`);
    return { success: false, error: delError?.message };
  }

  if (deliverables.length === 0) {
    if (!silent) console.log('   ✅ All deliverables already completed');
    return { success: true, matched: 0, updated: 0 };
  }

  if (!silent) console.log(`   📦 Found ${deliverables.length} pending deliverables`);

  // Parse git commits (branches are named feat/<sd_key>, never feat/<uuid>)
  const branchCommits = getGitCommits(sdKey, repoPath);
  // DEFECT 3 fix (QF-20260903-950): branch-diff alone is blind to squash-merged SDs (see
  // getMainHistoryCommits doc). A still-open branch and an already-landed squash commit are
  // not mutually exclusive, so search both and merge, deduped by hash.
  const mainCommits = getMainHistoryCommits(sdKey, repoPath);
  const seenHashes = new Set();
  const commits = [...branchCommits, ...mainCommits].filter(c => {
    if (seenHashes.has(c.hash)) return false;
    seenHashes.add(c.hash);
    return true;
  });

  if (commits.length === 0) {
    if (!silent) console.log('   ℹ️  No commits found on SD branch');
    return { success: true, matched: 0, updated: 0 };
  }

  if (!silent) console.log(`   📝 Found ${commits.length} commits to analyze`);

  // Process each commit
  let matchedFiles = 0;
  let updatedDeliverables = 0;
  const fileOperations = [];
  const deliverableUpdates = new Map(); // Track best match per deliverable

  for (const commit of commits) {
    for (const file of commit.files) {
      const match = matchFileToDeliverable(file.path, deliverables);

      const fileOp = {
        sd_id: sdUuid,
        operation_type: file.operation,
        file_path: file.path,
        commit_hash: commit.hash,
        commit_message: commit.message,
        deliverable_id: match?.deliverable.id || null,
        matched_by: match ? 'pattern' : 'unmatched',
        match_confidence: match?.confidence || 0
      };

      fileOperations.push(fileOp);

      if (match) {
        matchedFiles++;

        // Track best match for each deliverable
        const existing = deliverableUpdates.get(match.deliverable.id);
        if (!existing || match.confidence > existing.confidence) {
          deliverableUpdates.set(match.deliverable.id, {
            id: match.deliverable.id,
            name: match.deliverable.deliverable_name,
            commitHash: commit.hash,
            commitMessage: commit.message,
            confidence: match.confidence
          });
        }
      }
    }
  }

  // Insert file operations
  if (fileOperations.length > 0) {
    const { error: insertError } = await supabase
      .from('sd_exec_file_operations')
      .insert(fileOperations);

    if (insertError) {
      if (!silent) console.log(`   ⚠️  Failed to log file operations: ${insertError.message}`);
    } else if (!silent) {
      console.log(`   📁 Logged ${fileOperations.length} file operations`);
    }
  }

  // Update matched deliverables
  for (const [deliverableId, update] of deliverableUpdates) {
    const { error: updateError } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        verified_by: 'EXEC',
        verified_at: new Date().toISOString(),
        completion_evidence: `Git commit ${update.commitHash.substring(0, 7)}: ${update.commitMessage}`,
        completion_notes: `Auto-matched from git history with ${update.confidence}% confidence`,
        metadata: {
          auto_completed: true,
          matched_by: 'git_sync',
          commit_hash: update.commitHash,
          confidence: update.confidence
        }
      })
      .eq('id', deliverableId);

    if (!updateError) {
      updatedDeliverables++;
      if (!silent) {
        console.log(`   ✅ ${update.name} → commit ${update.commitHash.substring(0, 7)} (${update.confidence}%)`);
      }
    }
  }

  // Summary
  if (!silent) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Sync Summary:');
    console.log(`   Commits analyzed: ${commits.length}`);
    console.log(`   Files matched: ${matchedFiles}`);
    console.log(`   Deliverables updated: ${updatedDeliverables}`);
    console.log(`   Match rate: ${deliverables.length > 0 ? Math.round(updatedDeliverables / deliverables.length * 100) : 0}%`);
  }

  return {
    success: true,
    commits: commits.length,
    matched: matchedFiles,
    updated: updatedDeliverables
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node scripts/sync-deliverables-from-git.js <SD-ID> [options]

Options:
  --repo-path <path>  Path to git repository (default: ../ehg relative to EHG_Engineer)
  --help              Show this help message

Example:
  node scripts/sync-deliverables-from-git.js SD-UI-PARITY-001
`);
    process.exit(0);
  }

  const sdId = args[0];
  const repoPathIdx = args.indexOf('--repo-path');
  const repoPath = repoPathIdx !== -1 ? args[repoPathIdx + 1] : EHG_ROOT;

  await syncDeliverables(sdId, { repoPath });
}

// Found while adding real regression coverage for QF-20260903-950 (not one of its 3 named
// defects): main() ran unconditionally at import time, so any test importing this module's
// named exports also ran the CLI against that test process's own argv and called
// process.exit() -- an unhandled rejection that would fail CI independent of the fix above.
// Gated the same way every other script's CLI entry point in this repo is (lib/utils/is-main-
// module.js), so `import { getGitCommits } from './sync-deliverables-from-git.js'` is inert.
if (isMainModule(import.meta.url)) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export {
  syncDeliverables, matchFileToDeliverable, inferTypeFromPath,
  getGitCommits, getMainHistoryCommits, parseCommitLog
};
