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
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolveRepoPath } from '../lib/repo-paths.js';
import { runHardenedGit } from '../lib/git/hardened-runner.cjs';
import { anchoredKeyPattern, LANDED_LOG_MAX_BUFFER_BYTES } from '../lib/drive-loop/score/leg1-landed-alocal.js';
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
 * Parse git commits for an SD or QF key.
 *
 * QF-20260903-950 (defect 3, structural -- supersedes the branch-diff model this function used
 * previously, see git history for defects 1/2 fixed against that model first): a branch-vs-main
 * diff goes blind the moment a PR squash-merges. After a squash-merge the branch's own tip
 * commit becomes an ancestor of main (or the branch ref is reused/fast-forwarded onto the squash
 * commit), so `main..branch` reads ZERO regardless of how much real work landed -- and that is
 * exactly the set of SDs arriving at completion, the case this tool exists to serve.
 *
 * Chairman-ratified alternative (amendment dc828e43, lib/drive-loop/score/leg1-landed-alocal.js):
 * scan EVERY commit subject in the ref's history and end-anchor-match the SD/QF key, never a
 * branch-ancestry diff. Reusing that exact predicate (anchoredKeyPattern) rather than a second,
 * independently-drifting regex -- see that file's header for the full false-positive/negative
 * trade-off this inherits, and LANDED_LOG_MAX_BUFFER_BYTES for why the corpus fetch needs an
 * explicit large buffer (a real full-history subject corpus measured well past Node's 1MB
 * spawnSync default).
 *
 * THROWS on a genuine git failure (via runHardenedGit, lib/git/hardened-runner.cjs, which spawns
 * with an argv array and shell:false and throws on any non-zero exit) -- never silently returns
 * [] for "could not look" (defect 2, the crash-reported-as-zero bug this also fixes for the new
 * model, since the old embedded-shell-redirect crash path no longer exists at all).
 */
function getGitCommits(sdId, repoPath, sinceRef = 'main') {
  const pattern = anchoredKeyPattern(sdId);

  const subjectLog = runHardenedGit(
    ['log', sinceRef, '--format=%H|%s'],
    { cwd: repoPath, maxBuffer: LANDED_LOG_MAX_BUFFER_BYTES }
  );

  const matchingHashes = subjectLog.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const sep = line.indexOf('|');
      return sep === -1 ? null : { hash: line.slice(0, sep), subject: line.slice(sep + 1) };
    })
    .filter(row => row && pattern.test(row.subject))
    .map(row => row.hash);

  return matchingHashes.map(hash => parseCommitNameStatus(hash, repoPath));
}

/**
 * Fetch and parse ONE commit's file changes. Only called for a commit whose subject already
 * end-anchor-matched the key, so this never runs once per commit on main -- only once per
 * commit actually landed under this key.
 */
function parseCommitNameStatus(hash, repoPath) {
  const out = runHardenedGit(
    ['show', hash, '--name-status', '--format=%H|%s|%ai'],
    { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
  );
  const [header, ...rest] = out.split('\n');
  const [commitHash, message, date] = header.split('|');
  const files = [];
  for (const line of rest) {
    const fileMatch = line.match(/^([AMD])\t(.+)$/);
    if (fileMatch) {
      files.push({
        operation: fileMatch[1] === 'A' ? 'create' : fileMatch[1] === 'M' ? 'modify' : 'delete',
        path: fileMatch[2]
      });
    }
  }
  return { hash: commitHash, message, date, files };
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

  // Parse git commits (branches are named feat/<sd_key>, never feat/<uuid>). getGitCommits now
  // THROWS on a genuine git failure (QF-20260903-950 defect 2) -- a crash must be reported as a
  // failure, never folded into the same "0 commits" success path a real empty result takes.
  let commits;
  try {
    commits = getGitCommits(sdKey, repoPath);
  } catch (error) {
    if (!silent) console.log(`   ❌ Could not read git history: ${error.message}`);
    return { success: false, error: error.message };
  }

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

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

export { syncDeliverables, matchFileToDeliverable, inferTypeFromPath };
